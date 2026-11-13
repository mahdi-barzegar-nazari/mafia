/**
 * The saved game, checked. `core/storage.js` hands over the raw record (it sits below the rules engine and does not
 * know what a game is); this file decides whether what is in it can be resumed. Nothing in storage is trusted: the
 * game must replay (`deserializeGame` validates the setup and every action), the phase must be one a game can be
 * resumed in, and the reveal index is brought back to a real player. Anything else is "no save".
 */

import { readSavedState } from '../core/storage.js';
import { deserializeGame } from '../game/persistence.js';
import { sanitizeRevealIndex } from './revealFlow.js';

/** The phases a saved game can come back to. The welcome and setup screens hold no game, so they are never saved. */
export const RESUMABLE_PHASES = Object.freeze(['reveal', 'moderator']);

/**
 * The game that can be resumed: `{ phase, game, revealIndex }`, or null when nothing is saved or what is saved is
 * not a usable game. `game` is the engine's own, re-validated copy; `revealIndex` is 0 outside the reveal phase.
 * It never throws, whatever storage holds.
 */
export function loadSavedGame() {
    try {
        const state = readSavedState();
        if (state === null) return null;
        if (!RESUMABLE_PHASES.includes(state.phase)) return null;
        const loaded = deserializeGame(JSON.stringify(state.game));
        if (!loaded.ok) return null;
        const count = loaded.game.setup.players.length;
        const saved = state.reveal;
        const revealIndex = state.phase === 'reveal' ? sanitizeRevealIndex(saved !== null && typeof saved === 'object' ? saved.index : undefined, count) : 0;
        return { phase: state.phase, game: loaded.game, revealIndex };
    } catch (e) {
        return null;
    }
}

/** True when `loadSavedGame` finds a game to resume (what decides whether the welcome screen offers it). */
export function hasSavedGame() {
    return loadSavedGame() !== null;
}
