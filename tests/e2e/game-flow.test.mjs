/**
 * Step 3A in a real Chromium at 360x740 against the PRODUCTION build, in Persian and in English: the setup form,
 * the hand-off of the roles one player at a time, the moderator's list, and the save that lets a game be picked up
 * after the page was closed. What matters at the table is checked from the person's side:
 *
 *  - a role is on the phone only while its player is looking (the card is TAKEN OUT of the page when hidden);
 *  - the card says what the saved game says, and a mafia member sees exactly the other members of the mafia;
 *  - the hand-off progress survives a reload, and a reload never lands on a card;
 *  - the moderator's list shows no role until asked, and hides them again when the page goes out of sight;
 *  - a damaged save is ignored; the form refuses what the engine refuses, on the right field, in words.
 * The screens in the eight themes and the keyboard-only run are in game-screens.test.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startApp } from './helpers/app.mjs';
import {
    LANGS,
    SAVE_KEY,
    assertFitsPhone,
    assertNoRoleInPage,
    assertTouchTargets,
    deal,
    digits,
    fillNames,
    goSetup,
    makeNames,
    nameValues,
    pageGoesAway,
    passOnePlayer,
    readCard,
    roleName,
    savedPlayers,
    savedRecord,
    savedState,
    say,
    setCount,
    setGodfather,
    shown,
    tapWhenStill,
    withGame
} from './helpers/game.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

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
const toasts = (page) => page.locator('#toast-container .toast').allTextContents();
const activeId = (page) => page.evaluate(() => document.activeElement.id);
const invalid = (page, id) => page.getAttribute(`#${id}`, 'aria-invalid');
const stripIsolates = (text) => text.replace(/[⁨⁩]/g, '');

/** Deal a game of `count` named players (godfather on from six) and stop at the first gate. */
async function dealGame(page, lang, count = 8, { godfather = count >= 6 } = {}) {
    await goSetup(page);
    await setCount(page, count);
    await fillNames(page, makeNames(count, lang));
    await setGodfather(page, godfather);
    await deal(page);
    return savedPlayers(page);
}

/** Hand every player their card, as the table does; ends on the moderator's screen. */
async function passAll(page, lang, players) {
    for (let i = 0; i < players.length; i++) await passOnePlayer(page, { lang, index: i, count: players.length, players });
    await page.waitForSelector('#screen-moderator:not(.hidden)');
}

/** What a reload does to the app: the page starts over; only localStorage is left. */
async function reload(page) {
    await page.reload();
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}

const resumeShown = (page) => page.isVisible('#btn-resume-game');
async function resume(page) {
    await page.click('#btn-resume-game');
    await page.waitForSelector('#screen-welcome.hidden', { state: 'attached' });
}

/** Answer the confirm dialog that is open. */
async function answer(page, yes) {
    await page.waitForSelector('#confirm-modal:not(.hidden)');
    await page.click(yes ? '#btn-confirm-yes' : '#btn-confirm-no');
    await page.waitForSelector('#confirm-modal.hidden', { state: 'attached' });
}

// ---------------------------------------------------------------------------------------------------

