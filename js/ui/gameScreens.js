/**
 * The five game screens (night, morning, day, dusk, ended), drawn from the engine's state of `gameState.game`.
 * Nothing here is stored: a screen is a function of the game and of the few toggles in `session`, so a reload,
 * an undo or a resume always lands on what the engine says.
 *
 * Rules every screen follows:
 *   - a text comes from the catalog; a player's name inside a sentence goes through `isolate()`;
 *   - a secret is in the page only while it is asked for: the moderator notes and the roles are built when their
 *     toggle is on and TAKEN OUT of the page (not just hidden) when it is off;
 *   - the night screen shows nothing about who was chosen: a finished step is only marked "done";
 *   - the lists (targets, votes) are updated in place while the same screen stays up, so a button that was just
 *     pressed keeps the keyboard focus.
 */

import { dispatch } from '../core/dispatch.js';
import { gameState, session } from '../core/state.js';
import { getState } from '../game/engine.js';
import { formatNumber, isolate, t, tn } from '../i18n/index.js';
import { renderChrome } from './gameChrome.js';
import { STEP_STATUS, isOfferedTarget, nightModel } from './nightModel.js';
import { duskOutcome, moderatorNotes, morningOutcome, winnerOutcome } from './outcomes.js';
import { duskText, morningText, noteText, winnerText } from './outcomeTexts.js';
import { voteModel } from './voteModel.js';

const byId = (id) => document.getElementById(id);

// Every key is written out in full (never built from a step or a status), so a search for a key finds its use.
const STEP_NAME_KEYS = Object.freeze({
    mafia: 'night.step.mafia.name',
    doctor: 'night.step.doctor.name',
    detective: 'night.step.detective.name'
});
const STATUS_KEYS = Object.freeze({
    [STEP_STATUS.DONE]: 'night.status.done',
    [STEP_STATUS.CURRENT]: 'night.status.current',
    [STEP_STATUS.WAITING]: 'night.status.waiting',
    [STEP_STATUS.NOBODY]: 'night.status.nobody'
});
const PAUSE_KEYS = Object.freeze({
    mafia: 'night.pause.mafia',
    doctor: 'night.pause.doctor',
    detective: 'night.pause.detective'
});
const HEADING_KEYS = Object.freeze({
    night: 'game.heading.night',
    morning: 'game.heading.morning',
    day: 'game.heading.day',
    dusk: 'game.heading.dusk',
    ended: 'game.heading.ended'
});

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

/** The children of `parent` as a real array (a DOM collection has no `map`). */
const kids = (parent) => Array.from(parent.children);

/** The heading of a game screen: the phase and the round ("Night 2"). */
export function headingText(state) {
    return t(HEADING_KEYS[state.phase], { n: formatNumber(state.round) });
}

// ---------------------------------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------------------------------

function stepItem(item) {
    const li = element('li', `night-step is-${item.status}`);
    li.dataset.status = item.status;
    li.dataset.step = item.step;
    if (item.status === STEP_STATUS.CURRENT) li.setAttribute('aria-current', 'step');
    const mark = element('span', 'step-mark');
    mark.setAttribute('aria-hidden', 'true');
    li.appendChild(mark);
    li.appendChild(element('span', 'step-name', t(STEP_NAME_KEYS[item.step])));
    li.appendChild(element('span', 'step-status', t(STATUS_KEYS[item.status])));
    // A step nobody is alive for is not skipped: the moderator pauses as if calling the role, so the table cannot tell.
    if (item.status === STEP_STATUS.NOBODY) li.appendChild(element('p', 'step-pause', t(PAUSE_KEYS[item.step])));
    return li;
}

function instructionKey(current) {
    if (current.step === 'mafia') return current.withGodfather ? 'night.do.mafia.godfather' : 'night.do.mafia.plain';
    return current.step === 'doctor' ? 'night.do.doctor' : 'night.do.detective';
}

function targetItem(target) {
    const li = element('li', 'target-item');
    const button = element('button', 'btn btn-ghost night-target');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-pressed', 'false');
    button.dataset.id = target.id;
    button.appendChild(element('strong', 'target-name', target.name));
    button.onclick = () => dispatch({ type: 'NIGHT_SELECT', payload: target.id });
    li.appendChild(button);
    return li;
}

