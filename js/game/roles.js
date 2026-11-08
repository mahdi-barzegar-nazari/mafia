/**
 * Which roles a game of n players has, and how a role list is dealt. Pure: the only randomness is the
 * `random` function the caller passes in.
 */
import { RULES } from '../core/config.js';
import { MAFIA_TEAM, ROLE_IDS } from '../data/roles.js';
import { normalizeRules } from './rules.js';

export function isMafiaTeam(role) {
    return MAFIA_TEAM.includes(role);
}

/**
 * The number of each role for n players, or null when the game is not supported (n is not a whole number
 * from RULES.players.min to RULES.players.max, or the godfather is on with fewer than 2 mafia).
 *
 *   mafia team = max(1, floor(n / 3));  doctor = 1 from 4 players;  detective = 1;  citizens = the rest.
 *
 * With the godfather on he takes one slot of the team: godfather 1, mafia team - 1. The result always has
 * all five role keys.
 */
export function roleCounts(n, rules) {
    if (!Number.isInteger(n) || n < RULES.players.min || n > RULES.players.max) return null;
    const { godfather } = normalizeRules(rules);
    const team = Math.max(1, Math.floor(n / 3));
    if (godfather && team < 2) return null;
    const doctor = n >= 4 ? 1 : 0;
    const detective = 1;
    return {
        mafia: godfather ? team - 1 : team,
        godfather: godfather ? 1 : 0,
        doctor,
        detective,
        citizen: n - team - doctor - detective
    };
}

/** The roles of `counts` as a list, in the canonical order of ROLE_IDS. */
export function roleList(counts) {
    return ROLE_IDS.flatMap((role) => Array(counts[role]).fill(role));
}

/** True when `roles` holds exactly the roles of `counts`, in any order. */
export function matchesCounts(roles, counts) {
    if (!Array.isArray(roles)) return false;
    const seen = Object.fromEntries(ROLE_IDS.map((role) => [role, 0]));
    for (let i = 0; i < roles.length; i++) {
        if (!Object.hasOwn(seen, roles[i])) return false;
        seen[roles[i]]++;
    }
    return ROLE_IDS.every((role) => seen[role] === counts[role]);
}

/**
 * A Fisher-Yates shuffle of a copy of `list` with an injected `random` (a function returning a number in
 * [0, 1)). Throws a RangeError when `random` is not a function or returns anything else; `createGame`
 * turns that into the error code INVALID_RANDOM.
 */
export function shuffleWith(random, list) {
    if (typeof random !== 'function') throw new RangeError('random is not a function');
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const r = random();
        if (typeof r !== 'number' || !(r >= 0 && r < 1)) throw new RangeError('random must return a number in [0, 1)');
        const j = Math.floor(r * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
