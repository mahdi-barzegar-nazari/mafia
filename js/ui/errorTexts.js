/**
 * The text for a refusal of the rules engine. The engine answers with a stable error code, never with text; a code
 * that a person should understand has its own message, any other (there should be none: the screens only offer
 * what the engine allows) gets the general one. A code is never shown.
 */

import { t } from '../i18n/index.js';

const ERROR_KEYS = Object.freeze({
    SELF_SAVE_NOT_ALLOWED: 'game.error.selfSave',
    CANNOT_CHECK_SELF: 'game.error.checkSelf'
});

/** The catalog key for an engine error code (a general key for any code without its own). */
export function errorKey(code) {
    return typeof code === 'string' && Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code] : 'game.error.generic';
}

/** The message for an engine error code, in the active language. */
export function errorText(code) {
    return t(errorKey(code));
}
