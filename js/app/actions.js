/**
 * The action handler: the big switch behind `dispatch()`.
 *
 * This is the top of the dependency graph. It may import anything, and nothing may import it except
 * `app/wire.js`, which installs it as the handler behind `core/dispatch.js`. Everything below reaches it
 * only through that port, which is what keeps `core/`, `game/` and `ui/` free of import cycles.
 */

import { VALID_PHASES } from '../core/config.js';
import { dispatch } from '../core/dispatch.js';
import { commitState, isMatchInProgress, setPhase } from '../core/phase.js';
import { gameState, session } from '../core/state.js';
import { clearSavedGame } from '../core/storage.js';
import { getLang, normalizeLang, setLang, t } from '../i18n/index.js';
import { clearToasts } from '../ui/feedback.js';
import { trapFocus } from '../ui/focusTrap.js';
import { advanceReveal, playerCount } from '../ui/revealFlow.js';
import { hasSavedGame, loadSavedGame } from '../ui/savedGame.js';
import { applyPlayersCountChange, prepareDeal, resetSetupForm } from '../ui/setup.js';
import { THEME_STORAGE_KEY, updateThemeMeta } from '../ui/theme.js';

let lastFocusedElement = null;

/** The phases that show a game: they can only be entered while there is one. */
const PHASES_WITH_A_GAME = new Set(['reveal', 'moderator']);

/** Open the shared confirm dialog with the "discard the game" texts; `onYes` runs only if the person says yes. */
function confirmDiscard(onYes) {
    document.getElementById('confirm-modal-title').textContent = t('confirm.discard.title');
    document.getElementById('confirm-modal-text').textContent = t('confirm.discard.text');
    session.pendingConfirmAction = onYes;
    dispatch({type: 'OPEN_MODAL', payload: 'confirm-modal'});
}

/** Leave the dealt game for good: it, its saved copy and everything the setup form held are gone. */
function discardGame(nextPhase) {
    gameState.game = null;
    gameState.reveal = { index: 0 };
    session.revealCardOpen = false;
    session.rolesShown = false;
    clearSavedGame();
    resetSetupForm();
    setPhase(nextPhase);
}

/** Begin the reveal of a freshly dealt game. Whatever was saved before is replaced. */
function startGame(game) {
    gameState.game = game;
    gameState.reveal = { index: 0 };
    session.revealCardOpen = false;
    session.rolesShown = false;
    clearSavedGame();
    resetSetupForm();
    // The message of an earlier refusal ("write the name of player 3") must not follow the form onto the hand-off screen.
    clearToasts();
    setPhase('reveal');
}

export function handleAction(action) {
    switch(action.type) {
        case 'CHANGE_THEME':
            document.body.setAttribute('data-theme', action.payload);
            updateThemeMeta(action.payload);
            try {
                localStorage.setItem(THEME_STORAGE_KEY, action.payload);
            } catch(e){}
            break;
        case 'SET_LANG': {
            // Only a real, supported language code counts: normalizeLang maps everything else (undefined, an
            // array, 'de', '__proto__') to the default, which then differs from the request.
            const lang = action.payload;
            if (normalizeLang(lang) !== lang) return;
            // A match keeps the language it was started in, so nothing can switch it while one is running.
            if (isMatchInProgress()) return;
            if (lang === getLang()) return;
            setLang(lang);
            break;
        }
        case 'NAVIGATE':
            if (VALID_PHASES.has(action.payload) && (!PHASES_WITH_A_GAME.has(action.payload) || gameState.game)) {
                setPhase(action.payload);
            }
            break;
        case 'SET_PLAYERS_COUNT':
            applyPlayersCountChange();
            break;
        case 'DEAL_GAME': {
            const game = prepareDeal();
            if (!game) break;
            // A saved game that was never resumed is not thrown away without asking.
            if (hasSavedGame()) confirmDiscard(() => startGame(game));
            else startGame(game);
            break;
        }
        case 'RESUME_GAME': {
            const saved = loadSavedGame();
            // Nothing usable any more (it was cleared or damaged since the welcome screen was drawn): stay put.
            if (!saved) {
                setPhase('welcome');
                break;
            }
            gameState.game = saved.game;
            gameState.reveal = { index: saved.revealIndex };
            session.revealCardOpen = false;
            session.rolesShown = false;
            setPhase(saved.phase);
            break;
        }
        case 'REVEAL_SHOW':
            if (gameState.phase !== 'reveal' || !gameState.game) break;
            session.revealCardOpen = true;
            commitState();
            break;
        case 'REVEAL_HIDE': {
            // Only a card that is showing can be hidden and passed on: a stray second tap must not skip a player.
            if (gameState.phase !== 'reveal' || !gameState.game || !session.revealCardOpen) break;
            session.revealCardOpen = false;
            const next = advanceReveal(gameState.reveal && gameState.reveal.index, playerCount(gameState.game));
            gameState.reveal = { index: next.index };
            if (next.done) setPhase('moderator');
            else commitState();
            break;
        }
        case 'CONFIRM_LEAVE_REVEAL':
            if (gameState.phase === 'reveal') confirmDiscard(() => discardGame('setup'));
            break;
        case 'CONFIRM_NEW_GAME':
            if (gameState.phase === 'moderator') confirmDiscard(() => discardGame('welcome'));
            break;
        case 'TOGGLE_ROLES':
            if (gameState.phase !== 'moderator') break;
            session.rolesShown = !session.rolesShown;
            commitState();
            break;
        case 'HIDE_SECRETS':
            // The page is going out of sight: a role card goes back to its gate and the list hides its roles.
            if (!session.revealCardOpen && !session.rolesShown) break;
            session.revealCardOpen = false;
            session.rolesShown = false;
            if (PHASES_WITH_A_GAME.has(gameState.phase)) commitState();
            break;
        case 'OPEN_MODAL': {
            lastFocusedElement = document.activeElement;
            const modal = document.getElementById(action.payload);
            if (modal) {
                modal.classList.remove('hidden');
                document.getElementById('main-content-root').inert = true;
                document.body.style.overflow = 'hidden';
                trapFocus(modal);
            }
            break;
        }
        case 'CLOSE_MODAL': {
            const modal = document.getElementById(action.payload);
            if (modal) {
                modal.classList.add('hidden');
                modal.onkeydown = null;
            }
            if (!document.querySelector('.modal-overlay:not(.hidden)')) {
                document.getElementById('main-content-root').inert = false;
                document.body.style.overflow = '';
                if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                    lastFocusedElement.focus();
                }
            }
            break;
        }
    }
}
