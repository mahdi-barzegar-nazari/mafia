/**
 * The setup form without the DOM: what a name may be, the default names, the rules the form can ask for, the call
 * to the rules engine that deals the roles, and what a refusal of the engine means for the person. Everything here
 * is a plain function of its arguments (the language comes from `i18n/`, the randomness is passed in), so the
 * form's behaviour can be tested without a page. `ui/setup.js` is the part that reads and writes the page.
 *
 * The engine is used only through `createGame` (and its error codes): whether a game can be dealt, whether the
 * godfather is allowed for a count and which input is at fault are all answered by asking it, so this file holds
 * no copy of the engine's rules except the one number a text field needs, `MAX_NAME_LENGTH` (tests/unit/setup-model
 * checks it against the engine).
 */

import { RULES } from '../core/config.js';
import { ERRORS } from '../game/constants.js';
import { createGame } from '../game/engine.js';
import { formatNumber, t, translationsOf } from '../i18n/index.js';
import { getRandomCryptoInt } from '../utils/random.js';
import { toPersianDigits } from '../utils/text.js';

/** The longest name, in characters (code points, so an emoji counts as one): the limit of `createGame`. */
export const MAX_NAME_LENGTH = 24;

/** The three values of the doctor's self-save select, in the order of the form (the engine's `doctorSelfSave`). */
export const DOCTOR_SAVE_MODES = Object.freeze(['never', 'once', 'always']);

/**
 * What the rules part of the form shows before anyone touches it: the doctor may save themselves once, no
 * godfather, the role of a player who is out is announced. `index.html` carries the same values, and
 * tests/unit/setup-model.test.mjs compares both with the engine's own defaults.
 */
export const FORM_DEFAULT_RULES = Object.freeze({ doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });

// ---------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------

/** The number of characters of `text` as a person counts them (code points). */
export function characterCount(text) {
    return [...String(text == null ? '' : text)].length;
}

/** `text` cut to `MAX_NAME_LENGTH` characters (never in the middle of an emoji); a non-string gives ''. */
export function capName(text) {
    if (typeof text !== 'string') return '';
    const characters = [...text];
    return characters.length > MAX_NAME_LENGTH ? characters.slice(0, MAX_NAME_LENGTH).join('') : text;
}

/** The default name of player number `slot` (1, 2, ...) in the active language: "Player 3". */
export function defaultName(slot) {
    return t('setup.player.default', { n: formatNumber(slot) });
}

/** `slot` written with the Latin, the Persian and the Arabic-Indic digits: every way a default name can carry its number. */
function digitForms(slot) {
    const latin = String(slot);
    const arabicIndic = latin.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    return [latin, toPersianDigits(latin), arabicIndic];
}

/**
 * True when `name` is exactly the default name of slot number `slot` in ANY supported language, with any of the
 * digit forms ("Player 3" and its Persian counterpart for slot 3). Only the number of its own slot counts: a
 * typed "Player 7" in slot 1 is a name, not a default. Surrounding spaces are ignored.
 */
export function isDefaultNameForSlot(name, slot) {
    if (typeof name !== 'string') return false;
    const text = name.trim();
    if (!text) return false;
    return Object.values(translationsOf('setup.player.default')).some((template) =>
        digitForms(slot).some((digits) => template.replace('{n}', digits) === text)
    );
}

/**
 * The name a slot shows after the language changed: its default in the active language when it still holds a
 * default (of any language), the typed name untouched otherwise.
 */
export function relocalizedName(name, slot) {
    return isDefaultNameForSlot(name, slot) ? defaultName(slot) : name;
}

// ---------------------------------------------------------------------------------------------------
// Asking the engine
// ---------------------------------------------------------------------------------------------------

/** A number in [0, 1) from the browser's secure random source: the `random` the engine shuffles the roles with. */
export function cryptoUnitRandom() {
    const range = 4294967296;
    return getRandomCryptoInt(range) / range;
}

/**
 * A name that is legal and, unlike a typed one, cannot repeat another: the private-use character is no letter, so
 * `normalizeWord` keeps it and no person types it. It stands in for the names that are not being examined.
 */
const filler = (index) => `\uE000${index}`;

/** `count` placeholder names, with `names[i]` in each slot `real(i)` says so for. */
function probe(names, real) {
    return names.map((name, i) => (real(i) ? name : filler(i)));
}

/**
 * Whether the engine deals a game of `count` players with the godfather on: `createGame` is the one that knows.
 * A count it does not accept at all (not a whole number from 3 to 20) is not available either.
 */
export function godfatherAvailable(count) {
    if (!Number.isInteger(count) || count < RULES.players.min || count > RULES.players.max) return false;
    const names = Array.from({ length: count }, (_, i) => filler(i));
    return createGame({ names, rules: { godfather: true }, random: () => 0 }).ok;
}

