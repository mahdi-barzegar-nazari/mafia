/**
 * The moderator's screen (a temporary one: the night and day screens replace it): the players in the order they
 * were dealt, the rules this game is played by, and the button that throws the game away.
 *
 * The roles are hidden when the screen opens and whenever the page is hidden (`session.rolesShown` goes back to
 * false: see `HIDE_SECRETS` in app/actions.js). While they are hidden their texts are not in the page at all.
 */

import { gameState, session } from '../core/state.js';
import { MAFIA_TEAM } from '../data/roles.js';
import { getState } from '../game/engine.js';
import { t } from '../i18n/index.js';
import { roleName } from './roleTexts.js';

const byId = (id) => document.getElementById(id);

const SELF_SAVE_KEYS = Object.freeze({
    never: 'moderator.rule.selfSave.never',
    once: 'moderator.rule.selfSave.once',
    always: 'moderator.rule.selfSave.always'
});

function item(className, text) {
    const li = document.createElement('li');
    if (className) li.className = className;
    li.textContent = text;
    return li;
}

function playerRow(player, showRoles) {
    const li = document.createElement('li');
    li.className = 'moderator-row';
    const name = document.createElement('strong');
    name.className = 'moderator-name';
    name.textContent = player.name;
    li.appendChild(name);
    if (showRoles) {
        const role = document.createElement('span');
        role.className = MAFIA_TEAM.includes(player.role) ? 'moderator-role is-mafia' : 'moderator-role';
        role.textContent = roleName(player.role);
        li.appendChild(role);
    }
    return li;
}

/** One line per rule in force, in the active language. */
export function ruleLines(rules) {
    return [
        t(Object.hasOwn(SELF_SAVE_KEYS, rules.doctorSelfSave) ? SELF_SAVE_KEYS[rules.doctorSelfSave] : SELF_SAVE_KEYS.once),
        t(rules.godfather ? 'moderator.rule.godfather.on' : 'moderator.rule.godfather.off'),
        t(rules.revealRoleOnDeath ? 'moderator.rule.revealRole.on' : 'moderator.rule.revealRole.off')
    ];
}

/** Draw the moderator's screen from `gameState.game`. */
export function renderModerator() {
    const state = gameState.game ? getState(gameState.game) : null;
    const list = byId('moderator-list');
    const rules = byId('moderator-rules');
    const toggle = byId('btn-roles-toggle');
    const showRoles = session.rolesShown === true;
    const key = showRoles ? 'moderator.roles.hide' : 'moderator.roles.show';
    toggle.setAttribute('data-i18n', key);
    toggle.textContent = t(key);
    if (!state) {
        list.replaceChildren();
        rules.replaceChildren();
        return;
    }
    list.replaceChildren(...state.players.map((player) => playerRow(player, showRoles)));
    rules.replaceChildren(...ruleLines(state.rules).map((line) => item('', line)));
}