function drawNight(state) {
    const model = nightModel(state);
    const steps = byId('night-steps');
    const panel = byId('night-current');
    if (!model) {
        steps.replaceChildren();
        panel.classList.add('hidden');
        return;
    }
    steps.replaceChildren(...model.items.map(stepItem));
    const { current } = model;
    panel.classList.toggle('hidden', current === null);
    if (!current) return;

    byId('night-instruction').textContent = t(instructionKey(current));
    byId('night-doctor-note').classList.toggle('hidden', !current.doctorCannotPickSelf);
    byId('night-doctor-note').textContent = current.doctorCannotPickSelf ? t('night.doctor.noSelf') : '';

    // The buttons are rebuilt only when the step (or its list of targets) is a different one; a pick just flips aria-pressed.
    const list = byId('night-targets');
    const signature = `${state.round}|${current.step}|${current.targets.map((target) => `${target.id}:${target.name}`).join('\n')}`;
    if (list.dataset.signature !== signature) {
        list.replaceChildren(...current.targets.map(targetItem));
        list.dataset.signature = signature;
    }
    const picked = isOfferedTarget(model, session.nightTarget) ? session.nightTarget : null;
    for (const li of kids(list)) {
        const button = li.children[0];
        button.setAttribute('aria-pressed', String(button.dataset.id === picked));
    }
    const confirm = byId('btn-night-confirm');
    const pickedTarget = current.targets.find((target) => target.id === picked);
    confirm.disabled = !pickedTarget;
    confirm.textContent = pickedTarget ? t('night.confirm', { name: isolate(pickedTarget.name) }) : t('night.confirm.none');
}

// ---------------------------------------------------------------------------------------------------
// Morning
// ---------------------------------------------------------------------------------------------------

function drawMorning(state) {
    byId('morning-announcement').textContent = morningText(morningOutcome(state));
    const shown = session.notesShown === true;
    const toggle = byId('btn-morning-notes');
    const key = shown ? 'morning.notes.hide' : 'morning.notes.show';
    toggle.setAttribute('data-i18n', key);
    toggle.textContent = t(key);
    toggle.setAttribute('aria-expanded', String(shown));
    const box = byId('morning-notes');
    box.classList.toggle('hidden', !shown);
    // Closed means gone from the page, not just invisible.
    if (!shown) {
        byId('morning-notes-list').replaceChildren();
        return;
    }
    const notes = moderatorNotes(state);
    const lines = notes.length > 0 ? notes.map(noteText) : [t('morning.notes.empty')];
    byId('morning-notes-list').replaceChildren(...lines.map((line) => element('li', '', line)));
}

// ---------------------------------------------------------------------------------------------------
// Day: the vote
// ---------------------------------------------------------------------------------------------------

function voteItem(row) {
    const li = element('li', 'vote-row');
    li.dataset.id = row.id;
    li.appendChild(element('strong', 'vote-name', row.name));
    const stepper = element('div', 'stepper');
    const minus = element('button', 'btn btn-ghost stepper-btn stepper-minus');
    minus.setAttribute('type', 'button');
    minus.setAttribute('aria-label', t('day.vote.minus', { name: isolate(row.name) }));
    minus.onclick = () => dispatch({ type: 'VOTE_STEP', payload: { id: row.id, delta: -1 } });
    const count = element('span', 'stepper-count', formatNumber(row.count));
    const plus = element('button', 'btn btn-ghost stepper-btn stepper-plus');
    plus.setAttribute('type', 'button');
    plus.setAttribute('aria-label', t('day.vote.plus', { name: isolate(row.name) }));
    plus.onclick = () => dispatch({ type: 'VOTE_STEP', payload: { id: row.id, delta: 1 } });
    stepper.appendChild(minus);
    stepper.appendChild(count);
    stepper.appendChild(plus);
    li.appendChild(stepper);
    return li;
}

