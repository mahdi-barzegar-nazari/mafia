/**
 * Saving and loading a game as text. The text is untrusted on the way back in: a save is accepted only when
 * it is valid JSON of the right version, its setup passes `createGame`'s validation, and every action
 * replays; anything else rejects the whole save. Pure: it returns the text and the game, storing nothing.
 */
import { ERRORS, GAME_SAVE_VERSION } from './constants.js';
import { createGame, hasGameShape, replayGame } from './engine.js';
import { deepEqual, isPlainObject } from './json.js';

export { GAME_SAVE_VERSION };

const fail = (error) => ({ ok: false, error });

const hasExactKeys = (value, keys) => isPlainObject(value) && Object.keys(value).sort().join() === [...keys].sort().join();

/** The game as JSON text. Throws a TypeError for something that is not a game (a programming error). */
export function serializeGame(game) {
    if (!hasGameShape(game)) throw new TypeError('serializeGame: not a game');
    return JSON.stringify({ version: game.version, setup: game.setup, actions: game.actions });
}

function load(text) {
    if (typeof text !== 'string') return fail(ERRORS.INVALID_SAVE);
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return fail(ERRORS.INVALID_JSON);
    }
    if (!isPlainObject(data)) return fail(ERRORS.INVALID_SAVE);
    if (data.version !== GAME_SAVE_VERSION) return fail(ERRORS.UNSUPPORTED_VERSION);
    if (!hasExactKeys(data, ['version', 'setup', 'actions']) || !Array.isArray(data.actions)) return fail(ERRORS.INVALID_SAVE);

    // The setup must be exactly what createGame builds from it: legal names, roles and rules, ids p1..pN.
    const { setup } = data;
    if (!hasExactKeys(setup, ['players', 'rules']) || !Array.isArray(setup.players)) return fail(ERRORS.INVALID_SETUP);
    if (!setup.players.every((p) => hasExactKeys(p, ['id', 'name', 'role']))) return fail(ERRORS.INVALID_SETUP);
    const created = createGame({
        names: setup.players.map((p) => p.name),
        roles: setup.players.map((p) => p.role),
        rules: setup.rules
    });
    if (!created.ok || !deepEqual(created.game.setup, setup)) return fail(ERRORS.INVALID_SETUP);

    // Every action must replay, and be stored in its normal form.
    const replayed = replayGame({ version: GAME_SAVE_VERSION, setup: created.game.setup, actions: data.actions });
    if (!replayed.ok || !deepEqual(replayed.actions, data.actions)) return fail(ERRORS.REPLAY_FAILED);

    return { ok: true, game: { version: GAME_SAVE_VERSION, setup: created.game.setup, actions: replayed.actions } };
}

/** `{ ok: true, game }` or `{ ok: false, error }`. Never throws, whatever it is given. */
export function deserializeGame(text) {
    try {
        return load(text);
    } catch {
        return fail(ERRORS.INVALID_SAVE);
    }
}
