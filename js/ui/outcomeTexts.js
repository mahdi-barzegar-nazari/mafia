/**
 * The sentences of the morning, the dusk and the end of the game, in the active language: the one place that turns
 * the plain outcomes of `ui/outcomes.js` into text. A player's name always goes through `isolate()` (it can be in
 * either script and must not reorder the sentence around it); a role is named only when the outcome carries one,
 * which the engine allows only with the rule "reveal the role of eliminated players".
 */

import { isolate, t } from '../i18n/index.js';
import { roleName } from './roleTexts.js';

/** `withRole` when the outcome carries a role that has a name, else `plain`; both take `{ name }`, `withRole` also `{ role }`. */
function nameAndRole(outcome, plainKey, roleKey) {
    const name = isolate(outcome.name);
    const role = outcome.role ? roleName(outcome.role) : '';
    return role ? t(roleKey, { name, role }) : t(plainKey, { name });
}

/** The morning's public announcement for a `morningOutcome`. */
export function morningText(outcome) {
    if (!outcome) return '';
    if (outcome.kind === 'death') return nameAndRole(outcome, 'morning.death', 'morning.death.role');
    return t('morning.nobody');
}

/** The result of the vote for a `duskOutcome`: an elimination (with the role only when announced), a tie, or no votes. */
export function duskText(outcome) {
    if (!outcome) return '';
    if (outcome.kind === 'eliminated') return nameAndRole(outcome, 'dusk.eliminated', 'dusk.eliminated.role');
    if (outcome.kind === 'tie') return t('dusk.tie');
    return t('dusk.none');
}

/** "The town wins" or "The mafia wins" for a `winnerOutcome`; '' when there is no winner to announce. */
export function winnerText(winner) {
    if (winner === 'town') return t('ended.winner.town');
    if (winner === 'mafia') return t('ended.winner.mafia');
    return '';
}

/** One moderator note (from `moderatorNotes`) as a sentence. */
export function noteText(note) {
    const name = isolate(note.name);
    if (note.kind === 'check') return t(note.isMafia ? 'morning.note.check.mafia' : 'morning.note.check.innocent', { name });
    return t('morning.note.saved', { name });
}
