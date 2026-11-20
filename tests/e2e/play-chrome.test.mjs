/**
 * Step 3B in a real Chromium at 360x740 against the PRODUCTION build: what surrounds the moves of a game.
 *
 *  - undo, at every phase and from the end screen all the way back to the first night; it is disabled at the start;
 *  - a reload at every phase and every step of the night restores the same screen and the same step, nothing picked;
 *  - the roles of the players panel and the moderator notes are out of the page by default, after the page goes
 *    away and after the phase changes (their texts are not in the DOM, not only invisible);
 *  - the night screen shows nothing about what was chosen;
 *  - a double tap on "Hide and pass on" shows no second card (a real double click), and the 800 ms boundary;
 *  - a night and a vote with the keyboard only; the live line and the focus after every step;
 *  - the language switch is locked during the game and free after "new game".
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startApp } from './helpers/app.mjs';
import { GUARD_MS, assertFitsPhone, assertNoRoleInPage, assertNotInPage, castVotes, chooseTarget, dealGame, digits, fromDusk, handOff, idsWithRole, pageGoesAway, passReveal, pick, playNight, roleName, savedRecord, savedState, say, screenNow, startGame, stepStatuses, textIn, toDay, withGame } from './helpers/game.mjs';

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
const text = async (page, selector) => plain(await textIn(page, selector));
const nameOf = (players, id) => players[Number(id.slice(1)) - 1].name;
const activeId = (page) => page.evaluate(() => document.activeElement.id || document.activeElement.tagName);

function cast(players) {
    const team = idsWithRole(players, 'godfather', 'mafia');
    return { team, godfather: idsWithRole(players, 'godfather')[0], doctor: idsWithRole(players, 'doctor')[0], detective: idsWithRole(players, 'detective')[0], citizens: idsWithRole(players, 'citizen') };
}

async function reload(page) {
    await page.reload();
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}
async function resume(page) {
    await page.click('#btn-resume-game');
    await page.waitForSelector('#screen-welcome.hidden', { state: 'attached' });
}
const actionCount = async (page) => (await savedState(page)).game.actions.length;
/** Which of the three steps are done/current/waiting/nobody right now, and which names are pressed. */
const pressedIds = (page) => page.evaluate(() => [...document.querySelectorAll('#night-targets button[aria-pressed="true"]')].map((b) => b.dataset.id));

/**
 * The 8-player game the town wins in two rounds, as a list of steps; each step is one press of the buttons. Between the
 * steps `afterStep(k, expectedPhase)` is called with the number of actions the game now has.
 */
function townGame(players) {
    const c = cast(players);
    const [a, b] = c.team;
    return [
        // the night is three steps: after each one the game has one action more
        async (page) => chooseTarget(page, c.citizens[0]),
        async (page) => chooseTarget(page, c.citizens[1]),
        async (page) => chooseTarget(page, a),
        async (page) => toDay(page),
        async (page) => castVotes(page, { [a]: 3 }),
        async (page) => fromDusk(page),
        async (page) => chooseTarget(page, c.citizens[1]),
        async (page) => chooseTarget(page, c.citizens[2]),
        async (page) => chooseTarget(page, b),
        async (page) => toDay(page),
        async (page) => castVotes(page, { [b]: 3 }),
        async (page) => fromDusk(page)
    ].map((step) => step);
}
// the screen after k actions of that game
const PHASE_AFTER = ['night', 'night', 'night', 'morning', 'day', 'dusk', 'night', 'night', 'night', 'morning', 'day', 'dusk', 'ended'];

