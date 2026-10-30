/**
 * Game rules and theme colors. Pure data and pure functions, no DOM.
 */

/** The screens that exist. A phase named here has a `#screen-<phase>` section in index.html. */
export const VALID_PHASES = new Set(['welcome', 'setup']);

export const RULES = {
    players: { min: 3, max: 20 }
};

/** What the players-count field shows before anything else is typed (`index.html` carries the same value). */
export const DEFAULT_PLAYERS_COUNT = 8;

export const THEME_COLORS = {
    default: '#090d16',
    noir: '#120e0a',
    classic: '#0d0d0d',
    emerald: '#061412',
    crimson: '#14080a',
    sunset: '#1a0f0a',
    cyber: '#05010f',
    ocean: '#04121a'
};