for (const lang of LANGS) {
    describe(`a whole game, from the form to the moderator's list (${lang}, 360x740)`, () => {
        for (const count of [3, 8, 20]) {
            it(`${count} players: every card is the saved role with the right teammates, nothing is left in the page, the list follows`, async () => {
                await game(
                    async (page) => {
                        await goSetup(page);
                        await setCount(page, count);
                        assert.equal(await page.locator('#setup-names .name-input').count(), count, 'one name field per player');
                        await assertFitsPhone(page, `setup, ${count}`);
                        const names = makeNames(count, lang);
                        await fillNames(page, names);
                        if (count >= 6) await setGodfather(page, true);
                        await assertFitsPhone(page, `setup typed, ${count}`);
                        await deal(page);
                        assert.deepEqual(await shown(page), ['screen-reveal']);

                        const record = await savedRecord(page);
                        assert.equal(record.state.phase, 'reveal', 'the game is saved from the first gate on');
                        const players = record.state.game.setup.players;
                        assert.deepEqual(players.map((p) => p.name), names);
                        assert.equal(players.filter((p) => p.role === 'godfather').length, count >= 6 ? 1 : 0, 'the godfather is in the game exactly when asked for');
                        assert.equal(record.state.game.setup.rules.godfather, count >= 6);

                        await assertFitsPhone(page, `gate, ${count}`);
                        await assertTouchTargets(page, `gate, ${count}`);
                        for (let i = 0; i < count; i++) {
                            if (i === 0 || i === count - 1) await assertFitsPhone(page, `gate ${i + 1}`);
                            await page.click('#btn-reveal-show');
                            if (i === 0 || i === count - 1) {
                                await assertFitsPhone(page, `card ${i + 1}`);
                                await assertTouchTargets(page, `card ${i + 1}`);
                            }
                            await page.click('#btn-reveal-hide');
                            if (i < count - 1) await page.waitForSelector('#reveal-gate:not(.hidden)');
                        }
                        await page.waitForSelector('#screen-moderator:not(.hidden)');
                    },
                    { lang }
                );
            });
        }

        it('8 players with the godfather: each card is checked one by one against the saved game (role, text, team)', async () => {
            await game(
                async (page) => {
                    const players = await dealGame(page, lang, 8);
                    const cards = [];
                    for (let i = 0; i < players.length; i++) cards.push(await passOnePlayer(page, { lang, index: i, count: 8, players }));
                    assert.deepEqual(cards.map((c) => c.role), players.map((p) => roleName(lang, p.role)));
                    // The godfather's card tells him the detective sees him as innocent.
                    const godfather = cards[players.findIndex((p) => p.role === 'godfather')];
                    assert.equal(godfather.does, say(lang, 'role.godfather.does'));
                    assert.equal(cards.filter((c) => c.team !== null).length, 2, 'the mafia team of 8 is two (the godfather takes one place): each has a team line, nobody else');
                    assert.deepEqual(await shown(page), ['screen-moderator']);
                },
                { lang }
            );
        });

        it('the moderator list: names only until asked, then every role as dealt; the toggle flips the label and the rules are listed', async () => {
            await game(
                async (page) => {
                    const players = await dealGame(page, lang, 8);
                    await passAll(page, lang, players);
                    await assertFitsPhone(page, 'moderator');
                    await assertTouchTargets(page, 'moderator');
                    assert.deepEqual(await page.locator('#moderator-list .moderator-name').allTextContents(), players.map((p) => p.name));
                    assert.equal(await page.locator('#moderator-list .moderator-role').count(), 0, 'no role by default');
                    await assertNoRoleInPage(page, 'moderator, roles hidden');
                    assert.equal(await page.textContent('#btn-roles-toggle'), say(lang, 'moderator.roles.show'));

                    await page.click('#btn-roles-toggle');
                    assert.deepEqual(await page.locator('#moderator-list .moderator-role').allTextContents(), players.map((p) => roleName(lang, p.role)));
                    assert.equal(await page.textContent('#btn-roles-toggle'), say(lang, 'moderator.roles.hide'));
                    await assertFitsPhone(page, 'moderator, roles shown');

                    await page.click('#btn-roles-toggle');
                    assert.equal(await page.locator('#moderator-list .moderator-role').count(), 0, 'hidden again, out of the page');
                    await assertNoRoleInPage(page, 'moderator, hidden again');

                    assert.deepEqual(await page.locator('#moderator-rules li').allTextContents(), [say(lang, 'moderator.rule.selfSave.once'), say(lang, 'moderator.rule.godfather.on'), say(lang, 'moderator.rule.revealRole.on')]);
                },
                { lang }
            );
        });

        it('the rules typed in the form are the rules listed: self-save never, no godfather, roles of the dead not announced', async () => {
            await game(
                async (page) => {
                    await goSetup(page);
                    await page.selectOption('#setup-doctor-save', 'never');
                    await page.locator('label.switch:has(#setup-reveal-death)').click();
                    await deal(page);
                    const rules = (await savedState(page)).game.setup.rules;
                    assert.deepEqual(rules, { doctorSelfSave: 'never', godfather: false, revealRoleOnDeath: false });
                    await passAll(page, lang, await savedPlayers(page));
                    assert.deepEqual(await page.locator('#moderator-rules li').allTextContents(), [say(lang, 'moderator.rule.selfSave.never'), say(lang, 'moderator.rule.godfather.off'), say(lang, 'moderator.rule.revealRole.off')]);
                },
                { lang }
            );
        });
    });
}

