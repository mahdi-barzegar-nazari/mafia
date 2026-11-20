/**
 * The chrome every game screen shares (night to ended), drawn below the screen's own content:
 *
 *   - the players panel: every player with an alive or eliminated mark. A role is in the page ONLY while the
 *     moderator asked for it (`session.rolesShown`): with the roles hidden the role texts are not in the DOM at all,
 *     they are not just invisible. When the game is over (`ended`) the roles are shown with no toggle;
 *   - the rules of this game, one line each, inside a <details> that starts closed;
 *   - "Undo" (disabled while the game has no action) and "New game", kept low and quiet: they are the two buttons
 *     a finger must not hit by accident. On the ended screen "New game" is the screen's own button, so the one in
 *     the chrome is hidden there.
 *
 * Everything is redrawn from `getState(gameState.game)`; nothing here is stored.
 */

import { gameState, session } from '../core/state.js';
import { MAFIA_TEAM } from '../data/roles.js';
import { t } from '../i18n/index.js';
import { playerRows } from './outcomes.js';
import { roleName } from './roleTexts.js';

const byId = (id) => document.getElementById(id);

const SELF_SAVE_KEYS = Object.freeze({
    never: 'game.rule.selfSave.never',
    once: 'game.rule.selfSave.once',
    always: 'game.rule.selfSave.always'
});

function textElement(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
}

/** One line per rule in force, in the active language. */
export function ruleLines(rules) {
    return [
        t(Object.hasOwn(SELF_SAVE_KEYS, rules.doctorSelfSave) ? SELF_SAVE_KEYS[rules.doctorSelfSave] : SELF_SAVE_KEYS.once),
        t(rules.godfather ? 'game.rule.godfather.on' : 'game.rule.godfather.off'),
        t(rules.revealRoleOnDeath ? 'game.rule.revealRole.on' : 'game.rule.revealRole.off')
    ];
}

/** One row of the players panel: the name, the role when it was asked for, and the alive / eliminated mark. */
function playerItem(row) {
    const li = document.createElement('li');
    li.className = row.alive ? 'player-row' : 'player-row is-dead';
    li.dataset.alive = String(row.alive);
    li.appendChild(textElement('strong', 'player-name', row.name));
    if (row.role) li.appendChild(textElement('span', MAFIA_TEAM.includes(row.role) ? 'player-role is-mafia' : 'player-role', roleName(row.role)));
    li.appendChild(textElement('span', 'player-status', t(row.alive ? 'game.player.alive' : 'game.player.dead')));
    return li;
}

/** Draw the players panel, the rules and the two buttons for `state` (the engine's state of `gameState.game`). */
export function renderChrome(state) {
    const over = state.phase === 'ended';
    const showRoles = over || session.rolesShown === true;
    byId('players-list').replaceChildren(...playerRows(state, showRoles).map(playerItem));
    byId('rules-list').replaceChildren(...ruleLines(state.rules).map((line) => textElement('li', '', line)));

    const toggle = byId('btn-roles-toggle');
    const key = session.rolesShown === true ? 'game.roles.hide' : 'game.roles.show';
    toggle.setAttribute('data-i18n', key);
    toggle.textContent = t(key);
    toggle.setAttribute('aria-pressed', String(session.rolesShown === true));
    toggle.classList.toggle('hidden', over);

    byId('btn-undo').disabled = !gameState.game || gameState.game.actions.length === 0;
    byId('btn-new-game').classList.toggle('hidden', over);
}
