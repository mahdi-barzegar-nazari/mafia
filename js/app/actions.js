/**
 * The action handler: the big switch behind `dispatch()`.
 *
 * This is the top of the dependency graph. It may import anything, and nothing may import it except
 * `app/wire.js`, which installs it as the handler behind `core/dispatch.js`. Everything below reaches it
 * only through that port, which is what keeps `core/`, `game/` and `ui/` free of import cycles.
 */

import { GAME_PHASES, VALID_PHASES } from '../core/config.js';
import { dispatch } from '../core/dispatch.js';
import { commitState, isMatchInProgress, setPhase } from '../core/phase.js';
import { gameState, resetScreenSession, session } from '../core/state.js';
import { clearSavedGame } from '../core/storage.js';
import { ACTION_TYPES } from '../game/constants.js';
import { applyAction, getState, undo } from '../game/engine.js';
import { getLang, normalizeLang, setLang, t } from '../i18n/index.js';
import { errorText } from '../ui/errorTexts.js';
import { clearToasts, showToast } from '../ui/feedback.js';
import { trapFocus } from '../ui/focusTrap.js';
import { isGuarded, isHideGuarded, markCardHidden, markCardShown } from '../ui/handOffGuard.js';
import { isOfferedTarget, nightModel } from '../ui/nightModel.js';
import { advanceReveal, playerCount } from '../ui/revealFlow.js';
import { hasSavedGame, loadSavedGame } from '../ui/savedGame.js';
import { applyPlayersCountChange, prepareDeal, resetSetupForm } from '../ui/setup.js';
import { THEME_STORAGE_KEY, updateThemeMeta } from '../ui/theme.js';
import { stepCount, tallyOf } from '../ui/voteModel.js';

let lastFocusedElement = null;

/** The phases that show a game: they can only be entered while there is one. */
const PHASES_WITH_A_GAME = new Set(['reveal', ...GAME_PHASES]);

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
    resetScreenSession();
    session.cardHiddenAt = null;
    clearSavedGame();
    resetSetupForm();
    setPhase(nextPhase);
}

/** Begin the reveal of a freshly dealt game. Whatever was saved before is replaced. */
function startGame(game) {
    gameState.game = game;
    gameState.reveal = { index: 0 };
    resetScreenSession();
    session.cardHiddenAt = null;
    clearSavedGame();
    resetSetupForm();
    // The message of an earlier refusal ("write the name of player 3") must not follow the form onto the hand-off screen.
    clearToasts();
    setPhase('reveal');
}

/** The phase the rules engine says `gameState.game` is in, or null when there is no game (or one that cannot be replayed). */
function enginePhase() {
    const state = gameState.game ? getState(gameState.game) : null;
    return state ? state.phase : null;
}

/** True when the game screens are up: a game exists and the app is in one of the engine's phases. */
function inGame() {
    return Boolean(gameState.game) && GAME_PHASES.includes(gameState.phase);
}

/**
 * Take `game` (the result of an accepted action or undo) as the current one. Whatever a move makes stale is dropped
 * (the pick of the night, the votes being counted), and the phase is DERIVED again from the engine, never guessed:
 * a new phase goes through `setPhase` (which closes every toggle), the same phase is only redrawn and saved.
 */
function adoptGame(game) {
    gameState.game = game;
    session.nightTarget = null;
    session.voteCounts = {};
    const phase = enginePhase();
    if (phase !== null && phase !== gameState.phase) setPhase(phase);
    else commitState();
}

