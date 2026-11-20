/**
 * Screen rendering driven by gameState.phase.
 */

import { GAME_PHASES } from '../core/config.js';
import { gameState } from '../core/state.js';
import { clearGameDom, renderGame } from './gameScreens.js';
import { clearRoleCard, renderReveal } from './reveal.js';
import { syncResumeButton } from './resume.js';

let previousPhase = null;
let previousKey = null;

/** The screens that move the focus themselves (the reveal screen does it at every step, not only when it opens). */
const FOCUS_THEMSELVES = new Set(['reveal']);

function moveFocusTo(element) {
    if (!element) return;
    element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
}

export function renderUI() {
    document.querySelectorAll('.screen-view').forEach(e => e.classList.add('hidden'));
    // A role card never outlives the reveal screen: whatever phase comes next (the first night after the last card,
    // setup after "back"), no role is left behind in the hidden page.
    if (gameState.phase !== 'reveal') clearRoleCard();
    const inGame = GAME_PHASES.includes(gameState.phase);
    const chrome = document.getElementById('game-chrome');
    if (chrome) chrome.classList.toggle('hidden', !inGame);
    const screenEl = document.getElementById(`screen-${gameState.phase}`);
    if (screenEl) {
        screenEl.classList.remove('hidden');
        if (gameState.phase === 'welcome') syncResumeButton();
        if (gameState.phase === 'reveal') renderReveal();
        const drawn = inGame ? renderGame() : null;
        // Outside a game nothing of one is left in the page: no name, no role, no note.
        if (!inGame && document.getElementById('players-list')) clearGameDom();
        const phaseChanged = previousPhase !== gameState.phase;
        if (phaseChanged) {
            screenEl.classList.remove('screen-anim');
            void screenEl.offsetWidth;
            screenEl.classList.add('screen-anim');
            // Nothing is open on a screen that has just changed: the rules are closed again, like the roles and the notes.
            const rules = document.getElementById('rules-details');
            if (rules) rules.open = false;
        }
        if (drawn) {
            // A game screen moves the focus to its heading and says where the game is whenever it is a NEW screen or a
            // new step of the night (also after an undo), never for a redraw of the same one (a toggle, a vote count).
            if (drawn.key !== previousKey) {
                moveFocusTo(screenEl.querySelector('h1, h2, h3'));
                const live = document.getElementById('game-live');
                if (live) live.textContent = drawn.live;
            }
            previousKey = drawn.key;
        } else {
            previousKey = null;
            if (phaseChanged && !FOCUS_THEMSELVES.has(gameState.phase)) moveFocusTo(screenEl.querySelector('h1, h2, h3'));
        }
    }
    previousPhase = gameState.phase;
}
