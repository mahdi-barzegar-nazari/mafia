/**
 * createGame: validation of names, rules and roles, and the seeded deal.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame } from '../../js/game/engine.js';
import { GAME_SAVE_VERSION } from '../../js/game/constants.js';
import { roleCounts } from '../../js/game/roles.js';
import { deepFreeze, namesFor, seeded } from './helpers/gameKit.mjs';

const refused = (input, error) => assert.deepEqual(createGame(input), { ok: false, error }, JSON.stringify(input));
const count = (roles) => roles.reduce((acc, role) => ({ ...acc, [role]: (acc[role] ?? 0) + 1 }), {});

describe('createGame: the shape of a new game', () => {
    it('is { version, setup: { players, rules }, actions: [] } with ids p1..pN in the order given', () => {
        const result = createGame({ names: ['Ali', 'Sara', 'Reza'], random: seeded(1) });
        assert.equal(result.ok, true);
        assert.deepEqual(Object.keys(result), ['ok', 'game']);
        const { game } = result;
        assert.deepEqual(Object.keys(game), ['version', 'setup', 'actions']);
        assert.equal(game.version, GAME_SAVE_VERSION);
        assert.deepEqual(game.actions, []);
        assert.deepEqual(Object.keys(game.setup), ['players', 'rules']);
        assert.deepEqual(game.setup.players.map((p) => p.id), ['p1', 'p2', 'p3']);
        assert.deepEqual(game.setup.players.map((p) => p.name), ['Ali', 'Sara', 'Reza']);
        for (const player of game.setup.players) assert.deepEqual(Object.keys(player), ['id', 'name', 'role']);
    });

    it('is plain JSON: a round trip through JSON changes nothing', () => {
        const { game } = createGame({ names: namesFor(9), rules: { godfather: true }, random: seeded(3) });
        assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
    });

    it('stores the rules after normalizeRules: defaults filled in, unknown keys dropped', () => {
        const a = createGame({ names: namesFor(6), random: seeded(1) }).game;
        assert.deepEqual(a.setup.rules, { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });
        const b = createGame({ names: namesFor(6), rules: { godfather: true, doctorSelfSave: 'sometimes', foo: 1 }, random: seeded(1) }).game;
        assert.deepEqual(b.setup.rules, { doctorSelfSave: 'once', godfather: true, revealRoleOnDeath: true });
    });
});

describe('createGame: the input as a whole', () => {
    it('refuses anything that is not a plain object with INVALID_INPUT, and never throws', () => {
        for (const input of [undefined, null, 0, 5, 'names', true, [], [['a', 'b', 'c']], () => 1, new Map(), new Date(0)]) {
            refused(input, 'INVALID_INPUT');
        }
    });

    it('never throws, even for an input whose properties throw', () => {
        const hostile = {
            get names() {
                throw new Error('boom');
            }
        };
        assert.doesNotThrow(() => createGame(hostile));
        assert.deepEqual(createGame(hostile), { ok: false, error: 'INVALID_INPUT' });
        const proxy = new Proxy({}, { get() { throw new Error('boom'); }, getPrototypeOf() { throw new Error('boom'); } });
        assert.doesNotThrow(() => createGame(proxy));
        assert.equal(createGame(proxy).ok, false);
    });

    it('does not change its input (deep-frozen input is accepted)', () => {
        const input = deepFreeze({ names: namesFor(8), rules: { godfather: true }, roles: undefined, random: seeded(2) });
        assert.equal(createGame(input).ok, true);
        const dealt = deepFreeze({ names: namesFor(3), roles: ['citizen', 'mafia', 'detective'] });
        assert.equal(createGame(dealt).ok, true);
    });
});

describe('createGame: names', () => {
    it('needs an array: INVALID_NAMES', () => {
        for (const names of [undefined, null, 'a,b,c', 3, { length: 3 }, new Set(['a', 'b', 'c'])]) {
            refused({ names, random: seeded(1) }, 'INVALID_NAMES');
        }
    });

    it('needs 3 to 20 of them: INVALID_PLAYER_COUNT', () => {
        for (const n of [0, 1, 2, 21, 22, 50]) refused({ names: namesFor(n), random: seeded(1) }, 'INVALID_PLAYER_COUNT');
        for (const n of [3, 20]) assert.equal(createGame({ names: namesFor(n), random: seeded(1) }).ok, true);
    });

    it('checks the count before the names, so a long list of bad names is a count error', () => {
        refused({ names: Array(21).fill(''), random: seeded(1) }, 'INVALID_PLAYER_COUNT');
    });

    it('refuses a name that is not a string, is empty after trimming, or is longer than 24 characters: INVALID_NAME', () => {
        const ok = ['Ali', 'Sara'];
        for (const bad of [undefined, null, 5, true, {}, [], ['x'], '', '   ', '\t\n', '\u00a0\u3000', 'x'.repeat(25), ' '.repeat(3) + 'x'.repeat(25) + ' ']) {
            refused({ names: [...ok, bad], random: seeded(1) }, 'INVALID_NAME');
        }
    });

    it('refuses a name made only of invisible marks (zero-width, direction marks)', () => {
        for (const bad of ['\u200b', '\u200c\u200d', '\u200e', '\u202a\u202c', '\u2060', '\ufeff\u200b']) {
            refused({ names: ['Ali', 'Sara', bad], random: seeded(1) }, 'INVALID_NAME');
        }
        assert.equal(createGame({ names: ['Ali', 'Sara', 'a\u200c'], random: seeded(1) }).ok, true, 'a visible letter makes it a name');
    });

    it('refuses a hole in the list (a sparse array) as INVALID_NAME', () => {
        const sparse = ['Ali', 'Sara', 'Reza'];
        delete sparse[1];
        refused({ names: sparse, random: seeded(1) }, 'INVALID_NAME');
    });

    it('accepts 24 characters, counting a letter outside the BMP as one', () => {
        const longest = 'x'.repeat(24);
        const emoji = '\u{1F600}'.repeat(24);
        const persian = '\u0639'.repeat(24);
        const game = createGame({ names: [longest, emoji, persian], random: seeded(1) });
        assert.equal(game.ok, true);
        assert.deepEqual(game.game.setup.players.map((p) => p.name), [longest, emoji, persian]);
        refused({ names: [longest, '\u{1F600}'.repeat(25), persian], random: seeded(1) }, 'INVALID_NAME');
    });

    it('stores the trimmed name', () => {
        const { game } = createGame({ names: ['  Ali ', '\tSara\n', 'Reza'], random: seeded(1) });
        assert.deepEqual(game.setup.players.map((p) => p.name), ['Ali', 'Sara', 'Reza']);
    });

    it('refuses duplicates after trimming and case folding: DUPLICATE_NAME', () => {
        for (const names of [
            ['Ali', 'Ali', 'Reza'],
            ['Ali', ' Ali ', 'Reza'],
            ['Ali', 'ali', 'Reza'],
            ['ALI', 'aLi', 'Reza'],
            ['Reza', 'Sara', '\tsara\u00a0']
        ]) {
            refused({ names, random: seeded(1) }, 'DUPLICATE_NAME');
        }
    });

    it('treats letter and digit variants of the text helpers as the same name', () => {
        // Arabic yeh and Persian yeh, Arabic kaf and Persian keheh, Persian and Latin digits: as normalizeWord folds them.
        refused({ names: ['\u0639\u0644\u064a', '\u0639\u0644\u06cc', 'Reza'], random: seeded(1) }, 'DUPLICATE_NAME');
        refused({ names: ['\u0643\u0627\u0645\u0631\u0627\u0646', '\u06a9\u0627\u0645\u0631\u0627\u0646', 'Reza'], random: seeded(1) }, 'DUPLICATE_NAME');
        refused({ names: ['P\u06f1', 'P1', 'Reza'], random: seeded(1) }, 'DUPLICATE_NAME');
        refused({ names: ['Ali', 'Ali!', 'Reza'], random: seeded(1) }, 'DUPLICATE_NAME');
    });

    it('keeps different names different, including names that are only punctuation', () => {
        assert.equal(createGame({ names: ['Ali', 'Alia', 'Reza'], random: seeded(1) }).ok, true);
        assert.equal(createGame({ names: ['!', '?', '!!'], random: seeded(1) }).ok, true);
        assert.equal(createGame({ names: ['P1', 'P2', 'P12'], random: seeded(1) }).ok, true);
        refused({ names: ['!', '!', 'a'], random: seeded(1) }, 'DUPLICATE_NAME');
    });

    it('reports a bad name before a duplicate', () => {
        refused({ names: ['Ali', 'Ali', ''], random: seeded(1) }, 'INVALID_NAME');
    });
});

describe('createGame: the godfather', () => {
    it('is refused below 6 players: GODFATHER_NOT_ALLOWED', () => {
        for (const n of [3, 4, 5]) refused({ names: namesFor(n), rules: { godfather: true }, random: seeded(1) }, 'GODFATHER_NOT_ALLOWED');
    });

    it('is allowed from 6 players and takes one mafia slot', () => {
        for (let n = 6; n <= 20; n++) {
            const { ok, game } = createGame({ names: namesFor(n), rules: { godfather: true }, random: seeded(n) });
            assert.equal(ok, true, `${n} players`);
            const counts = count(game.setup.players.map((p) => p.role));
            assert.equal(counts.godfather, 1);
            assert.equal(counts.mafia + counts.godfather, roleCounts(n).mafia);
        }
    });

    it('is checked after the names, so bad names win', () => {
        refused({ names: ['a', 'a', 'b'], rules: { godfather: true }, random: seeded(1) }, 'DUPLICATE_NAME');
        refused({ names: ['a', 'b'], rules: { godfather: true }, random: seeded(1) }, 'INVALID_PLAYER_COUNT');
    });
});

describe('createGame: roles dealt by the moderator', () => {
    const names = namesFor(6);

    it('uses them exactly, in the order given, and never calls random', () => {
        const roles = ['citizen', 'mafia', 'detective', 'citizen', 'doctor', 'mafia'];
        const random = () => assert.fail('random must not be consulted when the roles are given');
        const { ok, game } = createGame({ names, roles, random });
        assert.equal(ok, true);
        assert.deepEqual(game.setup.players.map((p) => p.role), roles);
    });

    it('does not keep a reference to the array it was given', () => {
        const roles = ['citizen', 'mafia', 'detective', 'citizen', 'doctor', 'mafia'];
        const { game } = createGame({ names, roles });
        roles[0] = 'mafia';
        assert.equal(game.setup.players[0].role, 'citizen');
    });

    it('treats null like "not given" and then needs random', () => {
        assert.equal(createGame({ names, roles: null, random: seeded(1) }).ok, true);
        refused({ names, roles: null }, 'INVALID_RANDOM');
    });

    it('refuses any list that is not exactly the roles of the table: INVALID_ROLES', () => {
        const good = ['citizen', 'mafia', 'detective', 'citizen', 'doctor', 'mafia'];
        const bads = [
            'mafia',
            {},
            good.slice(1),
            [...good, 'citizen'],
            ['mafia', 'mafia', 'mafia', 'detective', 'doctor', 'citizen'],
            ['citizen', 'citizen', 'detective', 'citizen', 'doctor', 'mafia'],
            ['citizen', 'mafia', 'detective', 'citizen', 'citizen', 'mafia'],
            ['godfather', 'mafia', 'detective', 'citizen', 'doctor', 'citizen'],
            ['wizard', 'mafia', 'detective', 'citizen', 'doctor', 'mafia'],
            [1, 2, 3, 4, 5, 6],
            [null, null, null, null, null, null],
            []
        ];
        for (const roles of bads) refused({ names, roles, random: seeded(1) }, 'INVALID_ROLES');
    });

    it('wants the godfather in the list exactly when the rule is on', () => {
        const withGodfather = ['godfather', 'mafia', 'detective', 'citizen', 'doctor', 'citizen'];
        assert.equal(createGame({ names, rules: { godfather: true }, roles: withGodfather }).ok, true);
        refused({ names, rules: { godfather: false }, roles: withGodfather }, 'INVALID_ROLES');
        refused({ names, rules: { godfather: true }, roles: ['mafia', 'mafia', 'detective', 'citizen', 'doctor', 'citizen'] }, 'INVALID_ROLES');
    });

    it('accepts every legal list for every size, and refuses it when one role is swapped for another', () => {
        for (let n = 3; n <= 20; n++) {
            const roles = createGame({ names: namesFor(n), random: seeded(n) }).game.setup.players.map((p) => p.role);
            assert.equal(createGame({ names: namesFor(n), roles }).ok, true, `${n} players`);
            const swapped = [...roles];
            const i = swapped.indexOf('citizen');
            swapped[i] = 'mafia';
            refused({ names: namesFor(n), roles: swapped }, 'INVALID_ROLES');
        }
    });
});

describe('createGame: the seeded deal', () => {
    it('is reproducible: the same seed deals the same roles', () => {
        for (const n of [3, 8, 20]) {
            const a = createGame({ names: namesFor(n), random: seeded(42) }).game;
            const b = createGame({ names: namesFor(n), random: seeded(42) }).game;
            assert.deepEqual(a, b);
        }
    });

    it('respects the role counts for every size, with and without the godfather, for many seeds', () => {
        for (let n = 3; n <= 20; n++) {
            for (const godfather of [false, true]) {
                const expected = roleCounts(n, { godfather });
                if (expected === null) continue;
                for (let seed = 1; seed <= 8; seed++) {
                    const { game } = createGame({ names: namesFor(n), rules: { godfather }, random: seeded(seed * 31 + n) });
                    const got = count(game.setup.players.map((p) => p.role));
                    for (const role of Object.keys(expected)) assert.equal(got[role] ?? 0, expected[role], `${n} players, godfather ${godfather}, ${role}`);
                }
            }
        }
    });

    it('depends on random: different seeds do not all give one deal', () => {
        const deals = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            deals.add(createGame({ names: namesFor(8), random: seeded(seed) }).game.setup.players.map((p) => p.role).join());
        }
        assert.ok(deals.size > 20, `only ${deals.size} different deals out of 40`);
    });

    it('is really shuffled: every role lands on every seat, about as often as chance says', () => {
        const SEEDS = 1200;
        const seats = Array.from({ length: 8 }, () => ({}));
        for (let seed = 1; seed <= SEEDS; seed++) {
            const { game } = createGame({ names: namesFor(8), random: seeded(seed) });
            game.setup.players.forEach((p, i) => (seats[i][p.role] = (seats[i][p.role] ?? 0) + 1));
        }
        const share = { mafia: 2 / 8, doctor: 1 / 8, detective: 1 / 8, citizen: 4 / 8 };
        for (const [seat, tally] of seats.entries()) {
            for (const [role, p] of Object.entries(share)) {
                const expected = SEEDS * p;
                const spread = 5 * Math.sqrt(SEEDS * p * (1 - p));
                assert.ok(Math.abs((tally[role] ?? 0) - expected) < spread, `seat ${seat + 1}, ${role}: ${tally[role]} (expected about ${expected})`);
            }
        }
    });

    it('is exactly Fisher-Yates over the canonical list (known answers)', () => {
        // canonical list for 3 players: mafia, detective, citizen
        const zero = createGame({ names: namesFor(3), random: () => 0 }).game;
        assert.deepEqual(zero.setup.players.map((p) => p.role), ['detective', 'citizen', 'mafia']);
        const high = createGame({ names: namesFor(3), random: () => 0.999999 }).game;
        assert.deepEqual(high.setup.players.map((p) => p.role), ['mafia', 'detective', 'citizen']);
        const draws = [];
        const spy = () => (draws.push(1), 0.5);
        createGame({ names: namesFor(8), random: spy });
        assert.equal(draws.length, 7, 'one draw per swap: n - 1');
    });

    it('refuses a random that is missing, not a function, throws, or leaves [0, 1): INVALID_RANDOM', () => {
        const names = namesFor(5);
        refused({ names }, 'INVALID_RANDOM');
        for (const random of [null, 0.5, 'x', {}, []]) refused({ names, random }, 'INVALID_RANDOM');
        for (const value of [1, 1.5, -0.01, NaN, Infinity, '0.5', null, undefined]) refused({ names, random: () => value }, 'INVALID_RANDOM');
        refused({ names, random: () => { throw new Error('boom'); } }, 'INVALID_RANDOM');
    });

    it('accepts 0 as a draw and a value just below 1', () => {
        assert.equal(createGame({ names: namesFor(5), random: () => 0 }).ok, true);
        assert.equal(createGame({ names: namesFor(5), random: () => 1 - Number.EPSILON }).ok, true);
    });
});