describe('undo', () => {
    it('en: disabled at the start, then it takes the game back one move at a time, from the end screen to the first night', async () => {
        await game(
            async (page) => {
                const lang = 'en';
                const players = await startGame(page, lang, 8);
                assert.equal(await page.isDisabled('#btn-undo'), true, 'nothing to undo at the start');
                const steps = townGame(players);
                const where = async (k) => {
                    assert.equal(await screenNow(page), PHASE_AFTER[k], `after ${k} action(s)`);
                    assert.equal(await actionCount(page), k, `saved after ${k} action(s)`);
                    assert.equal((await savedState(page)).phase, PHASE_AFTER[k]);
                    assert.equal(await page.isDisabled('#btn-undo'), k === 0, `undo after ${k}`);
                };
                await where(0);
                for (let k = 1; k <= steps.length; k++) {
                    await steps[k - 1](page);
                    await where(k);
                }
                assert.equal(await screenNow(page), 'ended');
                // Undo, all the way back: each press takes exactly one move away and draws the screen from the new state.
                for (let k = steps.length - 1; k >= 0; k--) {
                    await page.click('#btn-undo');
                    await where(k);
                    if (PHASE_AFTER[k] === 'night') {
                        // k actions of the game: the first night has 0-2, the second 6-8; the steps done are those of this night
                        const statuses = await stepStatuses(page);
                        assert.equal(statuses.filter((s) => s === 'done').length, k >= 6 ? k - 6 : k, `night steps after undo to ${k}`);
                        assert.equal(statuses.filter((s) => s === 'current').length, 1);
                        assert.deepEqual(await pressedIds(page), [], 'nothing is picked after an undo');
                    }
                    if (PHASE_AFTER[k] === 'day') assert.equal(await text(page, '#day-counter'), say(lang, 'day.counter.other', { used: 0, count: await page.locator('#vote-list li').count() }), 'the votes start from zero again');
                }
                assert.equal(await screenNow(page), 'night');
                assert.equal(await text(page, '#title-night'), say(lang, 'game.heading.night', { n: 1 }));
                assert.deepEqual(await stepStatuses(page), ['current', 'waiting', 'waiting']);
                // And forward again: the same game can be played on from the first night.
                await steps[0](page);
                await where(1);
            },
            { lang: 'en' }
        );
    });

    it('fa: undo after a single night step goes back inside the same night; undo from the morning goes back to the last step', async () => {
        await game(async (page) => {
            const lang = 'fa';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            await chooseTarget(page, c.citizens[0]);
            assert.deepEqual(await stepStatuses(page), ['done', 'current', 'waiting']);
            await page.click('#btn-undo');
            assert.deepEqual(await stepStatuses(page), ['current', 'waiting', 'waiting']);
            assert.equal(await text(page, '#night-instruction'), say(lang, c.godfather ? 'night.do.mafia.godfather' : 'night.do.mafia.plain'), 'the mafia instruction is back');
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await page.click('#btn-undo');
            assert.equal(await screenNow(page), 'night');
            assert.deepEqual(await stepStatuses(page), ['done', 'done', 'current']);
            assert.equal(await page.isDisabled('#btn-night-confirm'), true);
            // the same step can be played again, with another target
            await chooseTarget(page, c.citizens[3]);
            assert.equal(await screenNow(page), 'morning');
        });
    });

    it('the morning\'s notes and the day\'s votes start closed and empty after an undo', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8);
            const c = cast(players);
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await page.click('#btn-morning-notes');
            await toDay(page);
            await page.click(`#vote-list li[data-id="${c.team[0]}"] .stepper-plus`);
            await page.click('#btn-undo'); // day -> morning
            assert.equal(await screenNow(page), 'morning');
            assert.equal(await page.getAttribute('#btn-morning-notes', 'aria-expanded'), 'false');
            assert.equal(await page.locator('#morning-notes-list li').count(), 0);
            await toDay(page);
            assert.equal(await text(page, '#day-counter'), say('en', 'day.counter.other', { used: 0, count: 7 }), 'seven are alive: the night took one');
        }, { lang: 'en' });
    });
});

