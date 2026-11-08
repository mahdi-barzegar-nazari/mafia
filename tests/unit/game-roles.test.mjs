/**
 * The role table: how many of each role for n players, the data constants, and the dealing helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAFIA_TEAM, NIGHT_STEPS, ROLE_IDS, ROLES, TOWN_TEAM } from '../../js/data/roles.js';
import { isMafiaTeam, matchesCounts, roleCounts, roleList, shuffleWith } from '../../js/game/roles.js';
import { seeded } from './helpers/gameKit.mjs';

/** [n, mafia team, doctor, detective, citizens]: written out, not computed, so a wrong formula cannot agree with itself. */
const TABLE = [
    [3, 1, 0, 1, 1],
    [4, 1, 1, 1, 1],
    [5, 1, 1, 1, 2],
    [6, 2, 1, 1, 2],
    [7, 2, 1, 1, 3],
    [8, 2, 1, 1, 4],
    [9, 3, 1, 1, 4],
    [10, 3, 1, 1, 5],
    [11, 3, 1, 1, 6],
    [12, 4, 1, 1, 6],
    [13, 4, 1, 1, 7],
    [14, 4, 1, 1, 8],
    [15, 5, 1, 1, 8],
    [16, 5, 1, 1, 9],
    [17, 5, 1, 1, 10],
    [18, 6, 1, 1, 10],
    [19, 6, 1, 1, 11],
    [20, 6, 1, 1, 12]
];

describe('roleCounts without the godfather', () => {
    for (const [n, team, doctor, detective, citizen] of TABLE) {
        it(`${n} players: ${team} mafia, ${doctor} doctor, ${detective} detective, ${citizen} citizens`, () => {
            const expected = { mafia: team, godfather: 0, doctor, detective, citizen };
            assert.deepEqual(roleCounts(n), expected);
            assert.deepEqual(roleCounts(n, {}), expected);
            assert.deepEqual(roleCounts(n, { godfather: false }), expected);
        });
    }

    it('always has all five role keys, and the total is the number of players', () => {
        for (const [n] of TABLE) {
            const counts = roleCounts(n);
            assert.deepEqual(Object.keys(counts).sort(), [...ROLE_IDS].sort());
            assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), n);
            assert.ok(Object.values(counts).every((v) => Number.isInteger(v) && v >= 0));
        }
    });

    it('matches the examples of the rules: 3, 4, 6, 8, 12 and 20 players', () => {
        const team = (n) => roleCounts(n).mafia;
        assert.deepEqual([3, 4, 6, 8, 12, 20].map(team), [1, 1, 2, 2, 4, 6]);
        assert.deepEqual([3, 4, 6, 8, 12, 20].map((n) => roleCounts(n).doctor), [0, 1, 1, 1, 1, 1]);
        assert.deepEqual([3, 4, 6, 8, 12, 20].map((n) => roleCounts(n).citizen), [1, 1, 2, 4, 6, 12]);
    });

    it('is a mafia team of at least one and always fewer than the others (nobody wins before the first night)', () => {
        for (const [n] of TABLE) {
            const counts = roleCounts(n);
            assert.ok(counts.mafia >= 1);
            assert.ok(counts.mafia < n - counts.mafia, `${n} players`);
        }
    });
});

describe('roleCounts with the godfather', () => {
    it('takes one slot of the team: the team size does not change', () => {
        for (const [n, team, doctor, detective, citizen] of TABLE.filter(([n]) => n >= 6)) {
            const counts = roleCounts(n, { godfather: true });
            assert.deepEqual(counts, { mafia: team - 1, godfather: 1, doctor, detective, citizen }, `${n} players`);
            assert.equal(counts.mafia + counts.godfather, roleCounts(n).mafia);
            assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), n);
        }
    });

    it('is refused (null) below 6 players, where the team has fewer than 2 mafia', () => {
        for (const n of [3, 4, 5]) assert.equal(roleCounts(n, { godfather: true }), null, `${n} players`);
        assert.notEqual(roleCounts(6, { godfather: true }), null);
    });

    it('reads the option like normalizeRules: only a real boolean turns it on', () => {
        assert.deepEqual(roleCounts(8, { godfather: 'true' }), roleCounts(8));
        assert.deepEqual(roleCounts(8, { godfather: 1 }), roleCounts(8));
        assert.deepEqual(roleCounts(8, { godfather: null }), roleCounts(8));
        assert.deepEqual(roleCounts(3, { godfather: 'yes' }), roleCounts(3));
    });
});

describe('roleCounts for unsupported input', () => {
    it('is null for a count outside 3 to 20 or one that is not a whole number', () => {
        for (const n of [2, 1, 0, -1, 21, 100, 3.5, 7.0000001, NaN, Infinity, -Infinity, '8', '3', null, undefined, {}, [], true]) {
            assert.equal(roleCounts(n), null, String(n));
        }
    });

    it('ignores unknown keys and a missing rules argument, and never throws on odd rules', () => {
        assert.deepEqual(roleCounts(8, { somethingElse: 1 }), roleCounts(8));
        for (const rules of [null, undefined, 5, 'x', [], () => 1]) assert.deepEqual(roleCounts(8, rules), roleCounts(8));
    });
});

