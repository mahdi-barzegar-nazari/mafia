/**
 * ui/nightModel.js: the night screen without the DOM. For every combination of living roles and every point of
 * progress through the night, each of the three steps has exactly one status (done, current, waiting, or nobody
 * alive), the current step offers exactly the targets the engine allows, and nothing about a chosen target is
 * in the model at all.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, getState } from '../../js/game/engine.js';
import { STEP_ACTIONS, STEP_STATUS, isOfferedTarget, nightModel, stepStatus } from '../../js/ui/nightModel.js';
import { CONTINUE, check, eight, eightGodfather, kill, newGame, play, save, votes } from './helpers/gameKit.mjs';

const STEPS = ['mafia', 'doctor', 'detective'];

/**
 * A night state made by hand: p1 mafia, p2 doctor, p3 detective, p4 and p5 citizens, with the doctor and the
 * detective alive or not and the first `done` required steps recorded. The shape is the engine's own (docs/game-rules.md).
 */
function syntheticNight({ doctorAlive, detectiveAlive, done }) {
    const players = [
        { id: 'p1', name: 'A', role: 'mafia', alive: true },
        { id: 'p2', name: 'B', role: 'doctor', alive: doctorAlive },
        { id: 'p3', name: 'C', role: 'detective', alive: detectiveAlive },
        { id: 'p4', name: 'D', role: 'citizen', alive: true },
        { id: 'p5', name: 'E', role: 'citizen', alive: true }
    ];
    const aliveBy = { mafia: true, doctor: doctorAlive, detective: detectiveAlive };
    const required = STEPS.filter((step) => aliveBy[step]);
    const steps = STEPS.map((step) => ({ step, alive: aliveBy[step], required: aliveBy[step], skippable: !aliveBy[step], done: required.indexOf(step) !== -1 && required.indexOf(step) < done }));
    return {
        phase: 'night',
        round: 2,
        players,
        rules: { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true },
        mafiaTeamIds: ['p1'],
        step: required[done] ?? null,
        steps,
        inputs: { mafia: null, doctor: null, detective: null },
        announcement: null,
        savedByDoctor: false,
        vote: null,
        winner: null,
        doctorSelfSaveUsed: false
    };
}

/** What each step must be, worked out by hand, not by the code under test. */
function expectedStatuses({ doctorAlive, detectiveAlive, done }) {
    const aliveBy = { mafia: true, doctor: doctorAlive, detective: detectiveAlive };
    const required = STEPS.filter((step) => aliveBy[step]);
    return STEPS.map((step) => {
        if (!aliveBy[step]) return STEP_STATUS.NOBODY;
        const at = required.indexOf(step);
        if (at < done) return STEP_STATUS.DONE;
        return at === done ? STEP_STATUS.CURRENT : STEP_STATUS.WAITING;
    });
}

describe('the status of each step, for every combination of living roles and every point of the night', () => {
    for (const doctorAlive of [true, false]) {
        for (const detectiveAlive of [true, false]) {
            const required = 1 + Number(doctorAlive) + Number(detectiveAlive);
            // `done` counts the required steps already recorded; all of them recorded would be the morning, not a night.
            for (let done = 0; done < required; done++) {
                const label = `doctor ${doctorAlive ? 'alive' : 'dead'}, detective ${detectiveAlive ? 'alive' : 'dead'}, ${done} step(s) done`;
                it(label, () => {
                    const spec = { doctorAlive, detectiveAlive, done };
                    const model = nightModel(syntheticNight(spec));
                    assert.deepEqual(model.items.map((item) => item.step), STEPS, 'always three steps, in this order');
                    assert.deepEqual(model.items.map((item) => item.status), expectedStatuses(spec));
                    assert.equal(model.items.filter((item) => item.status === STEP_STATUS.CURRENT).length, 1, 'exactly one step is current');
                    assert.equal(model.current.step, model.items.find((item) => item.status === STEP_STATUS.CURRENT).step);
                    assert.equal(model.round, 2);
                });
            }
        }
    }

    it('stepStatus puts "nobody alive" before "done" and "current": a skippable step is never anything else', () => {
        assert.equal(stepStatus({ alive: false, required: false, skippable: true, done: false, current: false }), STEP_STATUS.NOBODY);
        assert.equal(stepStatus({ alive: false, required: false, skippable: true, done: true, current: true }), STEP_STATUS.NOBODY);
        assert.equal(stepStatus({ alive: true, required: true, skippable: false, done: true, current: false }), STEP_STATUS.DONE);
        assert.equal(stepStatus({ alive: true, required: true, skippable: false, done: false, current: true }), STEP_STATUS.CURRENT);
        assert.equal(stepStatus({ alive: true, required: true, skippable: false, done: false, current: false }), STEP_STATUS.WAITING);
    });
});

