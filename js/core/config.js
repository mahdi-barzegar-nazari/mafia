/**
 * Game rules and theme colors. Pure data and pure functions, no DOM.
 */

/**
 * The screens that exist. A phase named here has a `#screen-<phase>` section in index.html. `welcome` and `setup`
 * are outside a game; `reveal` (the roles are handed out one player at a time) and `moderator` (the moderator's
 * list) belong to a game in progress (see `isMatchInProgress` in core/phase.js).
 */
export const VALID_PHASES = new Set(['welcome', 'setup', 'reveal', 'moderator']);

/**
 * The help texts behind the (i) buttons of the setup form (`data-info="key"` in index.html). The texts themselves are
 * in the translation catalogs as `info.<key>.title` and `info.<key>.text`; `showInfoModal` (core/dispatch.js) reads
 * them with `t()` and ignores any other key.
 */
export const INFO_KEYS = Object.freeze(['doctorSelfSave', 'godfather', 'revealRoleOnDeath']);

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
