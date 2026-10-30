/**
 * Phase transitions and the commit step (render, then persist).
 *
 * This module sits below `game/` and `ui/` and must not import either. The two things it cannot know
 * about are injected by `app/wire.js` at start-up:
 *   - the screen renderer (`setRenderer`), which `commitState` calls before persisting;
 *   - a hook that runs just before the phase changes (`setBeforePhaseChange`), for a phase that owns something
 *     (a timer, say) that must not outlive its screen. Nothing uses it yet.
 */

import { VALID_PHASES } from './config.js';
import { gameState } from './state.js';
import { persist } from './storage.js';
import { requestWakeLock } from '../platform/wakeLock.js';

let renderer = null;
let beforePhaseChange = null;

/**
 * The phases in which no match exists yet: the welcome screen and the setup form. Every other phase belongs to
 * a match.
 */
const OUTSIDE_MATCH_PHASES = new Set(['welcome', 'setup']);

/**
 * True while a match is in progress, which is when the language must not change: a match may hold texts in its
 * own language. A phase this module does not know counts as in progress, so a damaged state can never unlock
 * the switch.
 */
export function isMatchInProgress() {
    return !OUTSIDE_MATCH_PHASES.has(gameState.phase);
}

/** Install the function that redraws the screen for `gameState.phase`. */
export function setRenderer(fn) {
    renderer = fn;
}

/** Install a hook called as `fn(fromPhase, toPhase)` before `gameState.phase` is overwritten. */
export function setBeforePhaseChange(fn) {
    beforePhaseChange = fn;
}

export function commitState() {
    if (!renderer) throw new Error('commitState() ran before a renderer was installed; call wireApp() first.');
    renderer();
    persist();
}

export function setPhase(p) {
    if (!VALID_PHASES.has(p)) return;
    if (beforePhaseChange) beforePhaseChange(gameState.phase, p);
    gameState.phase = p;
    requestWakeLock();
    commitState();
}
