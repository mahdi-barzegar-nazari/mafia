/**
 * The reveal phase without the DOM: which player's turn it is, what comes after it, and what a player's role card
 * says. The roles are handed out one player at a time (a hand-off gate, then the card, then "hide and pass on"),
 * and `gameState.reveal.index` is the number of the player whose gate comes next. Everything here is a plain function
 * of its arguments, so the progress of the phase (including a saved value that has been damaged) can be tested
 * without a page. `ui/reveal.js` is the part that draws it.
 */

import { MAFIA_TEAM } from '../data/roles.js';
import { getState } from '../game/engine.js';

/**
 * The index a saved or stored value stands for, for a game of `count` players: a whole number from 0 to
 * `count - 1`, or 0 for anything else (not a number, a fraction, a negative, past the last player). Starting the
 * hand-offs again is the safe answer to a damaged value: every player still sees their card, none is skipped.
 */
export function sanitizeRevealIndex(value, count) {
    if (!Number.isInteger(count) || count < 1) return 0;
    return Number.isInteger(value) && value >= 0 && value < count ? value : 0;
}

/**
 * Where the reveal is, for the player the gate is waiting for: `{ index, number, total, last }`. `number` counts
 * from 1 (what a person reads: "player 3 of 8"), `last` is true for the final player. A damaged `index` counts as 0.
 */
export function revealProgress(index, count) {
    const total = Number.isInteger(count) && count > 0 ? count : 0;
    const at = sanitizeRevealIndex(index, total);
    return { index: at, number: at + 1, total, last: total > 0 && at === total - 1 };
}

/**
 * What "hide and pass on" does: `{ done: false, index }` with the next player's index, or `{ done: true, index: 0 }`
 * after the last player (the moderator's list comes next, and nothing is left to count).
 */
export function advanceReveal(index, count) {
    const here = revealProgress(index, count);
    if (here.total === 0 || here.last) return { done: true, index: 0 };
    return { done: false, index: here.index + 1 };
}

/**
 * The role card of the player at `index` in `game`: `{ name, role, teammates }`, where `teammates` are the names of
 * the OTHER players of the mafia team when this player is on it (mafia or godfather), else an empty list.
 * Null when `game` is not a game the engine can replay or `index` is not a player of it.
 */
export function roleCardFor(game, index) {
    const state = getState(game);
    if (!state || !Number.isInteger(index) || index < 0 || index >= state.players.length) return null;
    const player = state.players[index];
    const onMafiaTeam = MAFIA_TEAM.includes(player.role);
    const teammates = onMafiaTeam ? state.players.filter((p) => p.id !== player.id && MAFIA_TEAM.includes(p.role)).map((p) => p.name) : [];
    return { name: player.name, role: player.role, teammates };
}

/** How many players `game` has, or 0 for something the engine cannot replay. */
export function playerCount(game) {
    const state = getState(game);
    return state ? state.players.length : 0;
}

/** The name of the player at `index` (what the hand-off gate shows: no role), or '' when there is none. */
export function playerNameAt(game, index) {
    const state = getState(game);
    return state && Number.isInteger(index) && index >= 0 && index < state.players.length ? state.players[index].name : '';
}
