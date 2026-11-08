/**
 * The roles of the game and the order of the night. Plain constants: no imports, no text a player can
 * read (the display names live in the i18n catalogs, added when a screen needs them).
 */

/** Every role id, in the canonical order used when a role list is built. */
export const ROLE_IDS = Object.freeze(['mafia', 'godfather', 'doctor', 'detective', 'citizen']);

export const ROLES = Object.freeze({
    MAFIA: 'mafia',
    GODFATHER: 'godfather',
    DOCTOR: 'doctor',
    DETECTIVE: 'detective',
    CITIZEN: 'citizen'
});

/** The mafia team: the roles that win with the mafia and that count against the town. */
export const MAFIA_TEAM = Object.freeze(['mafia', 'godfather']);

/** The town: everyone who is not on the mafia team. */
export const TOWN_TEAM = Object.freeze(['doctor', 'detective', 'citizen']);

/**
 * The night, in the order it is played. Each step is woken by one group of roles and takes one action.
 * The mafia team is ONE step with ONE target, however many of them are alive.
 */
export const NIGHT_STEPS = Object.freeze([
    Object.freeze({ step: 'mafia', roles: Object.freeze(['mafia', 'godfather']), action: 'MAFIA_KILL' }),
    Object.freeze({ step: 'doctor', roles: Object.freeze(['doctor']), action: 'DOCTOR_SAVE' }),
    Object.freeze({ step: 'detective', roles: Object.freeze(['detective']), action: 'DETECTIVE_CHECK' })
]);
