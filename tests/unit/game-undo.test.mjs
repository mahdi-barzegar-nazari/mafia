/**
 * Undo: after every action of scripted games it restores exactly the earlier game and state; undo all the way
 * equals a fresh game; the inputs are deep-frozen to prove nothing is mutated.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, getState, undo } from '../../js/game/engine.js';
import { CONTINUE, assertRefused, check, deepFreeze, eight, eightGodfather, kill, play, save, votes } from './helpers/gameKit.mjs';

/** Eight players, 15 actions, three rounds, ends with a mafia win decided at night, then CONTINUE. */
const SCRIPT_MAFIA_WIN = [
    kill('p5'), save('p3'), check('p1'), CONTINUE, votes({ p6: 2, p7: 1 }), CONTINUE, // round 1: the doctor saves himself (once)
    kill('p3'), save('p7'), check('p2'), CONTINUE, votes({ p7: 1, p8: 1 }), CONTINUE, // round 2: the doctor dies, the vote ties
    kill('p4'), check('p1'), CONTINUE // round 3: the night kill makes it 2 against 2
];
const startMafiaWin = () => eight();

/** Eight players with the godfather, no reveal, doctor 'always': 3 rounds, ends with a town win after a vote. */
const SCRIPT_TOWN_WIN = [
    kill('p3'), save('p3'), check('p2'), CONTINUE, votes({ p1: 3, p6: 1 }), CONTINUE, // nobody dies at night; the plain mafia is voted out
    kill('p6'), save('p5'), check('p2'), CONTINUE, votes({ p5: 1, p7: 1, p8: 1 }), CONTINUE, // p6 dies; a three-way tie
    kill('p5'), save('p5'), check('p7'), CONTINUE, votes({ p2: 2, p7: 1 }), CONTINUE // saved again; the godfather is voted out
];
const startTownWin = () => eightGodfather({ doctorSelfSave: 'always', revealRoleOnDeath: false });

const SCRIPTS = [
    ['a mafia win decided in the night', startMafiaWin, SCRIPT_MAFIA_WIN, 'mafia'],
    ['a town win after a vote, with the godfather', startTownWin, SCRIPT_TOWN_WIN, 'town']
];

/** Every game along the script: games[0] is the fresh game, games[k] is after k actions. */
function along(start, script) {
    const games = [start()];
    for (const action of script) games.push(play(games.at(-1), action));
    return games;
}

describe('the scripted games are what they say', () => {
    for (const [name, start, script, winner] of SCRIPTS) {
        it(`${name}: ${script.length} actions, ending in 'ended' with the winner ${winner}`, () => {
            const games = along(start, script);
            const s = getState(games.at(-1));
            assert.equal(s.phase, 'ended');
            assert.equal(s.winner, winner);
            assert.equal(s.round, 3);
            const phases = new Set(games.map((g) => getState(g).phase));
            assert.deepEqual([...phases].sort(), ['day', 'dusk', 'ended', 'morning', 'night'], 'every phase is visited');
        });
    }
});