/** The fewest players for which the godfather can be on, found with `godfatherAvailable`, or null if never. */
export function godfatherMinPlayers() {
    for (let count = RULES.players.min; count <= RULES.players.max; count++) {
        if (godfatherAvailable(count)) return count;
    }
    return null;
}

/** The index of the first name the engine refuses as a name (empty, too long, only invisible marks), or -1. */
export function findInvalidName(names) {
    return names.findIndex((_, i) => {
        const result = createGame({ names: probe(names, (j) => j === i), random: () => 0 });
        return !result.ok && result.error === ERRORS.INVALID_NAME;
    });
}

/** The index of the first name that repeats an earlier one (as the engine compares names), or -1. */
export function findDuplicateName(names) {
    return names.findIndex((_, i) => {
        const result = createGame({ names: probe(names, (j) => j <= i), random: () => 0 });
        return !result.ok && result.error === ERRORS.DUPLICATE_NAME;
    });
}

/**
 * The catalog key that says what each error code of `createGame` means to the person. The engine only gives a
 * code, a stable identifier that is never shown: this table is the one place where codes become texts. The codes
 * the form cannot cause (the argument is not an object, no random function) share one general message.
 * `INVALID_NAME` is also `setup.error.nameTooLong` when the name is too long (see `explainCreateError`).
 */
export const CREATE_ERROR_KEYS = Object.freeze({
    [ERRORS.INVALID_INPUT]: 'setup.error.generic',
    [ERRORS.INVALID_NAMES]: 'setup.error.generic',
    [ERRORS.INVALID_PLAYER_COUNT]: 'setup.error.players',
    [ERRORS.INVALID_NAME]: 'setup.error.nameEmpty',
    [ERRORS.DUPLICATE_NAME]: 'setup.error.nameDuplicate',
    [ERRORS.GODFATHER_NOT_ALLOWED]: 'setup.error.godfather',
    [ERRORS.INVALID_ROLES]: 'setup.error.generic',
    [ERRORS.INVALID_RANDOM]: 'setup.error.generic'
});

/**
 * What a refusal of `createGame` means for the person: `{ key, message, target }`.
 *  - `key`: the catalog key of the message (`message` is that text in the active language, never the code);
 *  - `target`: which input is at fault, so the page can point at it: `{ kind: 'count' }`, `{ kind: 'name', index }`
 *    (0-based, in `names`), `{ kind: 'godfather' }`, or `null` for a problem no single input caused.
 * A code this table does not know gets the general message too, so a code can never reach the screen.
 */
export function explainCreateError(code, names = []) {
    const count = { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) };
    switch (code) {
        case ERRORS.INVALID_PLAYER_COUNT:
            return { key: 'setup.error.players', message: t('setup.error.players', count), target: { kind: 'count' } };
        case ERRORS.INVALID_NAME: {
            const index = findInvalidName(names);
            if (index < 0) return general();
            const n = formatNumber(index + 1);
            const tooLong = characterCount(names[index].trim()) > MAX_NAME_LENGTH;
            const key = tooLong ? 'setup.error.nameTooLong' : 'setup.error.nameEmpty';
            return { key, message: t(key, { n, max: formatNumber(MAX_NAME_LENGTH) }), target: { kind: 'name', index } };
        }
        case ERRORS.DUPLICATE_NAME: {
            const index = findDuplicateName(names);
            if (index < 0) return general();
            const key = 'setup.error.nameDuplicate';
            return { key, message: t(key, { n: formatNumber(index + 1) }), target: { kind: 'name', index } };
        }
        case ERRORS.GODFATHER_NOT_ALLOWED: {
            const key = 'setup.error.godfather';
            return { key, message: t(key, { min: formatNumber(godfatherMinPlayers()) }), target: { kind: 'godfather' } };
        }
        default:
            return general();
    }
}

function general() {
    const key = 'setup.error.generic';
    return { key, message: t(key), target: null };
}

/**
 * Deal a game: `createGame` with the typed `names`, the form's `rules` and a secure `random`. `{ ok: true, game }`,
 * or `{ ok: false, problem }` with the `explainCreateError` of what the engine refused. Never throws.
 */
export function dealGame(names, rules, random = cryptoUnitRandom) {
    const result = createGame({ names, rules, random });
    if (result.ok) return { ok: true, game: result.game };
    return { ok: false, problem: explainCreateError(result.error, Array.isArray(names) ? names : []) };
}

/**
 * The rules the form asks for, from what it shows: the doctor's select value and the two switches. The godfather
 * counts only while the count allows him (a switch that is disabled but still ticked asks for nothing).
 */
export function readFormRules({ doctorSelfSave, godfather, revealRoleOnDeath }, count) {
    return {
        doctorSelfSave: DOCTOR_SAVE_MODES.includes(doctorSelfSave) ? doctorSelfSave : FORM_DEFAULT_RULES.doctorSelfSave,
        godfather: Boolean(godfather) && godfatherAvailable(count),
        revealRoleOnDeath: Boolean(revealRoleOnDeath)
    };
}
