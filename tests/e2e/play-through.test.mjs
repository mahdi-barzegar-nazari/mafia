/**
 * Step 3B in a real Chromium at 360x740 against the PRODUCTION build: whole games played through the real buttons,
 * from the first night to the end screen. The roles are the ones the game dealt (read from the saved game in
 * localStorage), so the test chooses its targets: who the mafia kill, who the doctor saves, who the detective
 * checks, who is voted out. What a person at the table reads is checked against the catalogs:
 *
 *  - a game won by the town (every mafia member voted out) and one won by the mafia (night kills), the end screen with
 *    the winner and every role;
 *  - a night the doctor stopped ("nobody died") and the moderator note about it;
 *  - the doctor's own name in the list, per rule (never / once / always);
 *  - a tied vote eliminates nobody;
 *  - the godfather reads as innocent in the moderator notes, a plain mafia member as mafia;
 *  - a doctor or a detective who is out is "nobody alive", with the line to pause as if calling them.
 * Undo, reload, the hidden roles and notes, the double tap and the keyboard are in play-chrome.test.mjs; the layout in
 * play-layout-*.test.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startApp } from './helpers/app.mjs';
import { assertFitsPhone, assertTouchTargets, castVotes, chooseTarget, currentStep, digits, fromDusk, idsWithRole, offeredIds, playNight, roleName, savedRecord, savedState, say, screenNow, startGame, stepStatuses, textIn, toDay, withGame } from './helpers/game.mjs';

let app;
let browser;
let baseUrl;

before(async () => {
    app = await startApp();
    ({ browser, baseUrl } = app);
});
after(async () => {
    await app?.stop();
});

const game = (fn, options) => withGame(browser, baseUrl, fn, options);
const plain = (text) => text.replace(/[\u2068\u2069]/g, '');
const nameOf = (players, id) => players[Number(id.slice(1)) - 1].name;
const roleOf = (players, id) => players[Number(id.slice(1)) - 1].role;
const text = async (page, selector) => plain(await textIn(page, selector));
const noteTexts = (page) => page.locator('#morning-notes-list li').allTextContents().then((all) => all.map(plain));

/** The people of a dealt game, by role: the mafia team (the godfather first when there is one), the doctor, the detective, the citizens. */
function cast(players) {
    const team = idsWithRole(players, 'godfather', 'mafia');
    return { team, godfather: idsWithRole(players, 'godfather')[0], mafia: idsWithRole(players, 'mafia'), doctor: idsWithRole(players, 'doctor')[0], detective: idsWithRole(players, 'detective')[0], citizens: idsWithRole(players, 'citizen') };
}

