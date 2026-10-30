/**
 * DOM event bindings. Every user action becomes a dispatch() call.
 */

import { dispatch } from '../core/dispatch.js';
import { session } from '../core/state.js';
import { persist } from '../core/storage.js';
import { requestWakeLock } from '../platform/wakeLock.js';

/** Attach every listener. Call once at start-up. */
export function bindEvents() {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.onclick = () => dispatch({type: 'SET_LANG', payload: btn.dataset.lang});
    });

    document.getElementById('theme-selector').onchange = (e) => dispatch({type: 'CHANGE_THEME', payload: e.target.value});

    document.getElementById('btn-nav-setup').onclick = () => dispatch({type: 'NAVIGATE', payload: 'setup'});

    document.getElementById('btn-back-welcome-2').onclick = () => dispatch({type: 'NAVIGATE', payload: 'welcome'});

    // `change` fires when the field loses focus or Enter is pressed: the moment the person is done typing.
    document.getElementById('setup-players-count').addEventListener('change', () => dispatch({type: 'SET_PLAYERS_COUNT'}));

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
        persist();
    });
}
