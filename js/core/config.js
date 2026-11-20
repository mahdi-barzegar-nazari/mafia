/**
 * Game rules and theme colors. Pure data and pure functions, no DOM.
 */

/**
 * The screens that exist. A phase named here has a `#screen-<phase>` section in index.html. `welcome` and `setup`
 * are outside a game; `reveal` (the roles are handed out one player at a time) and the five phases of the rules
 * engine (`night`, `morning`, `day`, `dusk`, `ended`) belong to a game in progress (see `isMatchInProgress` in
 * core/phase.js). After the reveal, `gameState.phase` is always the engine's own phase of `gameState.game`.
 */
export const VALID_PHASES = new Set(['welcome', 'setup', 'reveal', 'night', 'morning', 'day', 'dusk', 'ended']);

/**
 * The phases that show the game screens and their shared chrome: exactly the phases of the rules engine, which the
 * app mirrors one for one (js/game/constants.js names them; core/ cannot import game/, so the list is repeated here
 * and tests/unit/game-screens.test.mjs checks that the two agree).
 */
export const GAME_PHASES = Object.freeze(['night', 'morning', 'day', 'dusk', 'ended']);

/**
 * How long a press is ignored after a role card was hidden, in milliseconds. A second, quick tap on the spot of
 * "Hide and pass on" lands on whatever the next screen has there (the next player's "I am ..." button, or on the
 * first night screen a control of the moderator) while the person who hid the card still holds the phone. See
 * ui/handOffGuard.js.
 */
export const HAND_OFF_GUARD_MS = 800;

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