describe('a reload', () => {
    it('on every screen and every step of the night: the same screen, the same step, nothing picked, nothing shown', async () => {
        await game(async (page) => {
            const lang = 'fa';
            const players = await dealGame(page, lang, 8);
            const { revealRoleOnDeath } = (await savedState(page)).game.setup.rules;
            assert.equal(revealRoleOnDeath, true);
            await passReveal(page, 8);
            const steps = townGame(players);
            for (let k = 0; k <= steps.length; k++) {
                const before = { screen: await screenNow(page), statuses: await stepStatuses(page), heading: await text(page, `#title-${PHASE_AFTER[k]}`), actions: await actionCount(page) };
                if (PHASE_AFTER[k] === 'night') await pick(page, (await page.locator('#night-targets button').first().getAttribute('data-id')));
                if (PHASE_AFTER[k] !== 'ended') await page.click('#btn-roles-toggle');
                if (PHASE_AFTER[k] === 'morning') await page.click('#btn-morning-notes');
                await reload(page);
                await resume(page);
                assert.equal(await screenNow(page), PHASE_AFTER[k], `after ${k} action(s), reloaded`);
                assert.equal(await text(page, `#title-${PHASE_AFTER[k]}`), before.heading, `heading after ${k}`);
                assert.equal(await actionCount(page), before.actions);
                if (PHASE_AFTER[k] === 'night') {
                    assert.deepEqual(await stepStatuses(page), before.statuses, `the step after ${k} action(s)`);
                    assert.deepEqual(await pressedIds(page), [], 'nothing is selected after a reload');
                    assert.equal(await page.isDisabled('#btn-night-confirm'), true);
                }
                if (PHASE_AFTER[k] === 'morning') assert.equal(await page.locator('#morning-notes-list li').count(), 0, 'the notes are closed');
                if (PHASE_AFTER[k] === 'day') assert.equal(await text(page, '#day-counter'), say(lang, 'day.counter.other', { used: digits(0, lang), count: digits(await page.locator('#vote-list li').count(), lang) }));
                if (PHASE_AFTER[k] !== 'ended') assert.equal(await page.locator('#players-list .player-role').count(), 0, 'the roles are hidden after a reload');
                assert.equal(await page.isDisabled('#btn-undo'), k === 0);
                if (k < steps.length) await steps[k](page);
            }
        });
    });

    it('a reload in the middle of the night does not bring back a picked name', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8);
            const c = cast(players);
            await chooseTarget(page, c.citizens[0]);
            await pick(page, c.citizens[1]);
            assert.deepEqual(await pressedIds(page), [c.citizens[1]]);
            assert.equal(await page.isEnabled('#btn-night-confirm'), true);
            await reload(page);
            await resume(page);
            assert.equal(await screenNow(page), 'night');
            assert.deepEqual(await stepStatuses(page), ['done', 'current', 'waiting']);
            assert.deepEqual(await pressedIds(page), []);
            assert.equal(await page.isDisabled('#btn-night-confirm'), true);
            assert.ok(!JSON.stringify(await savedRecord(page)).includes('nightTarget'), 'a pick is never saved');
            assert.equal(await actionCount(page), 1);
        }, { lang: 'en' });
    });
});