describe('a role is on the phone only while its player is looking', () => {
    it('the page leaving the screen (pagehide, then a hidden page) takes the card away and shows the same player\'s gate', async () => {
        for (const how of ['pagehide', 'visibilitychange']) {
            await game(async (page) => {
                const players = await dealGame(page, 'fa', 8);
                await page.click('#btn-reveal-show');
                await page.click('#btn-reveal-hide');
                await page.click('#btn-reveal-show');
                assert.equal((await readCard(page)).role, roleName('fa', players[1].role));
                await pageGoesAway(page, how);
                await page.waitForSelector('#reveal-gate:not(.hidden)');
                assert.equal(await page.locator('#reveal-card-body > *').count(), 0, how);
                await assertNoRoleInPage(page, how);
                assert.ok(stripIsolates(await page.textContent('#reveal-gate-title')).includes(players[1].name), 'the same player is next');
                assert.equal((await savedState(page)).reveal.index, 1);
            });
        }
    });

    it('the moderator list hides its roles when the page leaves the screen, and does not bring them back by itself', async () => {
        for (const how of ['pagehide', 'visibilitychange']) {
            await game(async (page) => {
                const players = await dealGame(page, 'fa', 6, { godfather: false });
                await passAll(page, 'fa', players);
                await page.click('#btn-roles-toggle');
                assert.equal(await page.locator('#moderator-list .moderator-role').count(), 6);
                await pageGoesAway(page, how);
                assert.equal(await page.locator('#moderator-list .moderator-role').count(), 0, `${how}: no role left`);
                await assertNoRoleInPage(page, how);
                assert.equal(await page.textContent('#btn-roles-toggle'), say('fa', 'moderator.roles.show'));
            });
        }
    });
});

describe('a reload', () => {
    it('in the middle of the reveal: the welcome screen offers "resume", and it lands on the NEXT player\'s gate', async () => {
        for (const lang of LANGS) {
            await game(
                async (page) => {
                    const players = await dealGame(page, lang, 8);
                    for (let i = 0; i < 3; i++) await passOnePlayer(page, { lang, index: i, count: 8, players });
                    assert.equal((await savedState(page)).reveal.index, 3, 'saved at the hand-off');
                    await reload(page);
                    assert.equal(await resumeShown(page), true);
                    assert.equal(await page.textContent('#btn-resume-game'), say(lang, 'welcome.resume'));
                    await resume(page);
                    assert.deepEqual(await shown(page), ['screen-reveal']);
                    assert.equal(await page.locator('#reveal-card-body > *').count(), 0, 'never straight to a card');
                    assert.equal(await page.isVisible('#reveal-gate'), true);
                    assert.equal(await page.textContent('#reveal-progress'), say(lang, 'reveal.progress', { n: digits(4, lang), total: digits(8, lang) }));
                    assert.ok(stripIsolates(await page.textContent('#reveal-gate-title')).includes(players[3].name));
                    // And the game goes on from there to the end.
                    for (let i = 3; i < 8; i++) await passOnePlayer(page, { lang, index: i, count: 8, players });
                    assert.deepEqual(await shown(page), ['screen-moderator']);
                },
                { lang }
            );
        }
    });

    it('with a card on screen: it comes back as that same player\'s gate (their turn is not lost, their card is not shown)', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 6, { godfather: false });
            await passOnePlayer(page, { lang: 'fa', index: 0, count: 6, players });
            await page.click('#btn-reveal-show');
            assert.equal((await readCard(page)).role, roleName('fa', players[1].role));
            await reload(page);
            await resume(page);
            assert.equal(await page.locator('#reveal-card-body > *').count(), 0);
            assert.ok(stripIsolates(await page.textContent('#reveal-gate-title')).includes(players[1].name));
            await assertNoRoleInPage(page, 'resumed gate');
        });
    });

    it('on the moderator screen: it comes back there with the roles hidden, even when they were showing', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 8);
            await passAll(page, 'fa', players);
            await page.click('#btn-roles-toggle');
            assert.equal(await page.locator('#moderator-list .moderator-role').count(), 8);
            await reload(page);
            await resume(page);
            assert.deepEqual(await shown(page), ['screen-moderator']);
            assert.deepEqual(await page.locator('#moderator-list .moderator-name').allTextContents(), players.map((p) => p.name));
            assert.equal(await page.locator('#moderator-list .moderator-role').count(), 0);
            await assertNoRoleInPage(page, 'moderator after reload');
        });
    });

    it('the saved game is the same game after a reload: same roles, same names, same rules', async () => {
        await game(async (page) => {
            await dealGame(page, 'fa', 8);
            const before = await savedState(page);
            await reload(page);
            await resume(page);
            const after = await savedState(page);
            assert.deepEqual(after.game, before.game);
        });
    });

    it('in English the resumed game speaks the language that is chosen now, whatever it was when it was dealt', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 6, { godfather: false });
            await reload(page);
            await page.click('#btn-lang-en');
            await resume(page);
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
            assert.equal(await page.textContent('#reveal-progress'), 'Player 1 of 6');
            await page.click('#btn-reveal-show');
            assert.equal((await readCard(page)).role, roleName('en', players[0].role));
            assert.equal(persianIn([await page.textContent('#reveal-card-body')]).length, 0, 'no Persian role text on the English card');
        });
    });
});