/** Apply `action` to the game and adopt the result, or tell the person (in words) and redraw when the engine refuses. */
function play(action) {
    const result = applyAction(gameState.game, action);
    if (result.ok) {
        adoptGame(result.game);
        return;
    }
    // The screens only offer what the engine allows, so this should not happen; if it does, say so in words and redraw
    // from the engine so the screen cannot keep showing something that is not true.
    session.nightTarget = null;
    commitState();
    showToast(errorText(result.error));
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
        case 'NAVIGATE': {
            const to = action.payload;
            if (!VALID_PHASES.has(to)) break;
            if (PHASES_WITH_A_GAME.has(to)) {
                // A game screen needs a game, and a screen after the reveal must be the engine's own phase.
                if (!gameState.game) break;
                if (to === 'reveal' ? gameState.game.actions.length > 0 : enginePhase() !== to) break;
            }
            setPhase(to);
            break;
        }
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
            // Only the game itself comes back: no card open, no role shown, nothing picked, no votes counted.
            resetScreenSession();
            session.cardHiddenAt = null;
            setPhase(saved.phase);
            break;
        }
        case 'REVEAL_SHOW':
            if (gameState.phase !== 'reveal' || !gameState.game) break;
            // A quick second tap after "Hide and pass on" lands on this button: it must not show the next role.
            if (isGuarded()) break;
            session.revealCardOpen = true;
            markCardShown();
            commitState();
            break;
        case 'REVEAL_HIDE': {
            // Only a card that is showing can be hidden and passed on: a stray second tap must not skip a player.
            if (gameState.phase !== 'reveal' || !gameState.game || !session.revealCardOpen) break;
            // The reverse double tap: a quick second tap on "I am {name}" lands on this button and would hide a card its
            // player has barely seen, with no way back to it. Nothing changes: the card stays, the index stays.
            if (isHideGuarded()) break;
            session.revealCardOpen = false;
            markCardHidden();
            const next = advanceReveal(gameState.reveal && gameState.reveal.index, playerCount(gameState.game));
            gameState.reveal = { index: next.index };
            // After the last card the game is in the engine's first phase (the first night).
            if (next.done) setPhase(enginePhase() ?? 'night');
            else commitState();
            break;
        }
        case 'CONFIRM_LEAVE_REVEAL':
            if (gameState.phase === 'reveal') confirmDiscard(() => discardGame('setup'));
            break;
        case 'CONFIRM_NEW_GAME':
            if (inGame() && !isGuarded()) confirmDiscard(() => discardGame('welcome'));
            break;
        case 'NEW_GAME_NOW':
            // The game is over: nothing to lose, so no question.
            if (gameState.phase === 'ended' && gameState.game && !isGuarded()) discardGame('welcome');
            break;
        case 'TOGGLE_ROLES':
            if (!inGame() || gameState.phase === 'ended' || isGuarded()) break;
            session.rolesShown = !session.rolesShown;
            commitState();
            break;
        case 'TOGGLE_NOTES':
            if (!inGame() || gameState.phase !== 'morning' || isGuarded()) break;
            session.notesShown = !session.notesShown;
            commitState();
            break;
        case 'NIGHT_SELECT': {
            if (!inGame() || gameState.phase !== 'night' || isGuarded()) break;
            const model = nightModel(getState(gameState.game));
            const id = action.payload;
            // Only a name the engine offers for this step; picking the same name again takes the pick back.
            if (!isOfferedTarget(model, id)) break;
            session.nightTarget = session.nightTarget === id ? null : id;
            commitState();
            break;
        }
        case 'NIGHT_CONFIRM': {
            if (!inGame() || gameState.phase !== 'night' || isGuarded()) break;
            const model = nightModel(getState(gameState.game));
            if (!model || !model.current || !isOfferedTarget(model, session.nightTarget)) break;
            play({ type: model.current.action, target: session.nightTarget });
            break;
        }
        case 'CONTINUE_GAME':
            if (!inGame() || (gameState.phase !== 'morning' && gameState.phase !== 'dusk') || isGuarded()) break;
            play({ type: ACTION_TYPES.CONTINUE });
            break;
        case 'VOTE_STEP': {
            if (!inGame() || gameState.phase !== 'day' || isGuarded()) break;
            const state = getState(gameState.game);
            const payload = action.payload;
            if (!state || payload === null || typeof payload !== 'object') break;
            const candidateIds = state.players.filter((p) => p.alive).map((p) => p.id);
            session.voteCounts = stepCount(session.voteCounts, payload.id, payload.delta, candidateIds, candidateIds.length);
            commitState();
            break;
        }
        case 'VOTE_CLOSE': {
            if (!inGame() || gameState.phase !== 'day' || isGuarded()) break;
            const state = getState(gameState.game);
            if (!state) break;
            const candidateIds = state.players.filter((p) => p.alive).map((p) => p.id);
            play({ type: ACTION_TYPES.CAST_VOTES, tally: tallyOf(session.voteCounts, candidateIds, candidateIds.length) });
            break;
        }
        case 'UNDO_GAME': {
            if (!inGame() || isGuarded()) break;
            const result = undo(gameState.game);
            if (result.ok) adoptGame(result.game);
            break;
        }
        case 'HIDE_SECRETS': {
            // The page is going out of sight: a role card goes back to its gate, the players panel and the moderator
            // notes close, and a name picked but not confirmed is dropped. The votes being counted are not secret and
            // stay (a phone that locks in the middle of a count must not lose it).
            if (!session.revealCardOpen && !session.rolesShown && !session.notesShown && session.nightTarget === null) break;
            session.revealCardOpen = false;
            session.rolesShown = false;
            session.notesShown = false;
            session.nightTarget = null;
            if (PHASES_WITH_A_GAME.has(gameState.phase)) commitState();
            break;
        }
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