describe('roles and moderator notes are not in the page unless asked for', () => {
    for (const lang of ['fa', 'en']) {
        it(`${lang}: the roles of the players panel: hidden by default, gone again after the page goes away and after the phase changes`, async () => {
            await game(
                async (page) => {
                    const players = await startGame(page, lang, 8, { revealRoleOnDeath: false });
                    const c = cast(players);
                    const hidden = async (where) => {
                        assert.equal(await page.locator('#players-list .player-role').count(), 0, `${where}: no role in the panel`);
                        await assertNoRoleInPage(page, where);
                        assert.equal(await page.getAttribute('#btn-roles-toggle', 'aria-pressed'), 'false', where);
                        assert.equal(await page.textContent('#btn-roles-toggle'), say(lang, 'game.roles.show'), where);
                    };
                    const shownNow = async (where) => {
                        assert.deepEqual(await page.locator('#players-list .player-role').allTextContents(), players.map((p) => roleName(lang, p.role)), where);
                        assert.equal(await page.getAttribute('#btn-roles-toggle', 'aria-pressed'), 'true', where);
                        assert.equal(await page.textContent('#btn-roles-toggle'), say(lang, 'game.roles.hide'), where);
                    };
                    await hidden('night');
                    await page.click('#btn-roles-toggle');
                    await shownNow('night, asked for');
                    for (const how of ['pagehide', 'visibilitychange']) {
                        await pageGoesAway(page, how);
                        await hidden(`night after ${how}`);
                        await page.click('#btn-roles-toggle');
                        await shownNow(`night, asked for again (${how})`);
                    }
                    // The roles stay while the night goes on (the step changes, the phase does not) and go when the phase changes.
                    await chooseTarget(page, c.citizens[0]);
                    await shownNow('same night, next step');
                    await chooseTarget(page, c.citizens[1]);
                    await chooseTarget(page, c.team[0]);
                    assert.equal(await screenNow(page), 'morning');
                    await hidden('morning');
                    await page.click('#btn-roles-toggle');
                    await page.click('#btn-morning-continue');
                    await page.waitForSelector('#screen-day:not(.hidden)');
                    await hidden('day');
                    await page.click('#btn-roles-toggle');
                    await page.click('#btn-vote-close');
                    await page.waitForSelector('#screen-dusk:not(.hidden)');
                    await hidden('dusk');
                    await page.click('#btn-roles-toggle');
                    await shownNow('dusk, asked for');
                    await page.click('#btn-undo'); // dusk -> day: a phase change too
                    await hidden('day after undo');
                    // The rules (a collapsed <details>) close with the phase too.
                    await page.locator('#rules-details summary').click();
                    assert.equal(await page.getAttribute('#rules-details', 'open'), '');
                    await page.click('#btn-vote-close');
                    await page.waitForSelector('#screen-dusk:not(.hidden)');
                    assert.equal(await page.getAttribute('#rules-details', 'open'), null, 'the rules are closed again on a new screen');
                },
                { lang }
            );
        });
    }

    it('en: the moderator notes: closed by default, texts not in the DOM, closed again after pagehide, visibilitychange and a phase change', async () => {
        await game(async (page) => {
            const lang = 'en';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            const checked = c.godfather ?? c.team[0];
            const noteLine = say(lang, 'morning.note.check.innocent', { name: nameOf(players, checked) });
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[0], detective: checked });
            const savedLine = say(lang, 'morning.note.saved', { name: nameOf(players, c.citizens[0]) });
            const closed = async (where) => {
                assert.equal(await page.getAttribute('#btn-morning-notes', 'aria-expanded'), 'false', where);
                assert.equal(await page.textContent('#btn-morning-notes'), say(lang, 'morning.notes.show'), where);
                assert.equal(await page.isVisible('#morning-notes'), false, where);
                assert.equal(await page.locator('#morning-notes-list *').count(), 0, `${where}: the notes are not in the DOM`);
                for (const line of [noteLine, savedLine]) await assertNotInPage(page, plain(line), where);
            };
            await closed('by default');
            const open = async (where) => {
                await page.click('#btn-morning-notes');
                assert.equal(await page.getAttribute('#btn-morning-notes', 'aria-expanded'), 'true', where);
                assert.equal(await page.textContent('#btn-morning-notes'), say(lang, 'morning.notes.hide'), where);
                assert.deepEqual((await page.locator('#morning-notes-list li').allTextContents()).map(plain), [c.godfather ? noteLine : say(lang, 'morning.note.check.mafia', { name: nameOf(players, checked) }), savedLine], where);
            };
            await open('first time');
            await assertFitsPhone(page, 'morning, notes open');
            await page.click('#btn-morning-notes');
            await closed('closed by the button');
            for (const how of ['pagehide', 'visibilitychange']) {
                await open(how);
                await pageGoesAway(page, how);
                await closed(`after ${how}`);
            }
            await open('before a phase change');
            await page.click('#btn-morning-continue');
            await page.waitForSelector('#screen-day:not(.hidden)');
            await page.click('#btn-undo');
            await page.waitForSelector('#screen-morning:not(.hidden)');
            await closed('after the phase changed and came back');
        }, { lang: 'en' });
    });
});