describe('the night of a real game', () => {
    it('a fresh night: the mafia step is current, the other two wait', () => {
        const model = nightModel(getState(eight()));
        assert.deepEqual(model.items, [
            { step: 'mafia', status: 'current' },
            { step: 'doctor', status: 'waiting' },
            { step: 'detective', status: 'waiting' }
        ]);
        assert.equal(model.round, 1);
    });

    it('each recorded step turns to done and the next becomes current, until the night resolves (then it is no night)', () => {
        let game = eight();
        const seen = [];
        for (const action of [kill('p5'), save('p6'), check('p1')]) {
            seen.push(nightModel(getState(game)).items.map((item) => item.status).join());
            game = play(game, action);
        }
        assert.deepEqual(seen, ['current,waiting,waiting', 'done,current,waiting', 'done,done,current']);
        assert.equal(nightModel(getState(game)), null, 'the morning has no night screen');
    });

    it('a game of 3 has no doctor from the start: that step is "nobody alive" and the night is two steps long', () => {
        const model = nightModel(getState(newGame(3)));
        assert.deepEqual(model.items.map((item) => item.status), ['current', 'nobody', 'waiting']);
        const next = nightModel(getState(play(newGame(3), kill('p3'))));
        assert.deepEqual(next.items.map((item) => item.status), ['done', 'nobody', 'current']);
        assert.equal(next.current.step, 'detective');
    });

    it('a doctor killed in the night is "nobody alive" in the next one, a detective too, both together too', () => {
        // night 1: the mafia kill the doctor (p3), the doctor saves somebody else
        const doctorDead = play(eight(), kill('p3'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE);
        assert.deepEqual(nightModel(getState(doctorDead)).items.map((i) => i.status), ['current', 'nobody', 'waiting']);
        // night 1: the detective (p4) is killed
        const detectiveDead = play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE);
        assert.deepEqual(nightModel(getState(detectiveDead)).items.map((i) => i.status), ['current', 'waiting', 'nobody']);
        // both gone: the doctor killed at night, the detective voted out
        const both = play(eight(), kill('p3'), save('p5'), check('p1'), CONTINUE, votes({ p4: 3 }), CONTINUE);
        const model = nightModel(getState(both));
        assert.deepEqual(model.items.map((i) => i.status), ['current', 'nobody', 'nobody']);
        assert.equal(model.round, 2);
    });

    it('after the mafia step, a step nobody is alive for is skipped by the engine: the next living step is the current one', () => {
        const game = play(eight(), kill('p3'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p5'));
        const model = nightModel(getState(game));
        assert.deepEqual(model.items.map((i) => i.status), ['done', 'nobody', 'current']);
        assert.equal(model.current.step, 'detective');
    });

    it('is null for every phase that is not a night, and for nothing at all', () => {
        const morning = play(eight(), kill('p5'), save('p6'), check('p1'));
        assert.equal(nightModel(getState(morning)), null);
        assert.equal(nightModel(getState(play(morning, CONTINUE))), null, 'day');
        assert.equal(nightModel(null), null);
        assert.equal(nightModel(undefined), null);
    });
});

describe('what the current step offers', () => {
    const idsOf = (model) => model.current.targets.map((target) => target.id);

    it('the mafia step offers every living player, a member of its own team included, in player order', () => {
        const model = nightModel(getState(eight()));
        assert.deepEqual(idsOf(model), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
        assert.deepEqual(model.current.targets[0], { id: 'p1', name: 'P1' });
        assert.equal(model.current.action, 'MAFIA_KILL');
    });

    it('the dead are never offered', () => {
        const game = play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE, votes({ p2: 2 }), CONTINUE);
        assert.deepEqual(idsOf(nightModel(getState(game))), ['p1', 'p3', 'p4', 'p6', 'p7', 'p8'].filter((id) => id !== 'p5'));
        assert.ok(!idsOf(nightModel(getState(game))).includes('p5'), 'p5 died in the night and p2 by the vote: neither is offered');
    });

    it('the doctor may pick themselves while the rule allows it, and the note about it stays off', () => {
        const model = nightModel(getState(play(eight(), kill('p5'))));
        assert.equal(model.current.step, 'doctor');
        assert.equal(model.current.action, 'DOCTOR_SAVE');
        assert.ok(idsOf(model).includes('p3'));
        assert.equal(model.current.doctorCannotPickSelf, false);
    });

    it('the doctor\'s own name is missing, and the model says so, when the rule is "never"', () => {
        const model = nightModel(getState(play(eight({ doctorSelfSave: 'never' }), kill('p5'))));
        assert.ok(!idsOf(model).includes('p3'));
        assert.equal(model.current.doctorCannotPickSelf, true);
        assert.equal(idsOf(model).length, 7);
    });

    it('with "once", the doctor\'s name is missing in the nights after the self-save was used', () => {
        const used = play(eight(), kill('p5'), save('p3'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'));
        const model = nightModel(getState(used));
        assert.ok(!idsOf(model).includes('p3'));
        assert.equal(model.current.doctorCannotPickSelf, true);
        // with "always" it never goes missing
        const always = play(eight({ doctorSelfSave: 'always' }), kill('p5'), save('p3'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'));
        assert.ok(idsOf(nightModel(getState(always))).includes('p3'));
    });

    it('the detective\'s own name is never offered', () => {
        const model = nightModel(getState(play(eight(), kill('p5'), save('p6'))));
        assert.equal(model.current.step, 'detective');
        assert.equal(model.current.action, 'DETECTIVE_CHECK');
        assert.ok(!idsOf(model).includes('p4'));
        assert.equal(idsOf(model).length, 7);
    });

    it('every offered target is accepted by the engine for that step, and the one name left out is refused', () => {
        let game = eight({ doctorSelfSave: 'never' });
        for (const step of STEPS) {
            const model = nightModel(getState(game));
            assert.equal(model.current.step, step);
            for (const target of model.current.targets) {
                assert.equal(applyAction(game, { type: STEP_ACTIONS[step], target: target.id }).ok, true, `${step} -> ${target.id}`);
            }
            const state = getState(game);
            for (const player of state.players.filter((p) => !idsOf(model).includes(p.id))) {
                assert.equal(applyAction(game, { type: STEP_ACTIONS[step], target: player.id }).ok, false, `${step} must refuse ${player.id}`);
            }
            game = play(game, { type: STEP_ACTIONS[step], target: model.current.targets[0].id });
        }
    });

    it('withGodfather is true only while a godfather is alive', () => {
        assert.equal(nightModel(getState(eightGodfather())).current.withGodfather, true);
        assert.equal(nightModel(getState(eight())).current.withGodfather, false);
        // the godfather (p2) is voted out by day 1
        const gone = play(eightGodfather(), kill('p5'), save('p6'), check('p1'), CONTINUE, votes({ p2: 3 }), CONTINUE);
        assert.equal(nightModel(getState(gone)).current.withGodfather, false);
    });

    it('isOfferedTarget accepts only an id of the current step and tolerates anything', () => {
        const model = nightModel(getState(eight()));
        assert.equal(isOfferedTarget(model, 'p3'), true);
        for (const bad of ['p99', '', null, undefined, 3, {}, ['p3'], 'constructor']) assert.equal(isOfferedTarget(model, bad), false, String(bad));
        assert.equal(isOfferedTarget(null, 'p3'), false);
    });
});

describe('the model holds nothing about a chosen target', () => {
    it('after a step is recorded the model has no trace of who was chosen: only the status "done"', () => {
        const game = play(eight(), kill('p7'));
        const model = nightModel(getState(game));
        const text = JSON.stringify(model.items);
        assert.ok(!text.includes('p7'));
        assert.deepEqual(model.items[0], { step: 'mafia', status: 'done' });
        assert.deepEqual(Object.keys(model).sort(), ['current', 'items', 'round']);
    });
});
