/**
 * getModeratorView: who may be targeted at each night step, who may receive votes, and whether CONTINUE is legal.
 * Layout of `eight()`: p1 p2 mafia, p3 doctor, p4 detective, p5..p8 citizens.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getState } from '../../js/game/engine.js';
import { getModeratorView } from '../../js/game/view.js';
import { CONTINUE, check, eight, eightGodfather, kill, newGame, play, save, toNextNight, votes } from './helpers/gameKit.mjs';

const view = (game) => getModeratorView(getState(game));
const ALL = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const without = (list, ...ids) => list.filter((id) => !ids.includes(id));

describe('the night view', () => {
    it('lists the three steps, with who wakes for each and who they may choose', () => {
        const v = view(eight());
        assert.equal(v.phase, 'night');
        assert.equal(v.round, 1);
        assert.equal(v.step, 'mafia');
        assert.equal(v.vote, null);
        assert.equal(v.canContinue, false);
        assert.deepEqual(
            v.steps.map((s) => [s.step, s.current, s.done, s.actorIds]),
            [['mafia', true, false, ['p1', 'p2']], ['doctor', false, false, ['p3']], ['detective', false, false, ['p4']]]
        );
        assert.deepEqual(v.steps[0].targetIds, ALL, 'the mafia may choose anyone alive, a mafia member too');
        assert.deepEqual(v.steps[1].targetIds, ALL, 'the doctor may choose anyone, himself included (once, still unused)');
        assert.deepEqual(v.steps[2].targetIds, without(ALL, 'p4'), 'the detective may choose anyone but himself');
    });

    it('moves the current flag along with the step, and marks the done ones', () => {
        const v = view(play(eight(), kill('p5')));
        assert.equal(v.step, 'doctor');
        assert.deepEqual(v.steps.map((s) => [s.current, s.done]), [[false, true], [true, false], [false, false]]);
    });

    it('includes the godfather among the mafia step\'s actors', () => {
        assert.deepEqual(view(eightGodfather()).steps[0].actorIds, ['p1', 'p2']);
    });

    it('takes the doctor himself out of his targets when self-save is never allowed', () => {
        assert.deepEqual(view(eight({ doctorSelfSave: 'never' })).steps[1].targetIds, without(ALL, 'p3'));
    });

    it('takes the doctor out of his targets after his once-only self-save, and keeps him for "always"', () => {
        const used = (mode) => toNextNight(play(eight({ doctorSelfSave: mode }), kill('p5'), save('p3'), check('p1')));
        assert.deepEqual(view(used('once')).steps[1].targetIds, without(ALL, 'p3', 'p5'));
        assert.deepEqual(view(used('always')).steps[1].targetIds, without(ALL, 'p5'));
        const unused = toNextNight(play(eight(), kill('p5'), save('p6'), check('p1')));
        assert.deepEqual(view(unused).steps[1].targetIds, without(ALL, 'p5'));
    });

    it('offers only the living, after a death', () => {
        const night2 = toNextNight(play(eight(), kill('p5'), save('p6'), check('p1')));
        const v = view(night2);
        for (const s of v.steps) assert.ok(!s.targetIds.includes('p5'), s.step);
        assert.deepEqual(v.steps[2].targetIds, without(ALL, 'p4', 'p5'));
    });

    it('shows a step with nobody alive as skippable, accepting no target', () => {
        const night2 = toNextNight(play(eight(), kill('p3'), save('p5'), check('p1')));
        const v = view(night2);
        const doctor = v.steps[1];
        assert.deepEqual(
            { alive: doctor.alive, required: doctor.required, skippable: doctor.skippable, actorIds: doctor.actorIds, targetIds: doctor.targetIds },
            { alive: false, required: false, skippable: true, actorIds: [], targetIds: [] }
        );
        assert.equal(v.steps[0].skippable, false);
        assert.equal(play(night2, kill('p5')) && view(play(night2, kill('p5'))).step, 'detective', 'the current step skips the dead doctor');
    });

    it('has no doctor at all in a 3-player game', () => {
        const v = view(newGame(3, { roles: ['mafia', 'detective', 'citizen'] }));
        assert.deepEqual(v.steps[1], { step: 'doctor', alive: false, required: false, skippable: true, done: false, current: false, actorIds: [], targetIds: [] });
    });
});

describe('the other phases', () => {
    const morning = play(eight(), kill('p5'), save('p6'), check('p1'));

    it('has no steps in the morning, and CONTINUE is legal', () => {
        const v = view(morning);
        assert.equal(v.phase, 'morning');
        assert.equal(v.step, null);
        assert.deepEqual(v.steps, []);
        assert.equal(v.vote, null);
        assert.equal(v.canContinue, true);
    });

    it('offers the living players and the number of votes in the day, and no CONTINUE', () => {
        const v = view(play(morning, CONTINUE));
        assert.equal(v.phase, 'day');
        assert.deepEqual(v.vote, { candidateIds: without(ALL, 'p5'), maxTotal: 7 });
        assert.equal(v.canContinue, false);
        assert.deepEqual(v.steps, []);
    });

    it('allows CONTINUE at dusk, with no vote left to cast', () => {
        const v = view(play(morning, CONTINUE, votes({ p6: 2 })));
        assert.equal(v.phase, 'dusk');
        assert.equal(v.vote, null);
        assert.equal(v.canContinue, true);
    });

    it('has nothing to offer once the game has ended', () => {
        const ended = play(newGame(3, { roles: ['mafia', 'detective', 'citizen'] }), kill('p3'), check('p1'), CONTINUE);
        assert.deepEqual(view(ended), { phase: 'ended', round: 1, step: null, steps: [], vote: null, canContinue: false });
    });

    it('is only ids, flags and numbers: the only words in it are phase names, step names and player ids', () => {
        const allowed = new Set(['night', 'morning', 'day', 'dusk', 'ended', 'mafia', 'doctor', 'detective']);
        const words = [];
        const walk = (value, key) => {
            assert.ok(!['role', 'roles', 'name', 'savedByDoctor', 'isMafia'].includes(key), `no key ${key}`);
            if (typeof value === 'string') words.push(value);
            else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
        };
        for (const game of [eight(), play(eight(), kill('p5'), save('p6'), check('p1')), play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE)]) {
            walk(view(game), '');
        }
        assert.ok(words.length > 10);
        for (const word of words) assert.ok(allowed.has(word) || /^p\d+$/.test(word), word);
    });

    it('returns null for no state', () => {
        assert.equal(getModeratorView(null), null);
        assert.equal(getModeratorView(undefined), null);
        assert.equal(getModeratorView(getState({})), null);
    });
});
