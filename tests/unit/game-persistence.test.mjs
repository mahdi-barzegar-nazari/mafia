/**
 * Saving and loading: the round trip, and everything a bad save can be. The text is untrusted, so a
 * tampered action must be caught by the replay, and nothing may ever throw.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERRORS } from '../../js/game/constants.js';
import { applyAction, createGame, getState } from '../../js/game/engine.js';
import { GAME_SAVE_VERSION, deserializeGame, serializeGame } from '../../js/game/persistence.js';
import { CONTINUE, check, eight, eightGodfather, kill, newGame, play, save, votes } from './helpers/gameKit.mjs';

/** A game in the middle of round 2, with a self-save and a vote behind it. */
const midGame = () =>
    play(eight(), kill('p5'), save('p3'), check('p1'), CONTINUE, votes({ p6: 2, p7: 1 }), CONTINUE, kill('p3'), save('p7'));
const endedGame = () =>
    play(newGame(3, { roles: ['mafia', 'detective', 'citizen'] }), kill('p3'), check('p1'), CONTINUE);

const textOf = (game) => serializeGame(game);
const edit = (game, change) => {
    const data = JSON.parse(textOf(game));
    change(data);
    return JSON.stringify(data);
};
const rejects = (text, error) => assert.deepEqual(deserializeGame(text), { ok: false, error }, String(text).slice(0, 120));

describe('serializeGame and deserializeGame: the round trip', () => {
    it('gives back a game deep-equal to the one saved: fresh, mid-game and ended', () => {
        for (const game of [eight(), midGame(), endedGame(), eightGodfather({ revealRoleOnDeath: false, doctorSelfSave: 'never' })]) {
            const result = deserializeGame(serializeGame(game));
            assert.equal(result.ok, true);
            assert.deepStrictEqual(result.game, game);
            assert.deepStrictEqual(getState(result.game), getState(game));
        }
    });

    it('writes JSON text with exactly version, setup and actions, in that order', () => {
        const data = JSON.parse(serializeGame(midGame()));
        assert.deepEqual(Object.keys(data), ['version', 'setup', 'actions']);
        assert.equal(data.version, GAME_SAVE_VERSION);
        assert.equal(GAME_SAVE_VERSION, 1);
        assert.equal(typeof serializeGame(eight()), 'string');
        assert.equal(serializeGame(midGame()), serializeGame(midGame()), 'the same game always gives the same text');
    });

    it('carries the whole game: roles, rules and every action, so a restored game plays on', () => {
        const restored = deserializeGame(serializeGame(midGame())).game;
        const next = applyAction(restored, { type: 'DETECTIVE_CHECK', target: 'p2' });
        assert.equal(next.ok, true);
        assert.equal(getState(next.game).phase, 'morning');
        assert.equal(getState(restored).doctorSelfSaveUsed, true);
    });

    it('is not tied to key order: a save with its keys written in another order is still read', () => {
        const g = midGame();
        const data = JSON.parse(serializeGame(g));
        const shuffled = { actions: data.actions.map((a) => Object.fromEntries(Object.entries(a).reverse())), setup: { rules: data.setup.rules, players: data.setup.players.map((p) => ({ role: p.role, name: p.name, id: p.id })) }, version: data.version };
        const result = deserializeGame(JSON.stringify(shuffled));
        assert.equal(result.ok, true);
        assert.deepStrictEqual(result.game, g);
    });

    it('survives a trip through a pretty-printed text too', () => {
        const g = midGame();
        assert.deepStrictEqual(deserializeGame(JSON.stringify(JSON.parse(serializeGame(g)), null, 2)).game, g);
    });

    it('returns a game that shares nothing with the text or with another load', () => {
        const text = serializeGame(midGame());
        const a = deserializeGame(text).game;
        const b = deserializeGame(text).game;
        a.setup.players[0].name = 'changed';
        a.actions[0].target = 'p9';
        assert.equal(b.setup.players[0].name, 'P1');
        assert.equal(b.actions[0].target, 'p5');
    });
});

describe('serializeGame: not a game', () => {
    it('throws a TypeError, because that is a programming error rather than bad user input', () => {
        for (const bad of [undefined, null, 5, 'x', [], {}, { version: 1 }, { version: 2, setup: { players: [], rules: {} }, actions: [] }]) {
            assert.throws(() => serializeGame(bad), TypeError);
        }
    });
});

