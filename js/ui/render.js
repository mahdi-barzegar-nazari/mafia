/**
 * Screen rendering driven by gameState.phase.
 */

import { gameState } from '../core/state.js';

let previousPhase = null;

export function renderUI() {
    document.querySelectorAll('.screen-view').forEach(e => e.classList.add('hidden'));
    const screenEl = document.getElementById(`screen-${gameState.phase}`);
    if (screenEl) {
        screenEl.classList.remove('hidden');
        if (previousPhase !== gameState.phase) {
            screenEl.classList.remove('screen-anim');
            void screenEl.offsetWidth;
            screenEl.classList.add('screen-anim');
            const targetHeading = screenEl.querySelector('h1, h2, h3');
            if (targetHeading) {
                targetHeading.setAttribute('tabindex', '-1');
                targetHeading.focus({ preventScroll: true });
            }
        }
    }
    previousPhase = gameState.phase;
}
