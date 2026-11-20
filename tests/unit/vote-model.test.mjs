/**
 * ui/voteModel.js: the vote stepper without the DOM. A count is a whole number from 0 up; the total can never be
 * more than the number of living players; a plus with nothing left, a minus at zero and a stranger are refused;
 * the tally that closes the vote holds only the non-zero counts of the living, and the engine accepts it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, getState } from '../../js/game/engine.js';
import { nightModel } from '../../js/ui/nightModel.js';
import { clampCounts, remainingVotes, stepCount, tallyOf, totalVotes, voteModel } from '../../js/ui/voteModel.js';
import { CONTINUE, check, eight, kill, newGame, play, save, votes } from './helpers/gameKit.mjs';

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('stepCount', () => {
    it('a plus adds one vote to that player and nobody else', () => {
        assert.deepEqual(stepCount({}, 'p2', 1, IDS, 5), { p2: 1 });
        assert.deepEqual(stepCount({ p2: 1 }, 'p2', 1, IDS, 5), { p2: 2 });
        assert.deepEqual(stepCount({ p2: 1 }, 'p4', 1, IDS, 5), { p2: 1, p4: 1 });
    });

    it('a minus takes one back, and a count that reaches zero leaves the object (only non-zero counts are kept)', () => {
        assert.deepEqual(stepCount({ p2: 2 }, 'p2', -1, IDS, 5), { p2: 1 });
        assert.deepEqual(stepCount({ p2: 1 }, 'p2', -1, IDS, 5), {});
    });

    it('a minus at zero changes nothing: a count never goes below 0', () => {
        assert.deepEqual(stepCount({}, 'p2', -1, IDS, 5), {});
        assert.deepEqual(stepCount({ p1: 1 }, 'p2', -1, IDS, 5), { p1: 1 });
    });

    it('a plus with no vote left changes nothing: the total never goes above the number of living players', () => {
        let counts = {};
        for (let i = 0; i < 20; i++) counts = stepCount(counts, IDS[i % IDS.length], 1, IDS, 5);
        assert.equal(totalVotes(counts), 5);
        assert.deepEqual(stepCount(counts, 'p1', 1, IDS, 5), counts);
        assert.equal(remainingVotes(counts, 5), 0);
        // one player alone can take all of them, and no more
        let alone = {};
        for (let i = 0; i < 9; i++) alone = stepCount(alone, 'p3', 1, IDS, 5);
        assert.deepEqual(alone, { p3: 5 });
    });

    it('a minus gives the vote back, so a plus works again', () => {
        const full = { p1: 3, p2: 2 };
        assert.deepEqual(stepCount(full, 'p3', 1, IDS, 5), full);
        const room = stepCount(full, 'p1', -1, IDS, 5);
        assert.deepEqual(stepCount(room, 'p3', 1, IDS, 5), { p1: 2, p2: 2, p3: 1 });
    });

    it('a player who is not a candidate (dead, unknown, not a string) and a step that is not +1 or -1 change nothing', () => {
        const counts = { p1: 1 };
        for (const id of ['p9', '', null, undefined, 3, {}, 'constructor', '__proto__']) assert.deepEqual(stepCount(counts, id, 1, IDS, 5), counts, String(id));
        for (const delta of [0, 2, -2, 0.5, NaN, '1', null, undefined, Infinity]) assert.deepEqual(stepCount(counts, 'p2', delta, IDS, 5), counts, String(delta));
    });

    it('never changes the object it was given', () => {
        const counts = Object.freeze({ p1: 1 });
        assert.doesNotThrow(() => stepCount(counts, 'p1', 1, IDS, 5));
        assert.deepEqual(counts, { p1: 1 });
    });

    it('a table of one living player: one vote at most', () => {
        assert.deepEqual(stepCount({}, 'p1', 1, ['p1'], 1), { p1: 1 });
        assert.deepEqual(stepCount({ p1: 1 }, 'p1', 1, ['p1'], 1), { p1: 1 });
    });
});

describe('clampCounts', () => {
    it('keeps a legal object as it is (a copy)', () => {
        const counts = { p1: 2, p3: 1 };
        const clean = clampCounts(counts, IDS, 5);
        assert.deepEqual(clean, counts);
        assert.notEqual(clean, counts);
    });

    it('drops strangers, zeros, negatives, fractions, text and the like', () => {
        assert.deepEqual(clampCounts({ p9: 2, p1: 0, p2: -1, p3: 1.5, p4: '2', p5: NaN }, IDS, 5), {});
        assert.deepEqual(clampCounts({ p1: 1, p2: null, p3: undefined, p4: {}, p5: [1] }, IDS, 5), { p1: 1 });
    });

    it('takes the surplus from the end of the list when the total is too big', () => {
        assert.deepEqual(clampCounts({ p1: 4, p2: 4 }, IDS, 5), { p1: 4, p2: 1 });
        assert.deepEqual(clampCounts({ p1: 9 }, IDS, 5), { p1: 5 });
        assert.deepEqual(clampCounts({ p1: 1, p5: 9 }, IDS, 3), { p1: 1, p5: 2 });
        assert.equal(totalVotes(clampCounts({ p1: 9, p2: 9, p3: 9 }, IDS, 5)), 5);
    });

    it('survives anything that is not an object', () => {
        for (const bad of [null, undefined, 'text', 7, true]) assert.deepEqual(clampCounts(bad, IDS, 5), {}, String(bad));
        assert.deepEqual(clampCounts([1, 2], IDS, 5), {});
    });

    it('a maximum of zero leaves nothing', () => {
        assert.deepEqual(clampCounts({ p1: 1 }, IDS, 0), {});
    });
});

describe('totals', () => {
    it('totalVotes adds the counts, remainingVotes subtracts them from the maximum and stops at zero', () => {
        assert.equal(totalVotes({}), 0);
        assert.equal(totalVotes({ p1: 2, p2: 3 }), 5);
        assert.equal(remainingVotes({}, 5), 5);
        assert.equal(remainingVotes({ p1: 2 }, 5), 3);
        assert.equal(remainingVotes({ p1: 9 }, 5), 0);
    });

    it('tallyOf is what CAST_VOTES carries: only the non-zero counts of the candidates', () => {
        assert.deepEqual(tallyOf({ p1: 2, p9: 3, p2: 0 }, IDS, 5), { p1: 2 });
        assert.deepEqual(tallyOf({}, IDS, 5), {});
    });
});

describe('voteModel on a real day', () => {
    const day = () => getState(play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE));
    const dayAfterDeath = () => getState(play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE, votes({ p2: 2 }), CONTINUE, kill('p6'), save('p7'), check('p1'), CONTINUE));

    it('has a row for every living player, in player order, with zero votes, and the maximum is the number of the living', () => {
        const model = voteModel(day(), {});
        assert.deepEqual(model.rows.map((row) => row.id), ['p1', 'p2', 'p3', 'p4', 'p6', 'p7', 'p8']);
        assert.equal(model.max, model.rows.length);
        assert.equal(model.used, 0);
        assert.equal(model.remaining, model.max);
        assert.ok(model.rows.every((row) => row.count === 0 && row.canMinus === false && row.canPlus === true));
        assert.deepEqual(model.rows[0], { id: 'p1', name: 'P1', count: 0, canMinus: false, canPlus: true });
    });

    it('the dead are not rows, and the maximum falls with them', () => {
        const before = voteModel(day(), {});
        const after = voteModel(dayAfterDeath(), {});
        assert.ok(after.max < before.max);
        assert.equal(after.rows.length, after.max);
        assert.ok(!after.rows.some((row) => row.id === 'p2'), 'p2 was voted out');
    });

    it('shows the counts, the votes used and left, and lets a minus work only where there is a vote', () => {
        const model = voteModel(day(), { p1: 2, p3: 1 });
        assert.equal(model.used, 3);
        assert.equal(model.remaining, model.max - 3);
        const byId = Object.fromEntries(model.rows.map((row) => [row.id, row]));
        assert.equal(byId.p1.count, 2);
        assert.equal(byId.p1.canMinus, true);
        assert.equal(byId.p2.canMinus, false);
    });

    it('when no vote is left every plus is off and every count with a vote keeps its minus', () => {
        const state = day();
        const max = voteModel(state, {}).max;
        const model = voteModel(state, { p1: max });
        assert.equal(model.remaining, 0);
        assert.ok(model.rows.every((row) => row.canPlus === false));
        assert.equal(model.rows[0].canMinus, true);
    });

    it('a damaged counts object is brought to a legal one before it is drawn (the total is never above the maximum)', () => {
        const state = day();
        const model = voteModel(state, { p1: 99, p2: 99, nobody: 4 });
        assert.equal(model.used, model.max);
        assert.ok(model.rows.reduce((sum, row) => sum + row.count, 0) <= model.max);
    });

    it('reset: an empty counts object gives the all-zero model again', () => {
        const state = day();
        const model = voteModel(state, {});
        assert.deepEqual(voteModel(state, { p1: 3 }).rows.map((r) => r.count).some((c) => c > 0), true);
        assert.equal(model.used, 0);
    });

    it('is null outside the day', () => {
        assert.equal(voteModel(getState(eight()), {}), null, 'night');
        assert.equal(voteModel(getState(play(eight(), kill('p5'), save('p6'), check('p1'))), {}), null, 'morning');
        assert.equal(voteModel(null, {}), null);
    });
});

describe('the tally the stepper builds is always one the engine accepts', () => {
    it('whatever sequence of presses, CAST_VOTES takes the tally of the final counts', () => {
        const game = play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE);
        const state = getState(game);
        const ids = state.players.filter((p) => p.alive).map((p) => p.id);
        let seed = 7;
        const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
        let counts = {};
        for (let press = 0; press < 400; press++) {
            counts = stepCount(counts, ids[Math.floor(random() * ids.length)], random() < 0.65 ? 1 : -1, ids, ids.length);
            assert.ok(totalVotes(counts) <= ids.length, 'never above the living');
            assert.ok(Object.values(counts).every((n) => Number.isInteger(n) && n > 0));
            if (press % 25 === 0) assert.equal(applyAction(game, { type: 'CAST_VOTES', tally: tallyOf(counts, ids, ids.length) }).ok, true, `press ${press}`);
        }
    });

    it('the empty tally is allowed: nobody is eliminated', () => {
        const game = play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE);
        const result = applyAction(game, { type: 'CAST_VOTES', tally: tallyOf({}, ['p1'], 8) });
        assert.equal(result.ok, true);
        assert.equal(getState(result.game).phase, 'dusk');
        assert.equal(getState(result.game).vote.eliminated, null);
    });

    it('a 20-player game: the maximum is the number of the living, and the engine takes the full tally on one player', () => {
        let game = newGame(20);
        for (const action of ['MAFIA_KILL', 'DOCTOR_SAVE', 'DETECTIVE_CHECK']) {
            const state = getState(game);
            const offered = nightModel(state).current.targets.map((target) => target.id);
            const citizen = state.players.filter((p) => p.role === 'citizen').map((p) => p.id);
            game = play(game, { type: action, target: action === 'MAFIA_KILL' ? citizen.at(-1) : action === 'DOCTOR_SAVE' ? citizen[0] : offered[0] });
        }
        game = play(game, CONTINUE);
        const state = getState(game);
        const model = voteModel(state, {});
        assert.equal(state.phase, 'day');
        assert.equal(model.max, 19);
        assert.equal(model.rows.length, 19);
        const ids = model.rows.map((row) => row.id);
        let counts = {};
        for (let i = 0; i < 40; i++) counts = stepCount(counts, ids[3], 1, ids, ids.length);
        assert.deepEqual(counts, { [ids[3]]: 19 });
        const closed = applyAction(game, { type: 'CAST_VOTES', tally: tallyOf(counts, ids, ids.length) });
        assert.equal(closed.ok, true);
        assert.equal(getState(closed.game).vote.eliminated, ids[3]);
    });
});
