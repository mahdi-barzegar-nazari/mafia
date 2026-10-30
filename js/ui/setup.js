/**
 * Setup screen (a placeholder until the game exists): the players-count field, its validation and its limit hint.
 */

import { RULES } from '../core/config.js';
import { gameState } from '../core/state.js';
import { flagFieldError } from './feedback.js';
import { formatNumber, t } from '../i18n/index.js';
import { toLatinDigits } from '../utils/text.js';

/** Invisible direction marks (and the zero-width joiners) that a Persian keyboard or a paste can leave in a number. */
const INVISIBLE_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * The whole number a players-count text stands for, or NaN. The text may be written with Latin, Persian or
 * Arabic-Indic digits, with spaces or invisible direction marks around it. Anything but digits (a sign, a decimal
 * point, a letter, "8 players") is NaN: a field that says "4.5" or "8abc" is a typo to point out, not a number
 * to guess at.
 */
export function parsePlayersCount(text) {
    const digits = toLatinDigits(String(text == null ? '' : text).replace(INVISIBLE_MARKS, '')).trim();
    return /^[0-9]+$/.test(digits) ? Number(digits) : NaN;
}

/** True for a players count the game accepts: a whole number from `RULES.players.min` to `RULES.players.max`. */
export function isValidPlayersCount(count) {
    return Number.isInteger(count) && count >= RULES.players.min && count <= RULES.players.max;
}

/**
 * Check the players-count field. A valid count is written back to the field in plain digits and saved in
 * `gameState.settings`, and `true` is returned. An invalid one leaves the saved count as it was, tells the
 * person (a toast, and the field is pulsed and focused: `flagFieldError`) and returns `false`.
 */
export function validateAndSaveSettings() {
    const field = document.getElementById('setup-players-count');
    const count = parsePlayersCount(field.value);

    if (!isValidPlayersCount(count)) {
        flagFieldError('setup-players-count', t('setup.error.players', { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) }));
        return false;
    }

    field.value = String(count);
    gameState.settings.playersCount = count;
    return true;
}

// Keeps the small hint text under the players field in sync with the actual RULES so the limits are visible
// before an error ever needs to fire.
export function updateSetupLimitHints() {
    const playersHint = document.getElementById('players-limit-hint');
    if (playersHint) playersHint.textContent = t('setup.limit.players', { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) });
}
