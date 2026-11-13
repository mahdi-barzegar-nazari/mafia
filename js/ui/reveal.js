/**
 * The reveal screen: the roles are handed out one player at a time.
 *
 *   gate  - "Hand the phone to {name}" and one button, "I am {name}". Nothing secret is on the page.
 *   card  - the role card of that player, built only after the button is pressed and taken out of the page again
 *           (not just hidden) the moment it is hidden, so the role is never in the DOM while the next person holds the phone.
 *
 * Which of the two shows is `session.revealCardOpen` (never saved: a reload always lands on a gate); which player
 * it is is `gameState.reveal.index` (saved at every hand-off). The actions that change them are in `app/actions.js`.
 * Every step moves the focus to its heading, and one polite live line says what the step is (it never says the role).
 */

import { gameState, session } from '../core/state.js';
import { MAFIA_TEAM } from '../data/roles.js';
import { formatList, formatNumber, isolate, t } from '../i18n/index.js';
import { playerCount, playerNameAt, revealProgress, roleCardFor } from './revealFlow.js';
import { roleDoes, roleName } from './roleTexts.js';

const byId = (id) => document.getElementById(id);

function paragraph(className, text) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    return p;
}

function moveFocusTo(element) {
    if (!element) return;
    element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
}

/** Take the role card out of the page. Whatever the card showed is gone, not hidden. */
export function clearRoleCard() {
    const body = byId('reveal-card-body');
    if (body) body.replaceChildren();
}

function showGate(progress) {
    const name = isolate(playerNameAt(gameState.game, progress.index));
    clearRoleCard();
    byId('reveal-card').classList.add('hidden');
    byId('reveal-gate').classList.remove('hidden');
    const params = { n: formatNumber(progress.number), total: formatNumber(progress.total), name };
    byId('reveal-progress').textContent = t('reveal.progress', params);
    const title = byId('reveal-gate-title');
    title.textContent = t('reveal.gate.title', params);
    byId('btn-reveal-show').textContent = t('reveal.gate.show', params);
    byId('reveal-live').textContent = t('reveal.live.gate', params);
    moveFocusTo(title);
}

function showCard(progress) {
    const card = roleCardFor(gameState.game, progress.index);
    if (!card) {
        showGate(progress);
        return;
    }
    const body = byId('reveal-card-body');
    const heading = document.createElement('h2');
    heading.className = 'reveal-role';
    heading.textContent = roleName(card.role);
    const parts = [paragraph('reveal-card-for', t('reveal.card.for', { name: isolate(card.name) })), heading, paragraph('reveal-card-does', roleDoes(card.role))];
    if (MAFIA_TEAM.includes(card.role)) {
        const team = card.teammates.length > 0 ? t('reveal.card.team', { names: formatList(card.teammates.map(isolate)) }) : t('reveal.card.alone');
        parts.push(paragraph('reveal-card-team', team));
    }
    body.replaceChildren(...parts);
    byId('reveal-gate').classList.add('hidden');
    byId('reveal-card').classList.remove('hidden');
    byId('btn-reveal-hide').textContent = t(progress.last ? 'reveal.card.hideLast' : 'reveal.card.hide');
    byId('reveal-live').textContent = t('reveal.live.card');
    moveFocusTo(heading);
}

/** Draw the reveal screen for `gameState.reveal.index`: a gate, or the card when `session.revealCardOpen`. */
export function renderReveal() {
    const count = playerCount(gameState.game);
    if (count === 0) {
        clearRoleCard();
        byId('reveal-gate').classList.add('hidden');
        byId('reveal-card').classList.add('hidden');
        return;
    }
    const progress = revealProgress(gameState.reveal ? gameState.reveal.index : undefined, count);
    if (session.revealCardOpen) showCard(progress);
    else showGate(progress);
}