describe('the "resume" button', () => {
    it('is not there on a first visit, appears once a game is dealt, and is gone after "new game"', async () => {
        await game(async (page) => {
            assert.equal(await resumeShown(page), false);
            await goSetup(page);
            await deal(page);
            await reload(page);
            assert.equal(await resumeShown(page), true);
            await resume(page);
            await passAll(page, 'fa', await savedPlayers(page));
            await page.click('#btn-new-game');
            await answer(page, true);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal(await resumeShown(page), false);
            assert.equal(await savedRecord(page), null, 'the saved game is gone');
            await reload(page);
            assert.equal(await resumeShown(page), false);
        });
    });

    it('is not there when nothing was dealt, however much of the form was filled', async () => {
        await game(async (page) => {
            await goSetup(page);
            await setCount(page, 12);
            await page.fill('#setup-name-1', 'Someone');
            await reload(page);
            assert.equal(await resumeShown(page), false);
            assert.equal(await savedRecord(page), null, 'a form is not a game: nothing is saved');
        });
    });

    it('is a ghost button: not the main action, not hidden from a keyboard, and finger-sized', async () => {
        await game(async (page) => {
            await dealGame(page, 'fa', 6, { godfather: false });
            await reload(page);
            assert.match(await page.getAttribute('#btn-resume-game', 'class'), /btn-ghost/);
            await assertTouchTargets(page, 'welcome with the resume button');
            await assertFitsPhone(page, 'welcome with the resume button');
        });
    });
});

describe('a damaged save', () => {
    const good = (game) => JSON.stringify({ version: 2, state: { phase: 'reveal', reveal: { index: 1 }, game } });
    const DAMAGED = {
        'text that is not JSON': '{ not json',
        'a list': '[1,2,3]',
        'a number': '42',
        'a record of another version': JSON.stringify({ version: 1, state: { phase: 'moderator' } }),
        'no game in the state': JSON.stringify({ version: 2, state: { phase: 'moderator', reveal: { index: 0 } } }),
        'a game that is not one': JSON.stringify({ version: 2, state: { phase: 'moderator', reveal: { index: 0 }, game: { hello: 'world' } } }),
        'a game with a role that does not exist': good({ version: 1, setup: { players: [{ id: 'p1', name: 'A', role: 'wizard' }, { id: 'p2', name: 'B', role: 'mafia' }, { id: 'p3', name: 'C', role: 'citizen' }], rules: { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true } }, actions: [] }),
        'a phase that is not a game phase': JSON.stringify({ version: 2, state: { phase: 'night', reveal: { index: 0 }, game: null } })
    };
    for (const [what, text] of Object.entries(DAMAGED)) {
        it(`${what}: the app starts, offers no "resume", and a new game can be dealt`, async () => {
            await game(
                async (page) => {
                    assert.equal(await resumeShown(page), false, 'no resume button');
                    assert.deepEqual(await shown(page), ['screen-welcome']);
                    await goSetup(page);
                    await deal(page); // no "start over?" question: there is no game to lose
                    assert.equal(await page.isVisible('#confirm-modal'), false);
                    assert.equal((await savedState(page)).phase, 'reveal');
                },
                { storage: { [SAVE_KEY]: text } }
            );
        });
    }

    it('a save with a damaged hand-off index still resumes, at the first gate (never at a card, never past the end)', async () => {
        for (const index of [-3, 99, 'x', null, 2.5]) {
            await game(async (page) => {
                const players = await dealGame(page, 'fa', 6, { godfather: false });
                const record = await savedRecord(page);
                record.state.reveal = { index };
                await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, JSON.stringify(record)]);
                await reload(page);
                await resume(page);
                assert.deepEqual(await shown(page), ['screen-reveal'], String(index));
                assert.equal(await page.locator('#reveal-card-body > *').count(), 0);
                assert.ok(stripIsolates(await page.textContent('#reveal-gate-title')).includes(players[0].name), `index ${index}`);
            });
        }
    });
});

