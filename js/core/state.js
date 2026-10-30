/**
 * The single mutable game state, plus ephemeral per-page session state.
 */

import { DEFAULT_PLAYERS_COUNT } from './config.js';

/** The format of a saved game (see `persist` in `core/storage.js`). Bump it when the shape of `gameState` changes. */
export const SAVE_VERSION = 1;

export const gameState = {
    version: SAVE_VERSION,
    stateVersion: 1,
    phase: 'welcome',
    settings: { playersCount: DEFAULT_PLAYERS_COUNT },
    players: []
};

/**
 * Ephemeral UI/session state. Never persisted; resets on reload.
 */
export const session = {
    /** callback run by the shared confirm modal's "yes" button */
    pendingConfirmAction: null
};

function replaceContents(target, next) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, next);
}

/** Swap in a restored game without breaking every module's reference to `gameState`. */
export function replaceGameState(next) {
    replaceContents(gameState, next);
}
