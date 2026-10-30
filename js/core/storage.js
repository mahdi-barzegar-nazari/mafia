/**
 * localStorage persistence: the saved match.
 *
 * Every key of this app starts with `mafia_`: localStorage is shared by every page of an origin, so a
 * different prefix keeps this app apart from any other app hosted on the same origin.
 */

import { SAVE_VERSION, gameState } from './state.js';

/** The key of the saved match. */
export const SAVE_KEY = 'mafia_full_state_master';

/**
 * Save the match, but only when one exists (it has players): the welcome and setup screens hold nothing worth
 * keeping. The record is `{ version, state }`; a reader ignores any other version (see `SAVE_VERSION`).
 */
export function persist() {
    if (gameState.players.length > 0) {
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