describe('the night screen shows nothing about what was chosen', () => {
    it('fa: after each step only "done" is marked, no name is picked or repeated, not on the next step and not after the night', async () => {
        await game(async (page) => {
            const lang = 'fa';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            const chosen = [c.citizens[0], c.citizens[1], c.team[0]];
            const nothingAbout = async (id, where) => {
                const name = nameOf(players, id);
                for (const selector of ['#night-steps', '#night-instruction', '#night-doctor-note', '#title-night', '#game-live']) {
                    assert.ok(!(await textIn(page, selector)).includes(name), `${where}: ${name} is in ${selector}`);
                }
                assert.deepEqual(await pressedIds(page), [], `${where}: nothing is marked`);
            };
            for (let step = 0; step < 3; step++) {
                await pick(page, chosen[step]);
                assert.deepEqual(await pressedIds(page), [chosen[step]]);
                await page.click('#btn-night-confirm');
                if (step < 2) {
                    assert.deepEqual((await stepStatuses(page)).slice(0, step + 1), Array(step + 1).fill('done'));
                    await nothingAbout(chosen[step], `after step ${step + 1}`);
                    assert.equal(await page.isDisabled('#btn-night-confirm'), true);
                }
            }
            assert.equal(await screenNow(page), 'morning');
            // The night screen is no longer showing: what it holds names nobody and picks nobody.
            for (const id of chosen) {
                const name = nameOf(players, id);
                assert.ok(!(await textIn(page, '#night-steps')).includes(name));
            }
            assert.deepEqual(await pressedIds(page), []);
        });
    });
});

