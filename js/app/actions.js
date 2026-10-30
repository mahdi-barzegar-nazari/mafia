/**
 * The action handler: the big switch behind `dispatch()`.
 *
 * This is the top of the dependency graph. It may import anything, and nothing may import it except
 * `app/wire.js`, which installs it as the handler behind `core/dispatch.js`. Everything below reaches it
 * only through that port, which is what keeps `core/`, `game/` and `ui/` free of import cycles.
 */

import { VALID_PHASES } from '../core/config.js';
import { isMatchInProgress, setPhase } from '../core/phase.js';
import { getLang, normalizeLang, setLang } from '../i18n/index.js';
import { trapFocus } from '../ui/focusTrap.js';
import { validateAndSaveSettings } from '../ui/setup.js';
import { THEME_STORAGE_KEY, updateThemeMeta } from '../ui/theme.js';

let lastFocusedElement = null;

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
            if (VALID_PHASES.has(action.payload)) {
                setPhase(action.payload);
            }
            break;
        case 'SET_PLAYERS_COUNT':
            validateAndSaveSettings();
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