describe('undo after every action', () => {
    for (const [name, start, script] of SCRIPTS) {
        it(`${name}: restores a game and a state deep-equal to the ones before`, () => {
            const games = along(start, script);
            const states = games.map((g) => getState(g));
            for (let k = 1; k < games.length; k++) {
                const result = undo(games[k]);
                assert.equal(result.ok, true, `undo after action ${k}`);
                assert.deepStrictEqual(result.game, games[k - 1], `game after undoing action ${k} (${JSON.stringify(script[k - 1])})`);
                assert.deepStrictEqual(getState(result.game), states[k - 1], `state after undoing action ${k}`);
            }
        });

        it(`${name}: undo all the way equals a fresh game, and then there is nothing to undo`, () => {
            const fresh = start();
            let g = along(start, script).at(-1);
            let steps = 0;
            for (let r = undo(g); r.ok; r = undo(g)) {
                g = r.game;
                steps++;
            }
            assert.equal(steps, script.length);
            assert.deepStrictEqual(g, fresh);
            assert.deepStrictEqual(getState(g), getState(fresh));
            assert.deepEqual(undo(g), { ok: false, error: 'NOTHING_TO_UNDO' });
        });

        it(`${name}: replaying what was undone gives the same game back`, () => {
            const games = along(start, script);
            for (const k of [1, 4, 7, 10, script.length - 1]) {
                const back = undo(games[k]).game;
                assert.deepStrictEqual(play(back, script[k - 1]), games[k]);
            }
        });
    }

    it('says NOTHING_TO_UNDO for a game with no actions', () => {
        assert.deepEqual(undo(eight()), { ok: false, error: 'NOTHING_TO_UNDO' });
    });

    it('removes exactly one action, never two', () => {
        const games = along(startMafiaWin, SCRIPT_MAFIA_WIN);
        for (let k = 1; k < games.length; k++) assert.equal(undo(games[k]).game.actions.length, k - 1);
    });

    it('removes only valid actions: a refused action leaves nothing to undo', () => {
        const g = play(eight(), kill('p5'));
        assertRefused(g, kill('p6'), 'STEP_ALREADY_DONE');
        const back = undo(g).game;
        assert.deepEqual(back.actions, []);
        assert.deepEqual(undo(back), { ok: false, error: 'NOTHING_TO_UNDO' });
    });

    it('works in every phase, the ended one included', () => {
        const games = along(startTownWin, SCRIPT_TOWN_WIN);
        const phases = new Set();
        for (let k = 1; k < games.length; k++) {
            phases.add(getState(games[k]).phase);
            assert.equal(undo(games[k]).ok, true);
        }
        assert.deepEqual([...phases].sort(), ['day', 'dusk', 'ended', 'morning', 'night']);
    });

    it('lets the game continue differently after an undo (the old branch is gone)', () => {
        const g = play(eight(), kill('p5'), save('p6'));
        const other = play(undo(undo(g).game).game, kill('p7'));
        assert.deepEqual(getState(other).inputs.mafia, { target: 'p7' });
        assert.equal(other.actions.length, 1);
        assert.equal(g.actions.length, 2, 'the first game is untouched');
    });

    it('refuses something that is not a game: INVALID_GAME', () => {
        for (const game of [undefined, null, 5, 'x', [], {}, { version: 1 }, { version: 2, setup: { players: [], rules: {} }, actions: [] }]) {
            assert.deepEqual(undo(game), { ok: false, error: 'INVALID_GAME' });
        }
    });
});

describe('nothing is mutated, and nothing is shared', () => {
    for (const [name, start, script] of SCRIPTS) {
        it(`${name}: the whole script runs on deep-frozen games and actions, and undo too`, () => {
            let g = deepFreeze(start());
            const games = [g];
            for (const action of script) {
                const r = applyAction(g, deepFreeze(structuredClone(action)));
                assert.equal(r.ok, true, JSON.stringify(action));
                g = deepFreeze(r.game);
                games.push(g);
                assert.doesNotThrow(() => getState(g));
            }
            for (let k = games.length - 1; k > 0; k--) assert.deepStrictEqual(undo(games[k]).game, games[k - 1]);
        });
    }

    it('applyAction returns a new game that shares no object with the old one', () => {
        const before = play(eight(), kill('p5'));
        const snapshot = structuredClone(before);
        const after = applyAction(before, save('p6')).game;
        assert.notEqual(after, before);
        assert.notEqual(after.setup, before.setup);
        assert.notEqual(after.setup.players, before.setup.players);
        assert.notEqual(after.setup.players[0], before.setup.players[0]);
        assert.notEqual(after.setup.rules, before.setup.rules);
        assert.notEqual(after.actions, before.actions);
        assert.notEqual(after.actions[0], before.actions[0]);
        after.setup.players[0].name = 'changed';
        after.setup.rules.godfather = true;
        after.actions[0].target = 'p9';
        assert.deepStrictEqual(before, snapshot, 'writing into the new game does not reach the old one');
    });

    it('undo returns a new game that shares no object with the old one', () => {
        const before = play(eight(), kill('p5'), save('p6'));
        const snapshot = structuredClone(before);
        const after = undo(before).game;
        assert.notEqual(after.setup, before.setup);
        assert.notEqual(after.actions, before.actions);
        assert.notEqual(after.actions[0], before.actions[0]);
        after.actions[0].target = 'p9';
        after.setup.players[1].role = 'citizen';
        assert.deepStrictEqual(before, snapshot);
    });

    it('getState returns a fresh object each time: changing it changes nothing', () => {
        const g = play(eight(), kill('p5'));
        const a = getState(g);
        a.players[0].alive = false;
        a.inputs.mafia.target = 'p9';
        a.rules.godfather = true;
        a.steps[0].done = false;
        assert.deepStrictEqual(getState(g), getState(play(eight(), kill('p5'))));
    });

    it('a refused action returns only { ok: false, error }', () => {
        const result = applyAction(eight(), save('p5'));
        assert.deepEqual(Object.keys(result), ['ok', 'error']);
        assert.equal(result.ok, false);
    });
});
