/**
 * The vote stepper without the DOM. The moderator counts the raised hands and gives each living player a number of
 * votes; the screen shows a minus, the count and a plus for each. Pure functions on a counts object
 * `{ playerId: count }` that holds only the non-zero counts:
 *
 *  - a count is a whole number from 0 up, and the total can never be more than the number of living players (the
 *    engine refuses a bigger tally with INVALID_TALLY, and the plus button is disabled before that);
 *  - `stepCount` returns a NEW object and never changes the one it was given;
 *  - `tallyOf` is what `CAST_VOTES` carries: the non-zero counts of living players only.
 */

import { getModeratorView } from '../game/view.js';

/** The sum of the counts. */
export function totalVotes(counts) {
    let total = 0;
    for (const id of Object.keys(counts)) total += counts[id];
    return total;
}

/** How many votes are left to give: `maxTotal` less what was given, never below 0. */
export function remainingVotes(counts, maxTotal) {
    return Math.max(0, maxTotal - totalVotes(counts));
}

/**
 * `counts` brought into a legal shape for `candidateIds` and `maxTotal`: unknown ids, zeros and anything that is
 * not a whole positive number dropped, and, when the total is too big, the surplus taken from the end of the list
 * of candidates. Always a fresh object.
 */
export function clampCounts(counts, candidateIds, maxTotal) {
    const clean = {};
    let total = 0;
    const source = counts !== null && typeof counts === 'object' ? counts : {};
    for (const id of candidateIds) {
        const value = Object.hasOwn(source, id) ? source[id] : 0;
        if (!Number.isInteger(value) || value <= 0) continue;
        const room = Math.max(0, maxTotal - total);
        const kept = Math.min(value, room);
        if (kept > 0) {
            clean[id] = kept;
            total += kept;
        }
    }
    return clean;
}

/**
 * One press of a minus (`delta` -1) or a plus (`delta` +1) for the player `id`. A plus with no vote left, a minus
 * at 0, a player who is not a candidate and a `delta` that is not exactly 1 or -1 all leave the counts as they are.
 */
export function stepCount(counts, id, delta, candidateIds, maxTotal) {
    const base = clampCounts(counts, candidateIds, maxTotal);
    if (!candidateIds.includes(id) || (delta !== 1 && delta !== -1)) return base;
    const current = Object.hasOwn(base, id) ? base[id] : 0;
    if (delta === 1 && remainingVotes(base, maxTotal) < 1) return base;
    const next = current + delta;
    if (next < 0) return base;
    if (next === 0) {
        delete base[id];
        return base;
    }
    base[id] = next;
    return base;
}

/** The tally `CAST_VOTES` takes: the non-zero counts of the candidates, in the order of `candidateIds`. */
export function tallyOf(counts, candidateIds, maxTotal) {
    return clampCounts(counts, candidateIds, maxTotal);
}

/**
 * The day screen for `state`, or null when `state` is not a day:
 *
 *   rows       [{ id, name, count, canMinus, canPlus }] for every living player, in player order
 *   used, max  the votes given and the votes there are to give (one per living player)
 *   remaining  max - used
 */
export function voteModel(state, counts) {
    const view = getModeratorView(state);
    if (!view || !view.vote) return null;
    const { candidateIds, maxTotal } = view.vote;
    const clean = clampCounts(counts, candidateIds, maxTotal);
    const used = totalVotes(clean);
    const remaining = Math.max(0, maxTotal - used);
    const names = new Map(state.players.map((player) => [player.id, player.name]));
    const rows = candidateIds.map((id) => {
        const count = Object.hasOwn(clean, id) ? clean[id] : 0;
        return { id, name: names.get(id), count, canMinus: count > 0, canPlus: remaining > 0 };
    });
    return { rows, used, max: maxTotal, remaining };
}
