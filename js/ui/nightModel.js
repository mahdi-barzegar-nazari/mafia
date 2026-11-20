/**
 * The night screen without the DOM: what each of the three steps is (done, current, waiting, or nobody alive) and
 * what the current step offers. Everything is a plain function of a state from the rules engine; ids and flags
 * only, no text (ui/gameScreens.js writes the texts). The engine decides who may be chosen
 * (`getModeratorView`): this file only reads that.
 */

import { NIGHT_STEPS } from '../data/roles.js';
import { getModeratorView } from '../game/view.js';

/** The four things a step of the night can be, as the list shows them. */
export const STEP_STATUS = Object.freeze({ DONE: 'done', CURRENT: 'current', WAITING: 'waiting', NOBODY: 'nobody' });

/** The action type that records each step (the engine's own table). */
export const STEP_ACTIONS = Object.freeze(Object.fromEntries(NIGHT_STEPS.map((def) => [def.step, def.action])));

/**
 * The status of one entry of `getModeratorView(state).steps`. A step nobody is alive for comes first (the
 * engine lists it as skippable: the moderator still pauses as if calling the role, so the night keeps its length),
 * then a recorded step, then the one to play now; the rest are waiting.
 */
export function stepStatus(entry) {
    if (entry.skippable || !entry.alive) return STEP_STATUS.NOBODY;
    if (entry.done) return STEP_STATUS.DONE;
    if (entry.current) return STEP_STATUS.CURRENT;
    return STEP_STATUS.WAITING;
}

/**
 * The night screen for `state`, or null when `state` is not a night.
 *
 *   round    the night's number
 *   items    [{ step, status }] for mafia, doctor, detective, in that order
 *   current  null, or { step, action, targets: [{ id, name }], withGodfather, doctorCannotPickSelf }
 *              `targets` are the players the engine allows, in player order; `withGodfather` is true when a
 *              godfather is alive (the mafia instruction names him); `doctorCannotPickSelf` is true when the
 *              doctor's own name is missing from the doctor's list
 */
export function nightModel(state) {
    const view = getModeratorView(state);
    if (!view || view.phase !== 'night') return null;
    const items = view.steps.map((entry) => ({ step: entry.step, status: stepStatus(entry) }));
    const entry = view.steps.find((candidate) => candidate.current) ?? null;
    let current = null;
    if (entry) {
        const names = new Map(state.players.map((player) => [player.id, player.name]));
        current = {
            step: entry.step,
            action: STEP_ACTIONS[entry.step],
            targets: state.players.filter((player) => entry.targetIds.includes(player.id)).map((player) => ({ id: player.id, name: names.get(player.id) })),
            withGodfather: state.players.some((player) => player.alive && player.role === 'godfather'),
            doctorCannotPickSelf: entry.step === 'doctor' && entry.actorIds.length > 0 && !entry.targetIds.includes(entry.actorIds[0])
        };
    }
    return { round: view.round, items, current };
}

/** True when `id` is one of the targets the current step offers. */
export function isOfferedTarget(model, id) {
    return Boolean(model && model.current && model.current.targets.some((target) => target.id === id));
}
