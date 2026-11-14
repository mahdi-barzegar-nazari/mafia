/**
 * Setup screen: the players-count field, one name field per player, the three rules of the game and the button
 * that deals the roles. This file reads and writes the page; what a name may be, the default names and what the
 * rules engine's refusals mean live in `ui/setupModel.js` (pure, tested without a page).
 *
 * Nothing here is remembered between games: the form starts from its defaults every time (`resetSetupForm`).
 */

import { DEFAULT_PLAYERS_COUNT, RULES } from '../core/config.js';
import { gameState } from '../core/state.js';
import { flagFieldError, showToast } from './feedback.js';
import { formatNumber, t } from '../i18n/index.js';
import { toLatinDigits } from '../utils/text.js';
import {
    FORM_DEFAULT_RULES,
    MAX_NAME_LENGTH,
    capName,
    dealGame,
    defaultName,
    godfatherAvailable,
    godfatherMinPlayers,
    readFormRules,
    relocalizedName
} from './setupModel.js';

/** Invisible direction marks (and the zero-width joiners) that a Persian keyboard or a paste can leave in a number. */
const INVISIBLE_MARKS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

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

/** The id of the name field of player number `slot` (1, 2, ...). */
export const nameInputId = (slot) => `setup-name-${slot}`;

/** The players-count error text (also the toast when the form is dealt with a bad count). */
function playersCountError() {
    return t('setup.error.players', { min: formatNumber(RULES.players.min), max: formatNumber(RULES.players.max) });
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
        flagFieldError('setup-players-count', playersCountError());
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
    const namesHint = document.getElementById('names-limit-hint');
    if (namesHint) namesHint.textContent = t('setup.limit.names', { max: formatNumber(MAX_NAME_LENGTH) });
    syncGodfatherSwitch();
}

// ---------------------------------------------------------------------------------------------------
// The name fields
// ---------------------------------------------------------------------------------------------------

function nameInputs() {
    const container = document.getElementById('setup-names');
    return container ? Array.from(container.children) : [];
}

/** Put the placeholder and the accessible name of a name field in the active language. */
function labelNameInput(input, slot) {
    const n = formatNumber(slot);
    input.setAttribute('placeholder', t('setup.player.placeholder', { n }));
    input.setAttribute('aria-label', t('setup.player.aria', { n }));
}

function createNameInput(slot) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = nameInputId(slot);
    input.className = 'input-control name-input mb-6';
    input.setAttribute('autocomplete', 'off');
    input.dataset.slot = String(slot);
    // A name never has more than MAX_NAME_LENGTH characters: whatever is typed or pasted beyond that is cut off.
    input.addEventListener('input', () => {
        const capped = capName(input.value);
        if (capped !== input.value) input.value = capped;
    });
    labelNameInput(input, slot);
    return input;
}

/**
 * Make the name fields match `count`: players beyond it lose their field (from the end), new ones get their
 * default name, and the names already typed stay where they are. A count outside the game's limits changes
 * nothing.
 */
export function syncNameInputs(count) {
    if (!isValidPlayersCount(count)) return;
    const container = document.getElementById('setup-names');
    if (!container) return;
    const existing = nameInputs();
    existing.slice(count).forEach((input) => input.remove());
    for (let slot = existing.length + 1; slot <= count; slot++) {
        const input = createNameInput(slot);
        input.value = defaultName(slot);
        container.appendChild(input);
    }
}

/** After a language change: the fields that still hold a default name show it in the new language, typed names stay. */
export function relocalizeNameInputs() {
    nameInputs().forEach((input, i) => {
        const slot = i + 1;
        const next = relocalizedName(input.value, slot);
        if (next !== input.value) input.value = next;
        labelNameInput(input, slot);
    });
}

/** What the name fields hold now, in order (untrimmed: the engine trims). */
export function readNames() {
    return nameInputs().map((input) => input.value);
}

// ---------------------------------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------------------------------

/**
 * The godfather switch follows the player count: it can be on only while the engine allows a godfather for that
 * many players. Below that it is switched off and disabled, and the hint under it says from how many players it works.
 */
export function syncGodfatherSwitch() {
    const box = document.getElementById('setup-godfather');
    const hint = document.getElementById('godfather-hint');
    if (!box) return;
    const count = gameState.settings.playersCount;
    const allowed = godfatherAvailable(count);
    box.disabled = !allowed;
    if (!allowed) box.checked = false;
    if (hint) {
        hint.textContent = allowed ? '' : t('setup.hint.godfatherMin', { min: formatNumber(godfatherMinPlayers()) });
    }
}

/** The rules the form shows now, as the engine takes them. */
export function readRulesFromForm() {
    const select = document.getElementById('setup-doctor-save');
    const godfather = document.getElementById('setup-godfather');
    const revealRoleOnDeath = document.getElementById('setup-reveal-death');
    return readFormRules(
        {
            doctorSelfSave: select ? select.value : FORM_DEFAULT_RULES.doctorSelfSave,
            godfather: godfather ? godfather.checked : FORM_DEFAULT_RULES.godfather,
            revealRoleOnDeath: revealRoleOnDeath ? revealRoleOnDeath.checked : FORM_DEFAULT_RULES.revealRoleOnDeath
        },
        gameState.settings.playersCount
    );
}

/**
 * The players-count field was changed: a valid count rebuilds the name fields and re-checks the godfather switch,
 * an invalid one is pointed out and leaves the fields as they are.
 */
export function applyPlayersCountChange() {
    if (!validateAndSaveSettings()) return false;
    syncNameInputs(gameState.settings.playersCount);
    syncGodfatherSwitch();
    return true;
}

/** Put the whole form back to its defaults: count, default names, the rules. Nothing is kept from the last game. */
export function resetSetupForm() {
    const field = document.getElementById('setup-players-count');
    if (field) field.value = String(DEFAULT_PLAYERS_COUNT);
    gameState.settings.playersCount = DEFAULT_PLAYERS_COUNT;
    const container = document.getElementById('setup-names');
    if (container) container.replaceChildren();
    syncNameInputs(DEFAULT_PLAYERS_COUNT);
    const select = document.getElementById('setup-doctor-save');
    if (select) select.value = FORM_DEFAULT_RULES.doctorSelfSave;
    const death = document.getElementById('setup-reveal-death');
    if (death) death.checked = FORM_DEFAULT_RULES.revealRoleOnDeath;
    const godfather = document.getElementById('setup-godfather');
    if (godfather) godfather.checked = FORM_DEFAULT_RULES.godfather;
    syncGodfatherSwitch();
}

// ---------------------------------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------------------------------

/** The id of the field a refusal points at, or null when it is not one single field. */
function fieldIdFor(target) {
    if (!target) return null;
    if (target.kind === 'count') return 'setup-players-count';
    if (target.kind === 'name') return nameInputId(target.index + 1);
    if (target.kind === 'godfather') return 'setup-godfather';
    return null;
}

/**
 * Check the form and ask the rules engine for a dealt game. Returns the game, or null after telling the person
 * what is wrong: a toast with the text of the problem (never an error code), and the input at fault pulsed and focused.
 */
export function prepareDeal() {
    if (!validateAndSaveSettings()) return null;
    const count = gameState.settings.playersCount;
    syncNameInputs(count);
    syncGodfatherSwitch();
    const result = dealGame(readNames(), readRulesFromForm());
    if (result.ok) return result.game;
    const { message, target } = result.problem;
    const id = fieldIdFor(target);
    if (id) flagFieldError(id, message);
    else showToast(message);
    return null;
}
