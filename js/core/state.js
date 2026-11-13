/**
 * The single mutable game state, plus ephemeral per-page session state.
 */

import { DEFAULT_PLAYERS_COUNT } from './config.js';

/**
 * The format of a saved game (see `persist` in `core/storage.js`). Bump it when the shape of `gameState` changes:
 * a record of any other version is ignored. Version 2 added `game` and `reveal`.
 */
export const SAVE_VERSION = 2;

export const gameState = {
    version: SAVE_VERSION,
    stateVersion: 1,
    phase: 'welcome',
    settings: { playersCount: DEFAULT_PLAYERS_COUNT },
    // Unused since step 3A: the players of a game are in `game.setup.players` (the rules engine owns them).
    players: [],
    // The game of the rules engine (js/game/), plain JSON, or null while there is none. Only app/ and ui/ read it
    // through the engine's API; core/ just carries it and saves it.
    game: null,
    // How many players have already seen their role in the reveal phase: the index of the player whose
    // hand-off gate comes next. No secret in it.
    reveal: { index: 0 }
};

/**
 * Ephemeral UI/session state. Never persisted; resets on reload.
 */
export const session = {
    /** callback run by the shared confirm modal's "yes" button */
    pendingConfirmAction: null,
    /** true while the role card of the reveal phase is on screen (the hand-off gate otherwise); never saved, so a reload always lands on a gate */
    revealCardOpen: false,
    /** true while the moderator's list shows the roles; hidden again whenever the screen opens and whenever the page is hidden */
    rolesShown: false
};

function replaceContents(target, next) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, next);
}

/** Swap in a restored game without breaking every module's reference to `gameState`. */
export function replaceGameState(next) {
    replaceContents(gameState, next);
}