describe('a double tap on "Hide and pass on"', () => {
    it('a real double click shows no second card, and nobody is skipped', async () => {
        await game(async (page) => {
            await dealGame(page, 'fa', 8);
            const rect = (selector) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, selector);
            let doubled = 0;
            for (let k = 0; k < 7; k++) {
                const gate = await rect('#btn-reveal-show');
                await page.click('#btn-reveal-show');
                const hide = await rect('#btn-reveal-hide');
                // From the second gate on every gate has the same layout (names of the same length), so this gate's button
                // is where the next one will be: a point on both is where the second tap of a double tap lands.
                const top = Math.max(gate.top, hide.top);
                const bottom = Math.min(gate.bottom, hide.bottom);
                if (k >= 1 && bottom - top > 10) {
                    const x = (Math.max(gate.left, hide.left) + Math.min(gate.right, hide.right)) / 2;
                    const y = (top + bottom) / 2;
                    await page.mouse.dblclick(x, y);
                    await page.waitForSelector('#reveal-gate:not(.hidden)');
                    assert.equal(await page.locator('#reveal-card-body > *').count(), 0, `player ${k + 1}: the second tap showed no card`);
                    await assertNoRoleInPage(page, `after the double click on card ${k + 1}`);
                    assert.equal((await savedState(page)).reveal.index, k + 1, 'exactly one player was passed on');
                    assert.equal(await page.isHidden('#reveal-card'), true);
                    doubled++;
                } else {
                    await page.click('#btn-reveal-hide');
                }
                await handOff(page);
            }
            assert.ok(doubled >= 2, `the double click was tried on ${doubled} cards that overlap the next gate's button (the test must try it)`);
        });
    });

    it('en: on the last card the second tap lands on the first night and does nothing there', async () => {
        await game(async (page) => {
            await dealGame(page, 'en', 6, { godfather: false });
            for (let k = 0; k < 5; k++) {
                await page.click('#btn-reveal-show');
                await page.click('#btn-reveal-hide');
                await handOff(page);
            }
            await page.click('#btn-reveal-show');
            const hide = await page.evaluate(() => { const r = document.querySelector('#btn-reveal-hide').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
            await page.mouse.dblclick(hide.x, hide.y);
            await page.waitForSelector('#screen-night:not(.hidden)');
            // Whatever the second tap landed on (a name of the list, a button), it did nothing.
            assert.deepEqual(await pressedIds(page), [], 'no name was picked by the second tap');
            assert.equal(await page.locator('#players-list .player-role').count(), 0, 'no role was shown');
            assert.equal(await page.isDisabled('#btn-night-confirm'), true);
            assert.equal(await actionCount(page), 0);
            await assertNoRoleInPage(page, 'first night after a double tap');
            // Later (the guard has run out) the same button works.
            await handOff(page);
            await page.click(`#night-targets button >> nth=0`);
            assert.equal((await pressedIds(page)).length, 1);
        }, { lang: 'en' });
    });

    it('the boundary in the browser: 799 ms after a card was hidden a press is ignored, at 800 ms it is accepted', async () => {
        await game(async (page) => {
            await dealGame(page, 'en', 6, { godfather: false });
            await page.click('#btn-reveal-show');
            await page.clock.pauseAt(Date.now() + 60_000); // the clock stands still from here: it moves only when told
            await page.click('#btn-reveal-hide', { noWaitAfter: true, force: true, timeout: 5000 });
            const press = () => page.evaluate(() => document.getElementById('btn-reveal-show').click());
            const cardShown = () => page.evaluate(() => !document.getElementById('reveal-card').classList.contains('hidden'));
            await press();
            assert.equal(await cardShown(), false, '0 ms');
            await page.clock.runFor(GUARD_MS - 1);
            await press();
            assert.equal(await cardShown(), false, '799 ms: ignored');
            await page.clock.runFor(1);
            await press();
            assert.equal(await cardShown(), true, '800 ms: accepted');
        }, { lang: 'en' });
    });
});

describe('a night and a vote with the keyboard only', () => {
    it('fa: Tab, Space and Enter play a night and a vote; the focus goes to the heading and one live line says where the game is', async () => {
        await game(async (page) => {
            const lang = 'fa';
            await startGame(page, lang, 8);
            const tabTo = async (selector, limit = 40) => {
                for (let i = 0; i < limit; i++) {
                    if (await page.evaluate((s) => document.activeElement.matches(s), selector)) return;
                    await page.keyboard.press('Tab');
                }
                assert.fail(`Tab does not reach ${selector}`);
            };
            const live = () => page.textContent('#game-live');
            assert.equal(await activeId(page), 'title-night', 'the first night puts the focus on its heading');
            assert.equal(await live(), say(lang, 'game.live.night', { heading: say(lang, 'game.heading.night', { n: digits(1, lang) }), step: say(lang, 'night.step.mafia.name') }));

            for (const [step, next] of [['mafia', 'doctor'], ['doctor', 'detective'], ['detective', null]]) {
                await tabTo('#night-targets button');
                await page.keyboard.press('Space');
                assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true', `${step}: Space picks a name`);
                assert.equal(await page.isDisabled('#btn-night-confirm'), false);
                await tabTo('#btn-night-confirm');
                await page.keyboard.press('Enter');
                if (next) {
                    await page.waitForFunction((s) => document.querySelector('#night-steps [data-status="current"]')?.dataset.step === s, next);
                    assert.equal(await activeId(page), 'title-night', `after ${step} the focus is on the heading`);
                    assert.equal(await live(), say(lang, 'game.live.night', { heading: say(lang, 'game.heading.night', { n: digits(1, lang) }), step: say(lang, `night.step.${next}.name`) }));
                }
            }
            await page.waitForSelector('#screen-morning:not(.hidden)');
            assert.equal(await activeId(page), 'title-morning');
            assert.equal(await live(), say(lang, 'game.heading.morning', { n: digits(1, lang) }));
            // The notes open and close with the keyboard (aria-expanded follows), then Continue.
            await tabTo('#btn-morning-notes');
            await page.keyboard.press('Enter');
            assert.equal(await page.getAttribute('#btn-morning-notes', 'aria-expanded'), 'true');
            await page.keyboard.press('Enter');
            assert.equal(await page.getAttribute('#btn-morning-notes', 'aria-expanded'), 'false');
            await tabTo('#btn-morning-continue');
            await page.keyboard.press('Enter');
            await page.waitForSelector('#screen-day:not(.hidden)');
            assert.equal(await activeId(page), 'title-day');

            // The vote: a plus button keeps the focus while it is pressed (the row is updated in place).
            await tabTo('.stepper-plus:not(:disabled)');
            const label = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
            assert.ok(label.length > 0, 'a stepper button has a name');
            await page.keyboard.press('Space');
            await page.keyboard.press('Space');
            assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), label, 'the focus stays on the button');
            assert.equal(await page.textContent('#day-counter'), say(lang, 'day.counter.other', { used: digits(2, lang), count: digits(8, lang) }));
            await tabTo('#btn-vote-close');
            await page.keyboard.press('Enter');
            await page.waitForSelector('#screen-dusk:not(.hidden)');
            assert.equal(await activeId(page), 'title-dusk');
            await tabTo('#btn-dusk-continue');
            await page.keyboard.press('Enter');
            await page.waitForSelector('#screen-night:not(.hidden)');
            assert.equal(await activeId(page), 'title-night');
            assert.equal(await page.textContent('#title-night'), say(lang, 'game.heading.night', { n: digits(2, lang) }));
            // Undo is reachable and works from the keyboard.
            await tabTo('#btn-undo', 60);
            await page.keyboard.press('Enter');
            await page.waitForSelector('#screen-dusk:not(.hidden)');
            assert.equal(await activeId(page), 'title-dusk');
        });
    });

    it('every control of a game screen has an accessible name from the catalog', async () => {
        await game(async (page) => {
            const lang = 'en';
            const players = await startGame(page, lang, 8);
            const c = cast(players);
            const unnamed = () =>
                page.evaluate(() => {
                    const out = [];
                    for (const el of document.querySelectorAll('#main-content-root button, #main-content-root summary, #main-content-root [role="region"], #main-content-root ul[aria-label]')) {
                        if (el.closest('.hidden') || el.closest('.screen-view.hidden')) continue;
                        const label = el.getAttribute('aria-label') || el.textContent.trim() || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim());
                        if (!label) out.push(`${el.tagName}#${el.id}.${el.className}`);
                    }
                    return out;
                });
            assert.deepEqual(await unnamed(), [], 'night');
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await page.click('#btn-morning-notes');
            assert.deepEqual(await unnamed(), [], 'morning');
            await toDay(page);
            assert.deepEqual(await unnamed(), [], 'day');
            const plusNames = await page.locator('.stepper-plus').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
            assert.equal(plusNames.length, 7);
            const alive = players.map((p, i) => ({ id: `p${i + 1}`, name: p.name })).filter((p) => p.id !== c.citizens[0]);
            assert.deepEqual(plusNames.map(plain), alive.map((p) => say(lang, 'day.vote.plus', { name: p.name })));
            await castVotes(page, {});
            assert.deepEqual(await unnamed(), [], 'dusk');
        }, { lang: 'en' });
    });
});