describe('deserializeGame: the version', () => {
    it('rejects every version but the current one: UNSUPPORTED_VERSION', () => {
        for (const version of [0, 2, 99, -1, 1.5, '1', null, true, [1], { v: 1 }]) rejects(edit(eight(), (d) => (d.version = version)), 'UNSUPPORTED_VERSION');
        rejects(edit(eight(), (d) => delete d.version), 'UNSUPPORTED_VERSION');
    });

    it('checks the version before the rest, so a save of a later format is called that even if its shape differs', () => {
        rejects(JSON.stringify({ version: 2, whatever: [1, 2, 3] }), 'UNSUPPORTED_VERSION');
    });
});

describe('deserializeGame: text that is not a save', () => {
    it('rejects text that is not JSON: INVALID_JSON', () => {
        for (const text of ['', ' ', '{', '}', '{"version":1', 'not json', 'undefined', 'NaN', "{'version':1}", '{"a":1,}', '[1,2', '\u0000', 'null,']) rejects(text, 'INVALID_JSON');
        rejects('['.repeat(200000), 'INVALID_JSON');
        rejects('{"a":'.repeat(100000), 'INVALID_JSON');
    });

    it('rejects JSON that is not an object: INVALID_SAVE', () => {
        for (const text of ['null', '5', '"x"', 'true', '[]', '[{"version":1}]', '0']) rejects(text, 'INVALID_SAVE');
    });

    it('rejects anything that is not a string: INVALID_SAVE', () => {
        for (const value of [undefined, null, 0, 5, true, {}, [], { version: 1 }, () => 1, Symbol('x'), 10n, new String(serializeGame(eight()))]) {
            assert.deepEqual(deserializeGame(value), { ok: false, error: 'INVALID_SAVE' });
        }
    });
});

describe('deserializeGame: the shape', () => {
    it('rejects missing or extra keys at the top: INVALID_SAVE', () => {
        rejects(edit(eight(), (d) => delete d.setup), 'INVALID_SAVE');
        rejects(edit(eight(), (d) => delete d.actions), 'INVALID_SAVE');
        rejects(edit(eight(), (d) => (d.extra = 1)), 'INVALID_SAVE');
        rejects(edit(eight(), (d) => (d.actions = 'none')), 'INVALID_SAVE');
        rejects(edit(eight(), (d) => (d.actions = {})), 'INVALID_SAVE');
        rejects(edit(eight(), (d) => (d.actions = null)), 'INVALID_SAVE');
    });

    it('rejects a damaged setup: INVALID_SETUP', () => {
        const bad = [
            (d) => (d.setup = null),
            (d) => (d.setup = []),
            (d) => (d.setup = 'x'),
            (d) => delete d.setup.rules,
            (d) => delete d.setup.players,
            (d) => (d.setup.players = {}),
            (d) => (d.setup.players = null),
            (d) => (d.setup.extra = 1),
            (d) => (d.setup.rules = null),
            (d) => (d.setup.rules = 'x'),
            (d) => (d.setup.players[0] = null),
            (d) => (d.setup.players[0] = 'p1'),
            (d) => delete d.setup.players[0].name,
            (d) => delete d.setup.players[0].role,
            (d) => delete d.setup.players[0].id,
            (d) => (d.setup.players[0].extra = 1),
            (d) => (d.setup.players[0].alive = true)
        ];
        for (const change of bad) rejects(edit(eight(), change), 'INVALID_SETUP');
    });

    it('rejects a setup that createGame would not have built: ids, names, roles, rules', () => {
        const bad = [
            (d) => (d.setup.players[1].id = 'p3'), // wrong id order
            (d) => (d.setup.players[0].id = 'p0'),
            (d) => (d.setup.players[0].id = 1),
            (d) => (d.setup.players[0].name = ' P1 '), // not trimmed
            (d) => (d.setup.players[0].name = ''),
            (d) => (d.setup.players[0].name = 'x'.repeat(25)),
            (d) => (d.setup.players[0].name = 5),
            (d) => (d.setup.players[1].name = 'p1'), // duplicate after case folding
            (d) => (d.setup.players[4].role = 'mafia'), // too many mafia
            (d) => (d.setup.players[0].role = 'citizen'), // too few
            (d) => (d.setup.players[0].role = 'wizard'),
            (d) => (d.setup.players[0].role = null),
            (d) => (d.setup.players[0].role = 'godfather'), // the rule is off
            (d) => (d.setup.rules.godfather = true), // the rule on, but no godfather in the roles
            (d) => (d.setup.rules.doctorSelfSave = 'sometimes'), // invalid value (createGame would default it)
            (d) => (d.setup.rules.extra = 1), // unknown key
            (d) => delete d.setup.rules.revealRoleOnDeath, // not in normal form
            (d) => d.setup.players.splice(3), // 3 players with the 8-player roles
            (d) => (d.setup.players.length = 2)
        ];
        for (const change of bad) rejects(edit(eight(), change), 'INVALID_SETUP');
    });

    it('rejects a godfather game with fewer than 6 players', () => {
        const data = JSON.parse(serializeGame(newGame(3, { roles: ['mafia', 'detective', 'citizen'] })));
        data.setup.rules.godfather = true;
        data.setup.players[0].role = 'godfather';
        rejects(JSON.stringify(data), 'INVALID_SETUP');
    });

    it('rejects fewer than 3 and more than 20 players', () => {
        const data = JSON.parse(serializeGame(newGame(3)));
        data.setup.players.pop();
        rejects(JSON.stringify(data), 'INVALID_SETUP');
        const twentyOne = JSON.parse(serializeGame(newGame(20)));
        twentyOne.setup.players.push({ id: 'p21', name: 'P21', role: 'citizen' });
        rejects(JSON.stringify(twentyOne), 'INVALID_SETUP');
    });
});

