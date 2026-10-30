/**
 * Theme selection and <meta name=theme-color> sync.
 */

import { THEME_COLORS } from '../core/config.js';

/** localStorage key of the chosen theme. */
export const THEME_STORAGE_KEY = 'mafia_selected_theme';

/** Apply the saved theme on load. */
export function initTheme() {
    let savedTheme = 'default';

    try {
        savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'default';
    } catch(e){}

    document.body.setAttribute('data-theme', savedTheme);

    document.getElementById('theme-selector').value = savedTheme;

    updateThemeMeta(savedTheme);
}

export function updateThemeMeta(theme) {
    const meta = document.getElementById('meta-theme-color');
    if (meta && THEME_COLORS[theme]) {
        meta.setAttribute('content', THEME_COLORS[theme]);
    }
}