describe('the language during the game', () => {
    it('fa: the switch does nothing on any game screen, and works again after "new game"', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'fa', 8);
            const c = cast(players);
            const tryEnglish = async (where) => {
                await page.evaluate(() => document.getElementById('btn-lang-en').click());
                assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa', where);
                assert.equal(await page.evaluate(() => localStorage.getItem('mafia_lang')), null, where);
                assert.equal(await page.isVisible('#btn-lang-en'), false, `${where}: not on screen`);
            };
            await tryEnglish('night');
            await playNight(page, { mafia: c.citizens[0], doctor: c.citizens[1], detective: c.team[0] });
            await tryEnglish('morning');
            await toDay(page);
            await tryEnglish('day');
            await castVotes(page, { [c.team[0]]: 3 });
            await tryEnglish('dusk');
            await fromDusk(page);
            await tryEnglish('night 2');
            await page.click('#btn-new-game');
            await page.waitForSelector('#confirm-modal:not(.hidden)');
            await page.click('#btn-confirm-yes');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-lang-en');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
        });
    });

    it('en: from the end screen "new game" frees the switch too', async () => {
        await game(async (page) => {
            const players = await startGame(page, 'en', 8);
            const c = cast(players);
            for (let night = 0; night < 4; night++) {
                await playNight(page, { mafia: c.citizens[night], doctor: c.detective, detective: c.team[0] });
                if (night === 3) break;
                await toDay(page);
                await castVotes(page, {});
                await fromDusk(page);
            }
            await page.click('#btn-morning-continue');
            await page.waitForSelector('#screen-ended:not(.hidden)');
            await page.evaluate(() => document.getElementById('btn-lang-fa').click());
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en', 'locked on the end screen');
            await page.click('#btn-ended-new-game');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-lang-fa');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
        }, { lang: 'en' });
    });
});