function drawDay(state) {
    const model = voteModel(state, session.voteCounts);
    const list = byId('vote-list');
    if (!model) {
        list.replaceChildren();
        return;
    }
    // Rebuilt only for a different set of living players; a press changes the number and the two disabled states in place.
    const signature = `${state.round}|${model.rows.map((row) => `${row.id}:${row.name}`).join('\n')}`;
    if (list.dataset.signature !== signature) {
        list.replaceChildren(...model.rows.map(voteItem));
        list.dataset.signature = signature;
    }
    kids(list).forEach((li, index) => {
        const row = model.rows[index];
        const [, stepper] = kids(li);
        const [minus, count, plus] = kids(stepper);
        count.textContent = formatNumber(row.count);
        minus.disabled = !row.canMinus;
        plus.disabled = !row.canPlus;
    });
    byId('day-counter').textContent = tn('day.counter', model.max, { used: formatNumber(model.used) });
}

// ---------------------------------------------------------------------------------------------------
// Dusk and the end
// ---------------------------------------------------------------------------------------------------

function drawDusk(state) {
    byId('dusk-result').textContent = duskText(duskOutcome(state));
}

function drawEnded(state) {
    byId('ended-winner').textContent = winnerText(winnerOutcome(state));
}

/** Empty the night screen: no step, no name, no pick (and forget which list it was, so the next one is built fresh). */
function clearNight() {
    byId('night-steps').replaceChildren();
    byId('night-targets').replaceChildren();
    delete byId('night-targets').dataset.signature;
    byId('night-doctor-note').textContent = '';
    byId('night-doctor-note').classList.add('hidden');
    byId('night-instruction').textContent = '';
    const confirm = byId('btn-night-confirm');
    confirm.disabled = true;
    confirm.textContent = '';
}

function clearVote() {
    byId('vote-list').replaceChildren();
    delete byId('vote-list').dataset.signature;
}

function clearNotes() {
    byId('morning-notes-list').replaceChildren();
    byId('morning-notes').classList.add('hidden');
}

/**
 * A screen that is not showing holds nothing of its last drawing: not a name that was picked, not a count, not a
 * moderator note. What was on it is no business of whoever looks at the page (or at its source) next.
 */
function clearScreensExcept(phase) {
    if (phase !== 'night') clearNight();
    if (phase !== 'day') clearVote();
    if (phase !== 'morning') clearNotes();
}

/**
 * Empty everything the game screens and their chrome hold: used when the page leaves the game (a new game, a
 * discarded one), so no name and no role of a game that is over is left behind in the hidden page.
 */
export function clearGameDom() {
    clearScreensExcept(null);
    byId('players-list').replaceChildren();
    byId('rules-list').replaceChildren();
    for (const id of ['morning-announcement', 'dusk-result', 'ended-winner', 'day-counter', 'game-live']) byId(id).textContent = '';
}

const DRAWERS = Object.freeze({ night: drawNight, morning: drawMorning, day: drawDay, dusk: drawDusk, ended: drawEnded });

/** The one polite live line for a screen: the phase and, at night, the current step. Never a role or a secret. */
function liveText(state, heading) {
    if (state.phase === 'night') {
        const model = nightModel(state);
        const step = model && model.current ? t(STEP_NAME_KEYS[model.current.step]) : '';
        return step ? t('game.live.night', { heading, step }) : heading;
    }
    if (state.phase === 'ended') {
        const winner = winnerText(winnerOutcome(state));
        return winner ? t('game.live.ended', { heading, winner }) : heading;
    }
    return heading;
}

/**
 * Draw the screen of `gameState.phase` and the shared chrome from the game. Returns `{ key, live }`: `key` names the
 * screen and its step ("night:2:doctor") so the caller can tell a new screen from a redraw of the same one; `live` is
 * the sentence for the live line. Returns null when there is no game to draw.
 */
export function renderGame() {
    const state = gameState.game ? getState(gameState.game) : null;
    const draw = Object.hasOwn(DRAWERS, gameState.phase) ? DRAWERS[gameState.phase] : null;
    if (!state || !draw) return null;
    const heading = headingText(state);
    byId(`title-${gameState.phase}`).textContent = heading;
    clearScreensExcept(gameState.phase);
    draw(state);
    renderChrome(state);
    return { key: `${state.phase}:${state.round}:${state.step ?? ''}`, live: liveText(state, heading) };
}