describe('the form', () => {
    it('starts with 8 default names, the three rules at their defaults, and "deal" and "back"', async () => {
        for (const lang of LANGS) {
            await game(
                async (page) => {
                    await goSetup(page);
                    assert.deepEqual(await nameValues(page), Array.from({ length: 8 }, (_, i) => say(lang, 'setup.player.default', { n: digits(i + 1, lang) })));
                    assert.equal(await page.inputValue('#setup-doctor-save'), 'once');
                    assert.equal(await page.isChecked('#setup-godfather'), false);
                    assert.equal(await page.isChecked('#setup-reveal-death'), true);
                    assert.equal(await page.isEnabled('#setup-godfather'), true);
                    assert.equal(await page.textContent('#names-limit-hint'), say(lang, 'setup.limit.names', { max: digits(24, lang) }));
                    await assertFitsPhone(page, `setup ${lang}`);
                    await assertTouchTargets(page, `setup ${lang}`);
                },
                { lang }
            );
        }
    });

    it('the name fields follow the count, and what was typed stays when the count goes down and up again', async () => {
        await game(async (page) => {
            await goSetup(page);
            await page.fill('#setup-name-2', 'Sara');
            await setCount(page, 5);
            assert.equal((await nameValues(page)).length, 5);
            assert.equal((await nameValues(page))[1], 'Sara');
            await setCount(page, 10);
            const names = await nameValues(page);
            assert.equal(names.length, 10);
            assert.equal(names[1], 'Sara');
            assert.equal(names[9], say('fa', 'setup.player.default', { n: digits(10, 'fa') }));
            await setCount(page, 3);
            assert.deepEqual((await nameValues(page)).length, 3);
        });
    });

    it('default names turn into the other language with the page, typed names do not', async () => {
        await game(async (page) => {
            await page.click('#btn-lang-en');
            await goSetup(page);
            await page.fill('#setup-name-3', 'Reza');
            await page.click('#btn-back-welcome-2');
            await page.click('#btn-lang-fa');
            await goSetup(page);
            const names = await nameValues(page);
            assert.equal(names[0], say('fa', 'setup.player.default', { n: digits(1, 'fa') }), 'a default follows the language');
            assert.equal(names[2], 'Reza', 'a typed name does not');
            assert.equal(await page.getAttribute('#setup-name-1', 'placeholder'), say('fa', 'setup.player.placeholder', { n: digits(1, 'fa') }));
        });
    });

    it('a name is cut at 24 letters as it is typed or pasted, and a longer one cannot be dealt', async () => {
        await game(async (page) => {
            await goSetup(page);
            await page.fill('#setup-name-1', 'x'.repeat(40));
            assert.equal((await page.inputValue('#setup-name-1')).length, 24);
            await page.fill('#setup-name-2', '😀'.repeat(30));
            assert.equal([...(await page.inputValue('#setup-name-2'))].length, 24, 'counted in letters, not in code units');
        });
    });

    it('names and options are not remembered: after a game, the form is the default form again', async () => {
        await game(async (page) => {
            await goSetup(page);
            await setCount(page, 6);
            await fillNames(page, makeNames(6, 'fa'));
            await setGodfather(page, true);
            await page.selectOption('#setup-doctor-save', 'always');
            await deal(page);
            await reload(page);
            await page.click('#btn-lang-fa');
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await page.inputValue('#setup-players-count'), '8');
            assert.deepEqual(await nameValues(page), Array.from({ length: 8 }, (_, i) => say('fa', 'setup.player.default', { n: digits(i + 1, 'fa') })));
            assert.equal(await page.isChecked('#setup-godfather'), false);
            assert.equal(await page.inputValue('#setup-doctor-save'), 'once');
        });
    });

    it('the help buttons open their own text, in the language of the page, and closing returns the focus to the button', async () => {
        for (const lang of LANGS) {
            await game(
                async (page) => {
                    await goSetup(page);
                    for (const [id, key] of [['btn-info-doctor-save', 'doctorSelfSave'], ['btn-info-godfather', 'godfather'], ['btn-info-reveal-death', 'revealRoleOnDeath']]) {
                        await page.click(`#${id}`);
                        await page.waitForSelector('#info-modal:not(.hidden)');
                        assert.equal(await page.textContent('#info-modal-title'), say(lang, `info.${key}.title`));
                        assert.equal(await page.textContent('#info-modal-desc'), say(lang, `info.${key}.text`));
                        assert.equal(await activeId(page), 'btn-info-modal-close', 'the focus is inside the dialog');
                        await page.click('#btn-info-modal-close');
                        await page.waitForSelector('#info-modal.hidden', { state: 'attached' });
                        assert.equal(await activeId(page), id, 'and comes back to the button that opened it');
                    }
                },
                { lang }
            );
        }
    });
});

