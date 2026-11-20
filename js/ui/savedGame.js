/**
 * The saved game, checked. `core/storage.js` hands over the raw record (it sits below the rules engine and does not
 * know what a game is); this file decides whether what is in it can be resumed. Nothing in storage is trusted: the
 * game must replay (`deserializeGame` validates the setup and every action), the phase must be one a game can be
 * resumed in, and the reveal index is brought back to a real player. Anything else is "no save".
 *
 * The phase of a game that is past the reveal is not taken from the label that was saved: it is the engine's own
 * phase of the replayed game, so a stale or edited label can never put the wrong screen on top of a game.
 */

import { readSavedState } from '../core/storage.js';
import { getState } from '../game/engine.js';
import { deserializeGame } from '../game/persistence.js';
import { sanitizeRevealIndex } from './revealFlow.js';

/** The phases a saved game can come back to. The welcome and setup screens hold no game, so they are never saved. */
export const RESUMABLE_PHASES = Object.freeze(['reveal', 'night', 'morning', 'day', 'dusk', 'ended']);

/**
 * The game that can be resumed: `{ phase, game, revealIndex }`, or null when nothing is saved or what is saved is
 * not a usable game. `game` is the engine's own, re-validated copy; `revealIndex` is 0 outside the reveal phase.
 * `phase` is `'reveal'` for a game saved while the roles were being handed out (that is only possible while the
 * game has no action yet), otherwise the engine's phase of the game. It never throws, whatever storage holds.
 */
export function loadSavedGame() {
    try {
        const state = readSavedState();
        if (state === null) return null;
        if (!RESUMABLE_PHASES.includes(state.phase)) return null;
        const loaded = deserializeGame(JSON.stringify(state.game));
        if (!loaded.ok) return null;
        const count = loaded.game.setup.players.length;
        if (state.phase === 'reveal') {
            if (loaded.game.actions.length > 0) return null;
            const saved = state.reveal;
            const revealIndex = sanitizeRevealIndex(saved !== null && typeof saved === 'object' ? saved.index : undefined, count);
            return { phase: 'reveal', game: loaded.game, revealIndex };
        }
        const derived = getState(loaded.game);
        if (!derived) return null;
        return { phase: derived.phase, game: loaded.game, revealIndex: 0 };
    } catch (e) {
        return null;
    }
}

/** True when `loadSavedGame` finds a game to resume (what decides whether the welcome screen offers it). */
export function hasSavedGame() {
    return loadSavedGame() !== null;
}