describe('a game won by the town', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: the mafia are voted out one after the other, and the end screen shows the winner and every role`, async () => {
            await game(
                async (page) => {
                    const players = await startGame(page, lang, 8);
                    const c = cast(players);
                    const [firstOut, secondOut] = c.team;
                    assert.equal(c.team.length, 2);

                    // Night 1: the three steps in order, then the morning with who died and the role.
                    assert.equal(await text(page, '#title-night'), say(lang, 'game.heading.night', { n: digits(1, lang) }));
                    assert.deepEqual(await stepStatuses(page), ['current', 'waiting', 'waiting']);
                    await assertFitsPhone(page, 'night 1');
                    await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: firstOut });
                    assert.equal(await screenNow(page), 'morning');
                    assert.equal(await text(page, '#title-morning'), say(lang, 'game.heading.morning', { n: digits(1, lang) }));
                    assert.equal(await text(page, '#morning-announcement'), say(lang, 'morning.death.role', { name: nameOf(players, c.citizens[0]), role: roleName(lang, 'citizen') }));
                    await toDay(page);

                    // Day 1: the first mafia member gets three votes, and the dusk says who it was and what they were.
                    assert.equal(await text(page, '#title-day'), say(lang, 'game.heading.day', { n: digits(1, lang) }));
                    await assertFitsPhone(page, 'day 1');
                    await castVotes(page, { [firstOut]: 3 });
                    assert.equal(await text(page, '#dusk-result'), say(lang, 'dusk.eliminated.role', { name: nameOf(players, firstOut), role: roleName(lang, roleOf(players, firstOut)) }));
                    await fromDusk(page);

                    // Night 2: the second mafia member is the last one.
                    assert.equal(await screenNow(page), 'night');
                    assert.equal(await text(page, '#title-night'), say(lang, 'game.heading.night', { n: digits(2, lang) }));
                    await playNight(page, { mafia: c.citizens[1], doctor: c.citizens[2], detective: secondOut });
                    await toDay(page);
                    await castVotes(page, { [secondOut]: 3 });
                    await fromDusk(page);

                    // The end: who won, every player with the role and the mark, no toggle, a "new game" with no question.
                    assert.equal(await screenNow(page), 'ended');
                    assert.equal(await text(page, '#title-ended'), say(lang, 'game.heading.ended', { n: digits(2, lang) }));
                    assert.equal(await text(page, '#ended-winner'), say(lang, 'ended.winner.town'));
                    const rows = await page.locator('#players-list .player-row').evaluateAll((els) => els.map((el) => ({ name: el.querySelector('.player-name').textContent, role: el.querySelector('.player-role')?.textContent ?? null, alive: el.dataset.alive })));
                    assert.deepEqual(rows.map((r) => r.name), players.map((p) => p.name));
                    assert.deepEqual(rows.map((r) => r.role), players.map((p) => roleName(lang, p.role)));
                    const out = new Set([c.citizens[0], c.citizens[1], firstOut, secondOut]);
                    assert.deepEqual(rows.map((r) => r.alive), players.map((p, i) => String(!out.has(`p${i + 1}`))));
                    assert.equal(await page.isVisible('#btn-roles-toggle'), false, 'no toggle: the game is over');
                    assert.equal(await page.isVisible('#btn-new-game'), false, 'the end screen has its own');
                    assert.equal(await page.isVisible('#btn-ended-new-game'), true);
                    assert.equal(await page.isEnabled('#btn-undo'), true);
                    assert.match(await text(page, '#game-live'), new RegExp(say(lang, 'ended.winner.town')));
                    await assertFitsPhone(page, 'ended');
                    await assertTouchTargets(page, 'ended');
                    assert.equal((await savedState(page)).phase, 'ended');

                    await page.click('#btn-ended-new-game');
                    await page.waitForSelector('#screen-welcome:not(.hidden)');
                    assert.equal(await page.isVisible('#confirm-modal'), false, 'no question at the end of a game');
                    assert.equal(await savedRecord(page), null, 'the save is gone');
                    assert.equal(await page.isVisible('#btn-resume-game'), false);
                },
                { lang }
            );
        });
    }
});

describe('a game won by the mafia', () => {
    it('en: four nights of kills with nobody voted out; zero votes is allowed; the end screen says the mafia win', async () => {
        await game(
            async (page) => {
                const lang = 'en';
                const players = await startGame(page, lang, 8);
                const c = cast(players);
                for (let night = 0; night < 4; night++) {
                    assert.equal(await text(page, '#title-night'), say(lang, 'game.heading.night', { n: night + 1 }));
                    // The doctor saves the detective, never the one the mafia took.
                    await playNight(page, { mafia: c.citizens[night], doctor: c.detective, detective: c.team[0] });
                    assert.equal(await text(page, '#morning-announcement'), say(lang, 'morning.death.role', { name: nameOf(players, c.citizens[night]), role: roleName(lang, 'citizen') }));
                    if (night === 3) break;
                    await toDay(page);
                    await castVotes(page, {}); // nobody gets a vote: nobody is eliminated
                    assert.equal(await text(page, '#dusk-result'), say(lang, 'dusk.none'));
                    await fromDusk(page);
                }
                // The mafia (2) now equal the town (doctor and detective): the morning does not announce the winner.
                assert.ok(!(await text(page, '#screen-morning')).includes(say(lang, 'ended.winner.mafia')));
                await page.click('#btn-morning-continue');
                await page.waitForSelector('#screen-ended:not(.hidden)');
                assert.equal(await text(page, '#ended-winner'), say(lang, 'ended.winner.mafia'));
                assert.equal(await text(page, '#title-ended'), say(lang, 'game.heading.ended', { n: 4 }));
                const rows = await page.locator('#players-list .player-row').evaluateAll((els) => els.map((el) => `${el.querySelector('.player-role').textContent}|${el.dataset.alive}`));
                assert.deepEqual(rows, players.map((p, i) => `${roleName(lang, p.role)}|${String(!c.citizens.includes(`p${i + 1}`))}`));
                assert.equal((await savedState(page)).phase, 'ended');
            },
            { lang: 'en' }
        );
    });
});

describe('a night the doctor stopped', () => {
    it('fa: "nobody died", and the moderator notes say who the doctor saved and what the detective learned', async () => {
        await game(async (page) => {
            const lang = 'fa';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[0], detective: c.mafia[0] ?? c.team[0] });
            assert.equal(await text(page, '#morning-announcement'), say(lang, 'morning.nobody'));
            await page.click('#btn-morning-notes');
            const checked = c.mafia[0] ?? c.team[0];
            const checkKey = roleOf(players, checked) === 'godfather' ? 'morning.note.check.innocent' : 'morning.note.check.mafia';
            assert.deepEqual(await noteTexts(page), [say(lang, checkKey, { name: nameOf(players, checked) }), say(lang, 'morning.note.saved', { name: nameOf(players, c.citizens[0]) })]);
            // Everybody is still there on the day and in the panel.
            await toDay(page);
            assert.equal(await page.locator('#vote-list li').count(), 8);
            assert.equal(await page.locator('#players-list .player-row.is-dead').count(), 0);
        });
    });
});

describe('the doctor saving themselves', () => {
    /** Night 1 (the mafia kill the doctor), then an empty vote and the second night up to the doctor's step. */
    async function toSecondNightsDoctor(page, c, doctorTarget) {
        await playNight(page, { mafia: c.doctor, doctor: doctorTarget, detective: c.team[0] });
        await toDay(page);
        await castVotes(page, {});
        await fromDusk(page);
        await chooseTarget(page, c.citizens[0]); // the mafia step of night 2
        assert.equal(await currentStep(page), 'doctor');
    }

    it('never: the doctor\'s name is not in the list, and the screen says why', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8, { doctorSelfSave: 'never' });
            const c = cast(players);
            await chooseTarget(page, c.citizens[0]);
            assert.equal(await currentStep(page), 'doctor');
            const offered = await offeredIds(page);
            assert.ok(!offered.includes(c.doctor), 'the doctor is not offered');
            assert.equal(offered.length, 7);
            assert.equal(await page.isVisible('#night-doctor-note'), true);
            assert.equal(await text(page, '#night-doctor-note'), say('en', 'night.doctor.noSelf'));
            assert.equal(await text(page, '#night-instruction'), say('en', 'night.do.doctor'));
            // the detective's own name is never in the detective's list either
            await chooseTarget(page, c.citizens[1]);
            assert.equal(await currentStep(page), 'detective');
            assert.ok(!(await offeredIds(page)).includes(c.detective));
            assert.equal(await page.isVisible('#night-doctor-note'), false, 'the note is only for the doctor\'s step');
        }, { lang: 'en' });
    });

    it('once: allowed on the first night, gone from the second', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8, { doctorSelfSave: 'once' });
            const c = cast(players);
            await chooseTarget(page, c.citizens[0]);
            assert.ok((await offeredIds(page)).includes(c.doctor), 'night 1: offered');
            assert.equal(await page.isVisible('#night-doctor-note'), false);
            // The doctor saves themselves (and the mafia took somebody else): the second night no longer offers it.
            await chooseTarget(page, c.doctor);
            await chooseTarget(page, c.team[0]);
            await toDay(page);
            await castVotes(page, {});
            await fromDusk(page);
            await chooseTarget(page, c.citizens[1]);
            assert.equal(await currentStep(page), 'doctor');
            assert.ok(!(await offeredIds(page)).includes(c.doctor), 'night 2: not offered');
            assert.equal(await text(page, '#night-doctor-note'), say('en', 'night.doctor.noSelf'));
        }, { lang: 'en' });
    });

    it('once: the self-save that stops the kill of the doctor is a night where nobody died', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8, { doctorSelfSave: 'once' });
            const c = cast(players);
            await playNight(page, { mafia: c.doctor, doctor: c.doctor, detective: c.team[0] });
            assert.equal(await text(page, '#morning-announcement'), say('en', 'morning.nobody'));
        }, { lang: 'en' });
    });

    it('always: offered on every night', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8, { doctorSelfSave: 'always' });
            const c = cast(players);
            await toSecondNightsDoctor(page, c, c.doctor);
            // the doctor saved themselves on night 1 (the mafia had taken them): alive, and offered again
            assert.ok((await offeredIds(page)).includes(c.doctor));
            assert.equal(await page.isVisible('#night-doctor-note'), false);
        }, { lang: 'en' });
    });
});

describe('a tied vote', () => {
    it('en: two players with two votes each: nobody is eliminated, and the dusk says so', async () => {
        await game(async (page) => {
            const lang = 'en';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await toDay(page);
            await castVotes(page, { [c.citizens[1]]: 2, [c.citizens[2]]: 2 });
            assert.equal(await text(page, '#dusk-result'), say(lang, 'dusk.tie'));
            assert.equal(await page.locator('#players-list .player-row.is-dead').count(), 1, 'only the night\'s victim is out');
            assert.ok(!(await text(page, '#dusk-result')).includes('was eliminated'));
            await fromDusk(page);
            assert.equal(await screenNow(page), 'night');
            assert.equal(await page.locator('#night-targets button').count(), 7);
        }, { lang: 'en' });
    });

    it('fa: the same in Persian', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'fa', 8);
            const c = cast(players);
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await toDay(page);
            await castVotes(page, { [c.citizens[2]]: 1, [c.citizens[3]]: 1, [c.team[0]]: 1 });
            assert.equal(await text(page, '#dusk-result'), say('fa', 'dusk.tie'));
        });
    });
});

describe('what the detective learned, in the moderator notes', () => {
    it('en: the godfather reads as "not mafia", a plain mafia member as "mafia"', async () => {
        await game(async (page) => {
            const lang = 'en';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            assert.ok(c.godfather, 'the game has a godfather');
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.godfather });
            await page.click('#btn-morning-notes');
            assert.deepEqual(await noteTexts(page), [say(lang, 'morning.note.check.innocent', { name: nameOf(players, c.godfather) })]);
            await toDay(page);
            await castVotes(page, {});
            await fromDusk(page);
            await playNight(page, { mafia: c.citizens[1], doctor: c.citizens[2], detective: c.mafia[0] });
            await page.click('#btn-morning-notes');
            assert.deepEqual(await noteTexts(page), [say(lang, 'morning.note.check.mafia', { name: nameOf(players, c.mafia[0]) })]);
            // a citizen is "not mafia" too
            await toDay(page);
            await castVotes(page, {});
            await fromDusk(page);
            await playNight(page, { mafia: c.citizens[2], doctor: c.citizens[3], detective: c.citizens[3] });
            await page.click('#btn-morning-notes');
            // the doctor saved somebody else than the one the mafia took, so there is no "saved" note
            assert.deepEqual(await noteTexts(page), [say(lang, 'morning.note.check.innocent', { name: nameOf(players, c.citizens[3]) })]);
        }, { lang: 'en' });
    });
});

describe('a doctor or a detective who is out', () => {
    it('en: the step stays in the list as "nobody alive", with the line to pause as if calling them; the night is shorter', async () => {
        await game(async (page) => {
            const lang = 'en';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            // Night 1: the mafia take the doctor. Day 1: the detective is voted out.
            await playNight(page, { mafia: c.doctor, doctor: c.citizens[0], detective: c.team[0] });
            await toDay(page);
            await castVotes(page, { [c.detective]: 3 });
            await fromDusk(page);

            // Night 2: both are out.
            assert.deepEqual(await stepStatuses(page), ['current', 'nobody', 'nobody']);
            const items = await page.locator('#night-steps li').evaluateAll((els) => els.map((el) => ({ status: el.querySelector('.step-status').textContent, pause: el.querySelector('.step-pause')?.textContent ?? null })));
            assert.deepEqual(items, [
                { status: say(lang, 'night.status.current'), pause: null },
                { status: say(lang, 'night.status.nobody'), pause: say(lang, 'night.pause.doctor') },
                { status: say(lang, 'night.status.nobody'), pause: say(lang, 'night.pause.detective') }
            ]);
            assert.equal(await text(page, '#night-instruction'), say(lang, c.godfather ? 'night.do.mafia.godfather' : 'night.do.mafia.plain'));
            await assertFitsPhone(page, 'night with two steps nobody is alive for');
            // The mafia step is the only one: recording it resolves the night.
            await chooseTarget(page, c.citizens[1]);
            await page.waitForSelector('#screen-morning:not(.hidden)');
            assert.equal(await text(page, '#morning-announcement'), say(lang, 'morning.death.role', { name: nameOf(players, c.citizens[1]), role: roleName(lang, 'citizen') }));
        }, { lang: 'en' });
    });

    it('fa: a detective who is out is "nobody alive" and the doctor still plays', async () => {
        await game(async (page) => {
            const lang = 'fa';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            await playNight(page, { mafia: c.detective, doctor: c.citizens[0], detective: c.team[0] });
            await toDay(page);
            await castVotes(page, {});
            await fromDusk(page);
            assert.deepEqual(await stepStatuses(page), ['current', 'waiting', 'nobody']);
            assert.equal(await page.locator('#night-steps li .step-pause').first().textContent(), say(lang, 'night.pause.detective'));
            await chooseTarget(page, c.citizens[1]);
            assert.equal(await currentStep(page), 'doctor');
            await chooseTarget(page, c.citizens[2]);
            await page.waitForSelector('#screen-morning:not(.hidden)');
        });
    });
});