describe('the godfather option', () => {
    it('is off and disabled below six players, with the reason beside it; six or more enables it', async () => {
        await game(async (page) => {
            await goSetup(page);
            for (const count of [3, 4, 5]) {
                await setCount(page, count);
                assert.equal(await page.isDisabled('#setup-godfather'), true, `${count} players`);
                assert.equal(await page.isChecked('#setup-godfather'), false);
                assert.equal(await page.textContent('#godfather-hint'), say('fa', 'setup.hint.godfatherMin', { min: digits(6, 'fa') }));
            }
            for (const count of [6, 7, 20]) {
                await setCount(page, count);
                assert.equal(await page.isDisabled('#setup-godfather'), false, `${count} players`);
                assert.equal(await page.textContent('#godfather-hint'), '');
            }
        });
    });

    it('turns itself off when the count drops below six, and stays off when it goes back up', async () => {
        await game(async (page) => {
            await goSetup(page);
            await setCount(page, 9);
            await setGodfather(page, true);
            await setCount(page, 5);
            assert.equal(await page.isChecked('#setup-godfather'), false, 'auto-off');
            assert.equal(await page.isDisabled('#setup-godfather'), true);
            await setCount(page, 9);
            assert.equal(await page.isChecked('#setup-godfather'), false, 'it does not switch itself back on');
            assert.equal(await page.isDisabled('#setup-godfather'), false);
        });
    });

    it('six players with the godfather deal a game with one godfather and two other mafia at most', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 6, { godfather: true });
            assert.equal(players.filter((p) => p.role === 'godfather').length, 1);
            assert.equal(players.filter((p) => p.role === 'mafia').length, 1, 'the godfather takes one of the two mafia places');
        });
    });
});

