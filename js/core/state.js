/**
 * The single mutable game state, plus ephemeral per-page session state.
 */

import { DEFAULT_PLAYERS_COUNT } from './config.js';

/**
 * The format of a saved game (see `persist` in `core/storage.js`). Bump it when the shape of `gameState` changes:
 * a record of any other version is ignored. Version 2 added `game` and `reveal`. Version 3 (step 3B) changed what
 * `phase` can be: after the reveal it is the engine's own phase (night, morning, day, dusk, ended), and the
 * temporary `moderator` phase is gone.
 */
export const SAVE_VERSION = 3;

export const gameState = {
    version: SAVE_VERSION,
    stateVersion: 1,
    // welcome, setup, reveal, or (from the last role card on) the phase of the rules engine for `game`. Re-derived from
    // the engine after every action and every undo, so the two can never disagree.
    phase: 'welcome',
    settings: { playersCount: DEFAULT_PLAYERS_COUNT },
    // Unused since step 3A: the players of a game are inside the game object itself (the rules engine owns them).
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
 *
 * Everything the game screens need beyond `gameState.game` and `gameState.reveal` lives here, so a reload always
 * lands on the screen the engine says it should (the current night step, nothing selected, nothing revealed).
 */
export const session = {
    /** callback run by the shared confirm modal's "yes" button */
    pendingConfirmAction: null,
    /** true while the role card of the reveal phase is on screen (the hand-off gate otherwise); never saved, so a reload always lands on a gate */
    revealCardOpen: false,
    /** true while the players panel shows the roles; hidden again whenever the phase changes and whenever the page is hidden */
    rolesShown: false,
    /** true while the morning's moderator notes are open; hidden again whenever the phase changes and whenever the page is hidden */
    notesShown: false,
    /** the player id picked for the current night step but not yet confirmed, or null; cleared by every action, undo, phase change and page hide */
    nightTarget: null,
    /** the vote being counted on the day screen: { playerId: count } with only the non-zero counts; reset on every phase change and every undo */
    voteCounts: {},
    /** the clock reading (see ui/clock.js) at which the last role card was hidden, or null; what the 800 ms hand-off guard measures from */
    cardHiddenAt: null
};

/**
 * Put every toggle and pending choice of the game screens back to its closed, empty state: no role card, no
 * roles in the players panel, no notes, nothing picked, no votes counted. It does NOT touch `cardHiddenAt`: the
 * hand-off guard must outlive the change from the last role card to the first night.
 */
export function resetScreenSession() {
    session.revealCardOpen = false;
    session.rolesShown = false;
    session.notesShown = false;
    session.nightTarget = null;
    session.voteCounts = {};
}

function replaceContents(target, next) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, next);
}

/** Swap in a restored game without breaking every module's reference to `gameState`. */
export function replaceGameState(next) {
    replaceContents(gameState, next);
}
