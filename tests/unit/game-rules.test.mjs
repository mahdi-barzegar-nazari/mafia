/**
 * The rule options: their defaults and how anything at all is turned into a valid set.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_RULES, DOCTOR_SELF_SAVE_MODES, NAME_LIMITS, normalizeRules } from '../../js/game/rules.js';

describe('DEFAULT_RULES', () => {
    it('is: the doctor may save himself once, no godfather, the role of the dead is revealed', () => {
        assert.deepEqual({ ...DEFAULT_RULES }, { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });
    });
    it('is frozen, and the self-save modes are never, once, always', () => {
        assert.ok(Object.isFrozen(DEFAULT_RULES));
        assert.deepEqual([...DOCTOR_SELF_SAVE_MODES], ['never', 'once', 'always']);
        assert.ok(Object.isFrozen(DOCTOR_SELF_SAVE_MODES));
    });
    it('has name limits of 1 to 24 characters', () => {
        assert.deepEqual({ ...NAME_LIMITS }, { min: 1, max: 24 });
    });
});

describe('normalizeRules', () => {
    it('gives the defaults for nothing, and for anything that is not an object', () => {
        for (const input of [undefined, null, 0, 1, 'x', true, [], [1, 2], () => 1, Symbol.iterator]) {
            assert.deepEqual(normalizeRules(input), { ...DEFAULT_RULES });
        }
        assert.deepEqual(normalizeRules({}), { ...DEFAULT_RULES });
    });

    it('keeps every valid value', () => {
        for (const doctorSelfSave of DOCTOR_SELF_SAVE_MODES) {
            for (const godfather of [true, false]) {
                for (const revealRoleOnDeath of [true, false]) {
                    const input = { doctorSelfSave, godfather, revealRoleOnDeath };
                    assert.deepEqual(normalizeRules(input), input);
                }
            }
        }
    });

    it('turns each invalid value into that option\'s default, and leaves the other options alone', () => {
        for (const bad of ['sometimes', 'ONCE', '', null, undefined, 1, true, {}, []]) {
            assert.deepEqual(normalizeRules({ doctorSelfSave: bad, godfather: true, revealRoleOnDeath: false }), {
                doctorSelfSave: 'once',
                godfather: true,
                revealRoleOnDeath: false
            });
        }
        for (const bad of ['true', 1, 0, null, undefined, {}, []]) {
            assert.deepEqual(normalizeRules({ doctorSelfSave: 'never', godfather: bad, revealRoleOnDeath: bad }), {
                doctorSelfSave: 'never',
                godfather: false,
                revealRoleOnDeath: true
            });
        }
    });

    it('ignores unknown keys: the result has exactly the three options', () => {
        const out = normalizeRules({ godfather: true, extra: 1, __proto__: { godfather: false }, toString: 5 });
        assert.deepEqual(out, { doctorSelfSave: 'once', godfather: true, revealRoleOnDeath: true });
        assert.deepEqual(Object.keys(out), ['doctorSelfSave', 'godfather', 'revealRoleOnDeath']);
    });

    it('reads only own properties, so nothing inherited can switch an option', () => {
        const inherited = Object.create({ godfather: true, doctorSelfSave: 'never', revealRoleOnDeath: false });
        assert.deepEqual(normalizeRules(inherited), { ...DEFAULT_RULES });
        const parsed = JSON.parse('{"__proto__": {"godfather": true}}');
        assert.deepEqual(normalizeRules(parsed), { ...DEFAULT_RULES });
        assert.equal(Object.prototype.godfather, undefined);
    });

    it('returns a fresh, unfrozen object each time, and is idempotent', () => {
        const a = normalizeRules({ godfather: true });
        const b = normalizeRules({ godfather: true });
        assert.notEqual(a, b);
        assert.notEqual(normalizeRules(), DEFAULT_RULES);
        assert.ok(!Object.isFrozen(a));
        assert.deepEqual(normalizeRules(a), a);
    });

    it('does not change its input', () => {
        const input = Object.freeze({ godfather: 'x', doctorSelfSave: 'never', extra: 1 });
        assert.doesNotThrow(() => normalizeRules(input));
        assert.deepEqual({ ...input }, { godfather: 'x', doctorSelfSave: 'never', extra: 1 });
    });
});