describe('deserializeGame: a tampered action is caught by the replay', () => {
    const replayFails = (change, game = midGame()) => rejects(edit(game, (d) => change(d.actions, d)), 'REPLAY_FAILED');

    it('rejects an unknown player as a target', () => {
        replayFails((a) => (a[0].target = 'p99'));
        replayFails((a) => (a[0].target = 5));
        replayFails((a) => delete a[0].target);
    });

    it('rejects a dead player as a target (p5 died in night 1)', () => {
        replayFails((a) => (a[6].target = 'p5'));
    });

    it('rejects actions in the wrong order, repeated, or missing', () => {
        replayFails((a) => ([a[0], a[1]] = [a[1], a[0]]));
        replayFails((a) => a.splice(1, 0, a[0]));
        replayFails((a) => a.splice(0, 1)); // the save now comes first
        replayFails((a) => a.splice(3, 1)); // CONTINUE missing: the vote comes in the morning
        replayFails((a) => a.splice(4, 0, { type: 'CONTINUE' })); // an extra CONTINUE in the day
    });

    it('rejects an action that is not legal in its phase', () => {
        replayFails((a) => (a[3] = { type: 'CAST_VOTES', tally: {} }));
        replayFails((a) => a.push({ type: 'CAST_VOTES', tally: {} }));
        replayFails((a) => a.push({ type: 'MAFIA_KILL', target: 'p1' }));
    });

    it('rejects a self-save the rules do not allow (rules changed after the fact)', () => {
        const text = edit(midGame(), (d) => (d.setup.rules.doctorSelfSave = 'never'));
        rejects(text, 'REPLAY_FAILED');
        // and the once-only rule: a second self-save in a save that says "once"
        const twice = edit(midGame(), (d) => (d.actions[7 + 1] = { type: 'DOCTOR_SAVE', target: 'p3' }));
        rejects(twice, 'REPLAY_FAILED');
    });

    it('rejects an illegal tally', () => {
        replayFails((a) => (a[4].tally = { p5: 1 })); // a dead player
        replayFails((a) => (a[4].tally = { p6: 9 })); // more votes than living players
        replayFails((a) => (a[4].tally = { p6: -1 }));
        replayFails((a) => (a[4].tally = [1]));
        replayFails((a) => (a[4].tally = null));
        replayFails((a) => delete a[4].tally);
    });

    it('rejects actions that are not objects with a known type', () => {
        for (const bad of [null, 5, 'CONTINUE', [], {}, { type: 'NOPE' }, { type: 'constructor' }, { type: 3 }]) replayFails((a) => (a[0] = bad));
    });

    it('rejects an action that is not stored in its normal form (an extra field)', () => {
        replayFails((a) => (a[0].note = 'hello'));
        replayFails((a) => (a[3].extra = true));
    });

    it('rejects anything after the game has ended', () => {
        replayFails((a) => a.push({ type: 'CONTINUE' }), endedGame());
        replayFails((a) => a.push({ type: 'MAFIA_KILL', target: 'p1' }), endedGame());
    });

    it('rejects a legal setup that does not fit the recorded actions', () => {
        // Swapping the detective p4 and the citizen p5 is still a legal setup and every action still replays
        // (p5 checks p1 at night and dies at the end of it).
        const swapped = edit(midGame(), (d) => {
            d.setup.players[3].role = 'citizen';
            d.setup.players[4].role = 'detective';
        });
        assert.equal(deserializeGame(swapped).ok, true);
        // Swapping the doctor p3 and the citizen p5 is a legal setup too, but p5 (now the doctor) dies in night 1,
        // so the doctor's save recorded in round 2 has nobody to act: the replay fails.
        const noDoctor = edit(midGame(), (d) => {
            d.setup.players[2].role = 'citizen';
            d.setup.players[4].role = 'doctor';
        });
        rejects(noDoctor, 'REPLAY_FAILED');
    });

    it('never accepts a save the engine itself could not have produced: every accepted save replays to a game', () => {
        const g = midGame();
        const loaded = deserializeGame(serializeGame(g));
        assert.equal(loaded.ok, true);
        for (let k = 0; k <= g.actions.length; k++) {
            const prefix = { ...g, actions: g.actions.slice(0, k) };
            assert.equal(deserializeGame(serializeGame(prefix)).ok, true, `${k} actions`);
        }
    });
});

