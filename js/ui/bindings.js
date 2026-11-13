/**
 * DOM event bindings. Every user action becomes a dispatch() call.
 */

import { dispatch, showInfoModal } from '../core/dispatch.js';
import { session } from '../core/state.js';
import { persist } from '../core/storage.js';
import { requestWakeLock } from '../platform/wakeLock.js';

/** Attach every listener. Call once at start-up. */
export function bindEvents() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await requestWakeLock();
        } else {
            // Out of sight: whatever a role card or the moderator's list shows goes away before the phone is seen again.
            dispatch({type: 'HIDE_SECRETS'});
        }
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.onclick = () => dispatch({type: 'SET_LANG', payload: btn.dataset.lang});
    });

    document.getElementById('theme-selector').onchange = (e) => dispatch({type: 'CHANGE_THEME', payload: e.target.value});

    document.getElementById('btn-nav-setup').onclick = () => dispatch({type: 'NAVIGATE', payload: 'setup'});

    document.getElementById('btn-resume-game').onclick = () => dispatch({type: 'RESUME_GAME'});

    document.getElementById('btn-back-welcome-2').onclick = () => dispatch({type: 'NAVIGATE', payload: 'welcome'});

    // `change` fires when the field loses focus or Enter is pressed: the moment the person is done typing.
    document.getElementById('setup-players-count').addEventListener('change', () => dispatch({type: 'SET_PLAYERS_COUNT'}));

    document.getElementById('btn-deal').onclick = () => dispatch({type: 'DEAL_GAME'});

    // The (i) buttons of the setup options open the help modal with their own text (`data-info` is an INFO_KEYS entry).
    document.querySelectorAll('.info-btn').forEach(btn => {
        btn.onclick = () => showInfoModal(btn.dataset.info);
    });
    document.getElementById('btn-info-modal-close').onclick = () => dispatch({type: 'CLOSE_MODAL', payload: 'info-modal'});

    document.getElementById('btn-reveal-show').onclick = () => dispatch({type: 'REVEAL_SHOW'});
    document.getElementById('btn-reveal-hide').onclick = () => dispatch({type: 'REVEAL_HIDE'});
    document.getElementById('btn-reveal-back').onclick = () => dispatch({type: 'CONFIRM_LEAVE_REVEAL'});

    document.getElementById('btn-roles-toggle').onclick = () => dispatch({type: 'TOGGLE_ROLES'});
    document.getElementById('btn-new-game').onclick = () => dispatch({type: 'CONFIRM_NEW_GAME'});

    document.getElementById('btn-confirm-yes').onclick = () => {
        const cb = session.pendingConfirmAction;
        session.pendingConfirmAction = null;
        dispatch({type: 'CLOSE_MODAL', payload: 'confirm-modal'});
        if (cb) cb();
    };

    document.getElementById('btn-confirm-no').onclick = () => {
        session.pendingConfirmAction = null;
        dispatch({type: 'CLOSE_MODAL', payload: 'confirm-modal'});
    };

    window.addEventListener('pagehide', () => {
        dispatch({type: 'HIDE_SECRETS'});
        persist();
    });
}
