/**
 * Shared plumbing for the game-*.test.mjs files: a seeded random function, ready-made games, one-line
 * action builders and a few assertions. No test logic of its own.
 */
import assert from 'node:assert/strict';
import { applyAction, createGame, getState } from '../../../js/game/engine.js';
import { roleCounts, roleList } from '../../../js/game/roles.js';

/** mulberry32: a small seeded generator returning numbers in [0, 1). The same seed gives the same sequence. */
export function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const namesFor = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

/** The roles of n players in canonical order: the mafia team first, then doctor, detective, citizens. */
export const dealt = (n, rules) => roleList(roleCounts(n, rules));

/** Eight players: p1 p2 mafia, p3 doctor, p4 detective, p5 to p8 citizens. */
export const EIGHT = ['mafia', 'mafia', 'doctor', 'detective', 'citizen', 'citizen', 'citizen', 'citizen'];
/** Eight players with the godfather: p1 mafia, p2 godfather, p3 doctor, p4 detective, p5 to p8 citizens. */
export const EIGHT_GODFATHER = ['mafia', 'godfather', 'doctor', 'detective', 'citizen', 'citizen', 'citizen', 'citizen'];

/** A new game of n players; `roles` default to the canonical deal. Asserts that createGame accepts it. */
export function newGame(n, { rules, roles } = {}) {
    const result = createGame({ names: namesFor(n), rules, roles: roles ?? dealt(n, rules) });
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.game;
}

export const eight = (rules) => newGame(8, { rules, roles: EIGHT });
export const eightGodfather = (rules) => newGame(8, { rules: { godfather: true, ...rules }, roles: EIGHT_GODFATHER });

export const kill = (target) => ({ type: 'MAFIA_KILL', target });
export const save = (target) => ({ type: 'DOCTOR_SAVE', target });
export const check = (target) => ({ type: 'DETECTIVE_CHECK', target });
export const votes = (tally) => ({ type: 'CAST_VOTES', tally });
export const CONTINUE = Object.freeze({ type: 'CONTINUE' });

/** Apply the actions in order and assert each is accepted. Returns the final game. */
export function play(game, ...actions) {
    let current = game;
    for (const action of actions) {
        const result = applyAction(current, action);
        assert.equal(result.ok, true, `${JSON.stringify(action)} was refused: ${JSON.stringify(result)}`);
        current = result.game;
    }
    return current;
}

/** From the morning: CONTINUE, an empty vote (nobody is eliminated), CONTINUE. The next night begins. */
export const toNextNight = (game) => play(game, CONTINUE, votes({}), CONTINUE);

/** Assert that the action is refused with `error`, and that nothing about the game changed. */
export function assertRefused(game, action, error) {
    const before = JSON.stringify(game);
    const stateBefore = getState(game);
    const result = applyAction(game, action);
    assert.deepEqual(result, { ok: false, error }, `${JSON.stringify(action)}`);
    assert.equal(JSON.stringify(game), before, 'the game must not change');
    assert.deepEqual(getState(game), stateBefore);
}

export function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

export const ids = (state, role) => state.players.filter((p) => p.role === role).map((p) => p.id);
export const aliveIds = (state) => state.players.filter((p) => p.alive).map((p) => p.id);
export const deadIds = (state) => state.players.filter((p) => !p.alive).map((p) => p.id);