describe('deserializeGame: odd input never throws', () => {
    const odd = [
        undefined, null, 0, -0, NaN, Infinity, 1, '', ' ', 'x', 'null', '{}', '[]', '{"version":1}', '{"version":1,"setup":{},"actions":[]}', '{"version":1,"setup":{"players":[],"rules":{}},"actions":[]}',
        '{"__proto__":{"version":1}}', '{"version":1,"__proto__":{"setup":1},"setup":null,"actions":[]}', '{"version":1,"setup":{"players":[{"__proto__":1}],"rules":{}},"actions":[]}',
        '{"version":1,"setup":{"players":[],"rules":{}},"actions":[{"type":"CONTINUE"}]}', '\ud800', '{"a":"\\ud800"}', 'true', '"' + 'x'.repeat(100000) + '"', JSON.stringify({ version: 1, setup: { players: new Array(50).fill({ id: 'p1', name: 'a', role: 'mafia' }), rules: {} }, actions: [] }),
        {}, [], () => 1, Symbol('s'), 1n, new Date(0), new Map(), Object.create(null), { toString() { throw new Error('boom'); } }, { valueOf() { throw new Error('boom'); } }
    ];

    it('returns { ok: false, error } with a stable code for each', () => {
        const known = new Set(Object.values(ERRORS));
        for (const input of odd) {
            let result;
            assert.doesNotThrow(() => (result = deserializeGame(input)));
            assert.equal(result.ok, false);
            assert.ok(known.has(result.error), `${String(result.error)}`);
            assert.deepEqual(Object.keys(result), ['ok', 'error']);
        }
    });

    it('does not pollute Object.prototype with a hostile save', () => {
        deserializeGame('{"__proto__":{"polluted":true},"version":1}');
        deserializeGame('{"version":1,"setup":{"players":[],"rules":{"__proto__":{"polluted":true}}},"actions":[]}');
        assert.equal({}.polluted, undefined);
        assert.equal(Object.prototype.polluted, undefined);
    });

    it('reads a save made by createGame directly, and a hand-made equal one', () => {
        const created = createGame({ names: ['Ali', 'Sara', 'Reza'], roles: ['citizen', 'mafia', 'detective'] }).game;
        const handMade = '{"version":1,"setup":{"players":[{"id":"p1","name":"Ali","role":"citizen"},{"id":"p2","name":"Sara","role":"mafia"},{"id":"p3","name":"Reza","role":"detective"}],"rules":{"doctorSelfSave":"once","godfather":false,"revealRoleOnDeath":true}},"actions":[]}';
        assert.deepStrictEqual(deserializeGame(handMade).game, created);
    });
});
