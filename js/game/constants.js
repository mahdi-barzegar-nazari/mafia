/**
 * Names the engine and its callers share: phases, action types, winners and error codes. Plain strings;
 * an error code is a stable identifier, never text to show (the UI maps codes to catalog keys).
 */

/** The format of a saved game (`serializeGame`). Bump it when the shape of a game changes. */
export const GAME_SAVE_VERSION = 1;

export const PHASES = Object.freeze({
    NIGHT: 'night',
    MORNING: 'morning',
    DAY: 'day',
    DUSK: 'dusk',
    ENDED: 'ended'
});

export const ACTION_TYPES = Object.freeze({
    MAFIA_KILL: 'MAFIA_KILL',
    DOCTOR_SAVE: 'DOCTOR_SAVE',
    DETECTIVE_CHECK: 'DETECTIVE_CHECK',
    CONTINUE: 'CONTINUE',
    CAST_VOTES: 'CAST_VOTES'
});

export const WINNERS = Object.freeze({ MAFIA: 'mafia', TOWN: 'town' });

export const ERRORS = Object.freeze({
    // createGame
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_NAMES: 'INVALID_NAMES',
    INVALID_PLAYER_COUNT: 'INVALID_PLAYER_COUNT',
    INVALID_NAME: 'INVALID_NAME',
    DUPLICATE_NAME: 'DUPLICATE_NAME',
    GODFATHER_NOT_ALLOWED: 'GODFATHER_NOT_ALLOWED',
    INVALID_ROLES: 'INVALID_ROLES',
    INVALID_RANDOM: 'INVALID_RANDOM',
    // applyAction and undo
    INVALID_GAME: 'INVALID_GAME',
    INVALID_ACTION: 'INVALID_ACTION',
    GAME_ENDED: 'GAME_ENDED',
    WRONG_PHASE: 'WRONG_PHASE',
    WRONG_STEP: 'WRONG_STEP',
    STEP_ALREADY_DONE: 'STEP_ALREADY_DONE',
    UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
    TARGET_DEAD: 'TARGET_DEAD',
    SELF_SAVE_NOT_ALLOWED: 'SELF_SAVE_NOT_ALLOWED',
    CANNOT_CHECK_SELF: 'CANNOT_CHECK_SELF',
    INVALID_TALLY: 'INVALID_TALLY',
    NOTHING_TO_UNDO: 'NOTHING_TO_UNDO',
    // deserializeGame
    INVALID_JSON: 'INVALID_JSON',
    INVALID_SAVE: 'INVALID_SAVE',
    UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
    INVALID_SETUP: 'INVALID_SETUP',
    REPLAY_FAILED: 'REPLAY_FAILED'
});