describe('what the form refuses, and where it says so', () => {
    for (const lang of LANGS) {
        it(`an empty name (${lang}): the message names the player, the right field is marked and focused, nothing starts or is saved`, async () => {
            await game(
                async (page) => {
                    await goSetup(page);
                    await page.fill('#setup-name-3', '   ');
                    await page.click('#btn-deal');
                    assert.deepEqual(await toasts(page), [say(lang, 'setup.error.nameEmpty', { n: digits(3, lang) })]);
                    assert.equal(await invalid(page, 'setup-name-3'), 'true');
                    assert.equal(await activeId(page), 'setup-name-3');
                    assert.equal(await invalid(page, 'setup-name-2'), null, 'no other field is marked');
                    assert.deepEqual(await shown(page), ['screen-setup']);
                    assert.equal(await savedRecord(page), null);
                },
                { lang }
            );
        });

        it(`a repeated name (${lang}): the message is on the second one, even when the same name differs only in spaces or case`, async () => {
            await game(
                async (page) => {
                    await goSetup(page);
                    await page.fill('#setup-name-2', 'Sara');
                    await page.fill('#setup-name-5', '  sara ');
                    await page.click('#btn-deal');
                    assert.deepEqual(await toasts(page), [say(lang, 'setup.error.nameDuplicate', { n: digits(5, lang) })]);
                    assert.equal(await invalid(page, 'setup-name-5'), 'true');
                    assert.equal(await activeId(page), 'setup-name-5');
                    assert.deepEqual(await shown(page), ['screen-setup']);
                },
                { lang }
            );
        });

        it(`a count out of range (${lang}): said in words, never as a code, and no name field changes`, async () => {
            await game(
                async (page) => {
                    await goSetup(page);
                    await page.fill('#setup-name-1', 'Keep');
                    await setCount(page, 99);
                    assert.deepEqual(await toasts(page), [say(lang, 'setup.error.players', { min: digits(3, lang), max: digits(20, lang) })]);
                    assert.equal(await activeId(page), 'setup-players-count');
                    assert.equal((await nameValues(page)).length, 8);
                    assert.equal((await nameValues(page))[0], 'Keep');
                    await page.click('#btn-deal');
                    assert.deepEqual(await shown(page), ['screen-setup'], 'a count that is wrong cannot be dealt');
                },
                { lang }
            );
        });
    }

    it('no message ever shows an engine error code', async () => {
        await game(async (page) => {
            await goSetup(page);
            await page.fill('#setup-name-1', '');
            await page.click('#btn-deal');
            await page.fill('#setup-name-1', 'A');
            await page.fill('#setup-name-2', 'A');
            await page.click('#btn-deal');
            await setCount(page, 'abc');
            const text = (await toasts(page)).join(' ');
            assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z_]+/, text);
            assert.ok(text.length > 0);
        });
    });

    it('after a refusal the form is fixed and dealt: the same page, no reload', async () => {
        await game(async (page) => {
            await goSetup(page);
            await page.fill('#setup-name-1', '');
            await page.click('#btn-deal');
            assert.deepEqual(await shown(page), ['screen-setup']);
            await page.fill('#setup-name-1', 'Fixed');
            await deal(page);
            assert.equal((await savedPlayers(page))[0].name, 'Fixed');
        });
    });
});

describe('asking before a game is thrown away', () => {
    it('"back" on a gate asks first: "no" keeps the game and the place, "yes" returns to a fresh form and the save is gone', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 6, { godfather: false });
            await passOnePlayer(page, { lang: 'fa', index: 0, count: 6, players });
            await page.click('#btn-reveal-back');
            assert.equal(await page.textContent('#confirm-modal-title'), say('fa', 'confirm.discard.title'));
            assert.equal(await page.textContent('#confirm-modal-text'), say('fa', 'confirm.discard.text'));
            await answer(page, false);
            assert.deepEqual(await shown(page), ['screen-reveal']);
            assert.equal((await savedState(page)).reveal.index, 1);
            await page.click('#btn-reveal-back');
            await answer(page, true);
            assert.deepEqual(await shown(page), ['screen-setup']);
            assert.equal(await savedRecord(page), null);
            assert.equal(await page.inputValue('#setup-players-count'), '8');
            assert.equal((await nameValues(page)).length, 8);
        });
    });

    it('"deal" over a saved game asks first; "no" changes nothing, "yes" replaces the game', async () => {
        await game(async (page) => {
            const first = await dealGame(page, 'fa', 6, { godfather: false });
            await reload(page);
            await goSetup(page);
            await page.click('#btn-deal');
            await answer(page, false);
            assert.deepEqual(await shown(page), ['screen-setup']);
            assert.deepEqual(await savedPlayers(page), first);
            await page.click('#btn-deal');
            await answer(page, true);
            await page.waitForSelector('#screen-reveal:not(.hidden)');
            const second = await savedPlayers(page);
            assert.equal(second.length, 8, 'the new game has the new form\'s 8 players');
            assert.equal((await savedState(page)).reveal.index, 0);
        });
    });

    it('"new game" on the moderator\'s screen asks first; "no" keeps the list, "yes" discards the game', async () => {
        await game(async (page) => {
            await passAll(page, 'fa', await dealGame(page, 'fa', 6, { godfather: false }));
            await page.click('#btn-new-game');
            await answer(page, false);
            assert.deepEqual(await shown(page), ['screen-moderator']);
            assert.notEqual(await savedRecord(page), null);
            await page.click('#btn-new-game');
            await answer(page, true);
            assert.deepEqual(await shown(page), ['screen-welcome']);
            assert.equal(await savedRecord(page), null);
        });
    });
});

