/**
 * localStorage persistence: the saved game.
 *
 * Every key of this app starts with `mafia_`: localStorage is shared by every page of an origin, so a
 * different prefix keeps this app apart from any other app hosted on the same origin.
 *
 * This module sits below `game/`: it only reads and writes the raw record and knows nothing about what a game
 * is. Whether the `game` inside a record is a real, replayable game is decided by `ui/savedGame.js`, with the
 * rules engine.
 */

import { SAVE_VERSION, gameState } from './state.js';

/** The key of the saved game. */
export const SAVE_KEY = 'mafia_full_state_master';

/**
 * Save the game, but only when one exists (`gameState.game` is not null): the welcome and setup screens hold
 * nothing worth keeping, and must never replace the game that an earlier visit left in storage. The record is
 * `{ version, state }`; a reader ignores any other version (see `SAVE_VERSION`).
 */
export function persist() {
    if (gameState.game !== null && gameState.game !== undefined) {
        try {
            const combined = {
                version: SAVE_VERSION,
                state: gameState
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(combined));
        } catch(e) {
            console.warn("Storage write restricted:", e);
        }
    }
}

/**
 * The `state` of the saved record, exactly as stored (untrusted), or `null` when there is none: nothing saved,
 * text that is not JSON, a record that is not `{ version, state }` of this `SAVE_VERSION`, or a storage that
 * throws. It never throws.
 */
export function readSavedState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (typeof raw !== 'string' || raw === '') return null;
        const record = JSON.parse(raw);
        if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
        if (record.version !== SAVE_VERSION) return null;
        const state = record.state;
        if (state === null || typeof state !== 'object' || Array.isArray(state)) return null;
        return state;
    } catch(e) {
        return null;
    }
}

/** Remove the saved game. A storage that throws is ignored: there is nothing more to do about it. */
export function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch(e) {}
}
