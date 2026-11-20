/**
 * The layout check of the game screens (night, morning, day, dusk, ended) for 3, 8 and 20 players in one theme and one
 * language: nothing sticks out sideways, every control is a finger-sized target, the text can be read.
 *
 * The screens are reached through the saved game, not by playing: a small bot plays a whole game with the rules engine
 * (it is pure, so a test may use it), the game after each move is a snapshot, and the page is given the snapshot as its
 * saved game and resumes it. The real way there (dealing, handing out the cards, the night, the vote) is played through
 * the buttons in game-flow.test.mjs and play-through.test.mjs.
 */
import assert from 'node:assert/strict';
import { SAVE_VERSION } from '../../../js/core/state.js';
import { createGame, applyAction, getState } from '../../../js/game/engine.js';
import { getModeratorView } from '../../../js/game/view.js';
import { assertReadable } from './contrast.mjs';
import { SAVE_KEY, assertFitsPhone, assertTouchTargets, makeNames, shown } from './game.mjs';

const ACTION = { mafia: 'MAFIA_KILL', doctor: 'DOCTOR_SAVE', detective: 'DETECTIVE_CHECK' };

/** A seeded generator, so the same game is dealt every run. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Every game the bot passes through, from the first night to the end: [{ game, phase, actions }]. */
export function botGame(count, lang, seed = 11) {
    const created = createGame({ names: makeNames(count, lang), rules: { godfather: count >= 6, doctorSelfSave: 'once', revealRoleOnDeath: true }, random: seeded(seed) });
    assert.equal(created.ok, true);
    let game = created.game;
    const snapshots = [{ game, phase: 'night', actions: 0 }];
    for (let guard = 0; guard < 500; guard++) {
        const state = getState(game);
        if (state.phase === 'ended') break;
        const alive = state.players.filter((p) => p.alive);
        const team = alive.filter((p) => p.role === 'mafia' || p.role === 'godfather');
        let action;
        if (state.phase === 'night') {
            const step = getModeratorView(state).steps.find((entry) => entry.current);
            const offered = step.targetIds;
            const town = offered.filter((id) => !team.some((p) => p.id === id));
            const target = step.step === 'mafia' ? (town[0] ?? offered[0]) : step.step === 'doctor' ? offered.at(-1) : offered[0];
            action = { type: ACTION[step.step], target };
        } else if (state.phase === 'day') {
            // the whole table votes for the first mafia member
            action = { type: 'CAST_VOTES', tally: team.length > 0 ? { [team[0].id]: alive.length } : {} };
        } else action = { type: 'CONTINUE' };
        const result = applyAction(game, action);
        assert.equal(result.ok, true, JSON.stringify([action, result]));
        game = result.game;
        snapshots.push({ game, phase: getState(game).phase, actions: game.actions.length });
    }
    return snapshots;
}

/** The snapshots worth looking at: the first of each kind of screen, the night in progress, a later night, and the end. */
export function interesting(snapshots) {
    const pick = [];
    const add = (snapshot, label) => snapshot && !pick.some((p) => p.snapshot === snapshot) && pick.push({ snapshot, label });
    add(snapshots[0], 'night, first step');
    add(snapshots[1], 'night, a step done');
    for (const phase of ['morning', 'day', 'dusk']) add(snapshots.find((s) => s.phase === phase), phase);
    const second = snapshots.findIndex((s, i) => s.phase === 'night' && i > 0 && snapshots[i - 1].phase === 'dusk');
    if (second !== -1) add(snapshots[second], 'second night');
    add(snapshots.at(-1), 'ended');
    return pick;
}

/** Hand `game` to the page as its saved game and resume it. */
export async function resumeOn(page, game) {
    const record = JSON.stringify({ version: SAVE_VERSION, state: { phase: getState(game).phase, settings: {}, reveal: { index: 0 }, game } });
    // A page that holds a game saves it when it goes away: leave it first (a new visit), and only then write the record,
    // so that the one the test wrote is the one that is there when the next page starts.
    await page.goto(page.url());
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, record]);
    await page.reload();
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    await page.click('#btn-resume-game');
    await page.waitForSelector('#screen-welcome.hidden', { state: 'attached' });
}

const TEXT = {
    night: ['#screen-night h2', '#screen-night p', '.step-name', '.step-status', '.step-pause', '.target-name', '#game-chrome h3', '.player-name', '.player-role', '.player-status', '#rules-list li', '#rules-details summary'],
    morning: ['#screen-morning h2', '#morning-announcement', '#morning-notes-list li', '#game-chrome h3', '.player-name', '.player-status'],
    day: ['#screen-day h2', '#screen-day p', '.vote-name', '.stepper-count', '#day-counter', '.player-name', '.player-status'],
    dusk: ['#screen-dusk h2', '#dusk-result', '.player-name', '.player-status'],
    ended: ['#screen-ended h2', '#ended-winner', '.player-name', '.player-role', '.player-status']
};

/** Fit, targets and (for 8 players) contrast of the screen that is up, with every toggle opened that opens something. */
async function inspect(page, phase, where, { contrast }) {
    await assertFitsPhone(page, where);
    await assertTouchTargets(page, where);
    if (phase !== 'ended') {
        await page.click('#btn-roles-toggle');
        await page.locator('#rules-details summary').click();
    }
    if (phase === 'morning') await page.click('#btn-morning-notes');
    if (phase === 'day') {
        const plus = page.locator('.stepper-plus');
        await plus.first().click();
        await plus.first().click();
        await plus.nth((await plus.count()) - 1).click();
    }
    await assertFitsPhone(page, `${where}, everything open`);
    await assertTouchTargets(page, `${where}, everything open`);
    if (contrast) await assertReadable(page, TEXT[phase], `${where}, everything open`);
}

/** The whole check for one theme and one language. */
export async function runLayout(page, { lang, theme }) {
    assert.equal(await page.getAttribute('body', 'data-theme'), theme);
    for (const count of [3, 8, 20]) {
        const snapshots = interesting(botGame(count, lang, count));
        assert.ok(snapshots.length >= (count === 3 ? 3 : 6), `${count} players: the bot reached ${snapshots.map((s) => s.label).join(', ')}`);
        for (const { snapshot, label } of snapshots) {
            await resumeOn(page, snapshot.game);
            const phase = snapshot.phase;
            assert.deepEqual(await shown(page), [`screen-${phase}`]);
            await inspect(page, phase, `${theme}/${lang} ${count} players, ${label}`, { contrast: count === 8 });
        }
    }
}
