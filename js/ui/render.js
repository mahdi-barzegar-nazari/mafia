/**
 * Screen rendering driven by gameState.phase.
 */

import { gameState } from '../core/state.js';
import { renderModerator } from './moderator.js';
import { clearRoleCard, renderReveal } from './reveal.js';
import { syncResumeButton } from './resume.js';

let previousPhase = null;

/** The screens that move the focus themselves (the reveal screen does it at every step, not only when it opens). */
const FOCUS_THEMSELVES = new Set(['reveal']);

export function renderUI() {
    document.querySelectorAll('.screen-view').forEach(e => e.classList.add('hidden'));
    // A role card never outlives the reveal screen: whatever phase comes next (the moderator's list after the
    // last card, setup after "back"), no role is left behind in the hidden page.
    if (gameState.phase !== 'reveal') clearRoleCard();
    const screenEl = document.getElementById(`screen-${gameState.phase}`);
    if (screenEl) {
        screenEl.classList.remove('hidden');
        if (gameState.phase === 'welcome') syncResumeButton();
        if (gameState.phase === 'reveal') renderReveal();
        if (gameState.phase === 'moderator') renderModerator();
        if (previousPhase !== gameState.phase) {
            screenEl.classList.remove('screen-anim');
            void screenEl.offsetWidth;
            screenEl.classList.add('screen-anim');
            const targetHeading = FOCUS_THEMSELVES.has(gameState.phase) ? null : screenEl.querySelector('h1, h2, h3');
            if (targetHeading) {
                targetHeading.setAttribute('tabindex', '-1');
                targetHeading.focus({ preventScroll: true });
            }
        }
    }
    previousPhase = gameState.phase;
}
