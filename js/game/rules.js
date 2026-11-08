/**
 * The rule options a moderator can change, and the limits of a name. Pure.
 */

export const DOCTOR_SELF_SAVE_MODES = Object.freeze(['never', 'once', 'always']);

/** The limits of a player's name, in characters (code points) after trimming. */
export const NAME_LIMITS = Object.freeze({ min: 1, max: 24 });

export const DEFAULT_RULES = Object.freeze({
    /** 'never' | 'once' (once per game) | 'always': may the doctor save himself? */
    doctorSelfSave: 'once',
    /** One of the mafia slots is the godfather (team size unchanged). Needs 6 or more players. */
    godfather: false,
    /** Is a dead player's role announced, for night deaths and vote eliminations? */
    revealRoleOnDeath: true
});

function own(source, key) {
    return source !== null && typeof source === 'object' && Object.hasOwn(source, key) ? source[key] : undefined;
}

/**
 * A complete, valid set of rules from anything: unknown keys are ignored and a missing or invalid value
 * becomes the default. Always a fresh object with exactly the three keys of `DEFAULT_RULES`.
 */
export function normalizeRules(input) {
    const doctorSelfSave = own(input, 'doctorSelfSave');
    const godfather = own(input, 'godfather');
    const revealRoleOnDeath = own(input, 'revealRoleOnDeath');
    return {
        doctorSelfSave: DOCTOR_SELF_SAVE_MODES.includes(doctorSelfSave) ? doctorSelfSave : DEFAULT_RULES.doctorSelfSave,
        godfather: typeof godfather === 'boolean' ? godfather : DEFAULT_RULES.godfather,
        revealRoleOnDeath: typeof revealRoleOnDeath === 'boolean' ? revealRoleOnDeath : DEFAULT_RULES.revealRoleOnDeath
    };
}