describe('role constants (js/data/roles.js)', () => {
    it('names the five roles', () => {
        assert.deepEqual([...ROLE_IDS], ['mafia', 'godfather', 'doctor', 'detective', 'citizen']);
        assert.deepEqual({ ...ROLES }, { MAFIA: 'mafia', GODFATHER: 'godfather', DOCTOR: 'doctor', DETECTIVE: 'detective', CITIZEN: 'citizen' });
    });

    it('splits them into the mafia team (mafia, godfather) and the town (the rest)', () => {
        assert.deepEqual([...MAFIA_TEAM], ['mafia', 'godfather']);
        assert.deepEqual([...TOWN_TEAM], ['doctor', 'detective', 'citizen']);
        assert.deepEqual([...MAFIA_TEAM, ...TOWN_TEAM].sort(), [...ROLE_IDS].sort());
        for (const role of ROLE_IDS) assert.equal(isMafiaTeam(role), MAFIA_TEAM.includes(role), role);
        assert.equal(isMafiaTeam('wizard'), false);
        assert.equal(isMafiaTeam(undefined), false);
    });

    it('plays the night in the order mafia team, doctor, detective, one action each', () => {
        assert.deepEqual(
            NIGHT_STEPS.map((s) => [s.step, [...s.roles], s.action]),
            [
                ['mafia', ['mafia', 'godfather'], 'MAFIA_KILL'],
                ['doctor', ['doctor'], 'DOCTOR_SAVE'],
                ['detective', ['detective'], 'DETECTIVE_CHECK']
            ]
        );
    });

    it('is frozen, so no caller can change the rules by accident', () => {
        for (const value of [ROLE_IDS, ROLES, MAFIA_TEAM, TOWN_TEAM, NIGHT_STEPS, NIGHT_STEPS[0], NIGHT_STEPS[0].roles]) {
            assert.ok(Object.isFrozen(value));
        }
    });
});

describe('roleList and matchesCounts', () => {
    it('roleList writes the roles in canonical order', () => {
        assert.deepEqual(roleList(roleCounts(6, { godfather: true })), ['mafia', 'godfather', 'doctor', 'detective', 'citizen', 'citizen']);
        assert.deepEqual(roleList(roleCounts(3)), ['mafia', 'detective', 'citizen']);
    });

    it('matchesCounts accepts any order of exactly the right roles and nothing else', () => {
        const counts = roleCounts(6);
        const good = ['citizen', 'mafia', 'detective', 'mafia', 'doctor', 'citizen'];
        assert.equal(matchesCounts(good, counts), true);
        assert.equal(matchesCounts(roleList(counts), counts), true);
        assert.equal(matchesCounts(good.slice(1), counts), false, 'one too few');
        assert.equal(matchesCounts([...good, 'citizen'], counts), false, 'one too many');
        assert.equal(matchesCounts(['mafia', 'mafia', 'mafia', 'doctor', 'detective', 'citizen'], counts), false, 'wrong mix');
        assert.equal(matchesCounts(['godfather', 'mafia', 'doctor', 'detective', 'citizen', 'citizen'], counts), false, 'a godfather without the rule');
        assert.equal(matchesCounts(['wizard', 'mafia', 'doctor', 'detective', 'citizen', 'citizen'], counts), false, 'unknown role');
        assert.equal(matchesCounts('mafia', counts), false);
        assert.equal(matchesCounts(null, counts), false);
        assert.equal(matchesCounts(['constructor', 'mafia', 'doctor', 'detective', 'citizen', 'citizen'], counts), false, 'inherited names are not roles');
    });
});

describe('shuffleWith (Fisher-Yates with an injected random)', () => {
    it('is exact for a scripted random: 0 always picks the first slot, a value near 1 never swaps', () => {
        assert.deepEqual(shuffleWith(() => 0, ['a', 'b', 'c', 'd']), ['b', 'c', 'd', 'a']);
        assert.deepEqual(shuffleWith(() => 0.999999, ['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
        const script = [0.5, 0.2, 0.9];
        let i = 0;
        // i=3: j=floor(0.5*4)=2 swap(3,2) -> a b d c;  i=2: j=floor(0.2*3)=0 swap(2,0) -> d b a c;  i=1: j=floor(0.9*2)=1 no swap
        assert.deepEqual(shuffleWith(() => script[i++], ['a', 'b', 'c', 'd']), ['d', 'b', 'a', 'c']);
        assert.equal(i, 3, 'draws exactly length - 1 numbers');
    });

    it('does not change its input and returns a permutation', () => {
        const input = Object.freeze(['a', 'b', 'c', 'd', 'e']);
        const out = shuffleWith(seeded(7), input);
        assert.deepEqual([...out].sort(), ['a', 'b', 'c', 'd', 'e']);
        assert.notEqual(out, input);
    });

    it('draws nothing for an empty or one-element list', () => {
        const never = () => assert.fail('random must not be called');
        assert.deepEqual(shuffleWith(never, []), []);
        assert.deepEqual(shuffleWith(never, ['x']), ['x']);
    });

    it('throws a RangeError for a random that is not a function or returns something outside [0, 1)', () => {
        for (const bad of [undefined, null, 5, 'x', {}]) assert.throws(() => shuffleWith(bad, ['a', 'b']), RangeError);
        for (const value of [1, -0.1, 2, NaN, Infinity, '0.5', null, undefined]) {
            assert.throws(() => shuffleWith(() => value, ['a', 'b', 'c']), RangeError, String(value));
        }
    });
});