describe('the language during a game', () => {
    it('the switch is not available from the reveal or the moderator screen; trying anyway changes nothing; after "new game" it works', async () => {
        await game(async (page) => {
            const players = await dealGame(page, 'fa', 6, { godfather: false });
            const tryEnglish = () => page.evaluate(() => document.getElementById('btn-lang-en').click());
            assert.equal(await page.isVisible('#btn-lang-en'), false, 'not on screen during the reveal');
            await tryEnglish();
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa', 'reveal');
            assert.equal(await page.evaluate(() => localStorage.getItem('mafia_lang')), null);
            await passAll(page, 'fa', players);
            await tryEnglish();
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa', 'moderator');
            assert.equal(await page.textContent('#btn-roles-toggle'), say('fa', 'moderator.roles.show'));
            await page.click('#btn-new-game');
            await answer(page, true);
            await page.click('#btn-lang-en');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
            assert.equal(await page.textContent('#welcome-title'), '🎭 Mafia');
        });
    });

    it('Persian -> English -> Persian shows the same text on the welcome screen (with the resume button) and on the form', async () => {
        await game(async (page) => {
            await dealGame(page, 'fa', 6, { godfather: false });
            await reload(page);
            const snap = async () => {
                const welcome = await recordScreen(page, { includeSwitch: true });
                const welcomeOnly = await recordScreen(page); // without the two language labels, which are fixed in their own language
                await page.click('#btn-nav-setup');
                await page.waitForSelector('#screen-setup:not(.hidden)');
                const setup = await recordScreen(page, { includeSwitch: true });
                const setupOnly = await recordScreen(page);
                await page.click('#btn-back-welcome-2');
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                return { welcome, setup, welcomeOnly, setupOnly };
            };
            const first = await snap();
            await page.click('#btn-lang-en');
            const english = await snap();
            assert.deepEqual(persianIn(english.setupOnly), [], 'the English form has no Persian in it: text, attributes, fields, options');
            assert.deepEqual(persianIn(english.welcomeOnly), []);
            assert.notDeepEqual(english.setup.text, first.setup.text);
            assert.notDeepEqual(english.setup.fields, first.setup.fields, 'the default names changed language');
            await page.click('#btn-lang-fa');
            const again = await snap();
            assert.deepEqual(again, first);
            assert.equal(await resumeShown(page), true);
            assert.equal(await page.textContent('#btn-resume-game'), say('fa', 'welcome.resume'));
        });
    });

    it('the English reveal and moderator screens show no Persian letter, apart from names the players typed', async () => {
        await game(
            async (page) => {
                const players = await dealGame(page, 'en', 8);
                await page.click('#btn-reveal-show');
                assert.deepEqual(persianIn(await recordScreen(page)), [], 'a card');
                await page.click('#btn-reveal-hide');
                assert.deepEqual(persianIn(await recordScreen(page)), [], 'a gate');
                for (let i = 1; i < players.length; i++) await passOnePlayer(page, { lang: 'en', index: i, count: 8, players });
                await page.click('#btn-roles-toggle');
                assert.deepEqual(persianIn(await recordScreen(page)), [], 'the moderator list with the roles shown');
            },
            { lang: 'en' }
        );
    });
});

describe('the screens on a finger (touch phone)', () => {
    it('a whole 6-player game can be played with taps only', async () => {
        await game(
            async (page) => {
                await tapWhenStill(page, '#btn-nav-setup');
                await page.waitForSelector('#screen-setup:not(.hidden)');
                await tapWhenStill(page, '#btn-deal');
                await page.waitForSelector('#reveal-gate:not(.hidden)');
                await page.waitForSelector('#screen-setup.hidden', { state: 'attached' });
                const count = (await savedPlayers(page)).length;
                for (let i = 0; i < count; i++) {
                    await tapWhenStill(page, '#btn-reveal-show');
                    await page.waitForSelector('#reveal-card:not(.hidden)');
                    await tapWhenStill(page, '#btn-reveal-hide');
                    await page.waitForSelector(i < count - 1 ? '#reveal-gate:not(.hidden)' : '#screen-moderator:not(.hidden)');
                }
                await tapWhenStill(page, '#btn-roles-toggle');
                assert.equal(await page.locator('#moderator-list .moderator-role').count(), count);
            },
            { touch: true }
        );
    });
});
