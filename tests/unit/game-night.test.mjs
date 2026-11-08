/**
 * The night: step order, kill, save, self-save in all three modes, skipped steps, detective results,
 * what the announcement says (and never says), and every error of the three night actions.
 *
 * Layout of `eight()`: p1 p2 mafia, p3 doctor, p4 detective, p5..p8 citizens.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, getState, undo } from '../../js/game/engine.js';
import { CONTINUE, assertRefused, check, deadIds, eight, eightGodfather, kill, newGame, play, save, toNextNight, votes } from './helpers/gameKit.mjs';

const STEP = (step, alive = true, done = false) => ({ step, alive, required: alive, skippable: !alive, done });

describe('the first night', () => {
    it('is a normal night: the mafia team ids are known from the start and every night step is required', () => {
        const s = getState(eight());
        assert.equal(s.phase, 'night');
        assert.equal(s.round, 1);
        assert.equal(s.step, 'mafia');
        assert.deepEqual(s.steps, [STEP('mafia'), STEP('doctor'), STEP('detective')]);
        assert.deepEqual(s.inputs, { mafia: null, doctor: null, detective: null });
        assert.deepEqual(s.mafiaTeamIds, ['p1', 'p2']);
        assert.equal(s.announcement, null);
        assert.equal(s.savedByDoctor, false);
        assert.equal(s.vote, null);
        assert.equal(s.winner, null);
        assert.equal(s.doctorSelfSaveUsed, false);
        assert.ok(s.players.every((p) => p.alive));
        assert.deepEqual(s.players.map((p) => Object.keys(p)), Array(8).fill(['id', 'name', 'role', 'alive']));
    });

    it('lists the godfather in the mafia team ids too', () => {
        assert.deepEqual(getState(eightGodfather()).mafiaTeamIds, ['p1', 'p2']);
    });

    it('has a doctor step only when there is a doctor: 3 players have none', () => {
        const s = getState(newGame(3, { roles: ['mafia', 'detective', 'citizen'] }));
        assert.deepEqual(s.steps, [STEP('mafia'), STEP('doctor', false), STEP('detective')]);
        assert.equal(s.step, 'mafia');
    });
});

describe('the order of the steps', () => {
    it('runs mafia, then doctor, then detective, and resolves when the last one is recorded', () => {
        let g = eight();
        assert.equal(getState(g).step, 'mafia');
        g = play(g, kill('p5'));
        let s = getState(g);
        assert.equal(s.step, 'doctor');
        assert.deepEqual(s.inputs.mafia, { target: 'p5' });
        assert.equal(s.phase, 'night');
        g = play(g, save('p6'));
        s = getState(g);
        assert.equal(s.step, 'detective');
        assert.deepEqual(s.inputs.doctor, { target: 'p6' });
        assert.deepEqual(s.steps.map((x) => x.done), [true, true, false]);
        g = play(g, check('p1'));
        s = getState(g);
        assert.equal(s.phase, 'morning');
        assert.equal(s.step, null);
        assert.deepEqual(s.inputs.detective, { target: 'p1', isMafia: true });
        assert.deepEqual(s.steps.map((x) => x.done), [true, true, true]);
    });

    it('refuses a step out of order: WRONG_STEP', () => {
        const g = eight();
        assertRefused(g, save('p5'), 'WRONG_STEP');
        assertRefused(g, check('p5'), 'WRONG_STEP');
        assertRefused(play(g, kill('p5')), check('p6'), 'WRONG_STEP');
    });

    it('refuses a step that was already recorded: STEP_ALREADY_DONE (corrections go through undo)', () => {
        const afterKill = play(eight(), kill('p5'));
        assertRefused(afterKill, kill('p6'), 'STEP_ALREADY_DONE');
        const afterSave = play(afterKill, save('p6'));
        assertRefused(afterSave, kill('p6'), 'STEP_ALREADY_DONE');
        assertRefused(afterSave, save('p7'), 'STEP_ALREADY_DONE');
        const corrected = play(undo(afterKill).game, kill('p6'));
        assert.deepEqual(getState(corrected).inputs.mafia, { target: 'p6' });
    });

    it('refuses a night action once the night has resolved: WRONG_PHASE', () => {
        const g = play(eight(), kill('p5'), save('p6'), check('p1'));
        for (const a of [kill('p6'), save('p6'), check('p6')]) assertRefused(g, a, 'WRONG_PHASE');
    });

    it('accepts one action per step whatever the number of living mafia: one target per night', () => {
        const g = play(eight(), kill('p5'));
        assertRefused(g, kill('p6'), 'STEP_ALREADY_DONE');
        assert.deepEqual(getState(g).inputs.mafia, { target: 'p5' });
    });
});

describe('the target', () => {
    it('must be a known player: UNKNOWN_PLAYER', () => {
        const badTargets = ['p99', 'p0', 'P1', ' p1', 'p1 ', '', undefined, null, 1, 5, true, {}, [], ['p1'], 'constructor', '__proto__', 'toString'];
        const g = eight();
        for (const target of badTargets) assertRefused(g, { type: 'MAFIA_KILL', target }, 'UNKNOWN_PLAYER');
        assertRefused(g, { type: 'MAFIA_KILL' }, 'UNKNOWN_PLAYER');
        const afterKill = play(g, kill('p5'));
        for (const target of badTargets) assertRefused(afterKill, { type: 'DOCTOR_SAVE', target }, 'UNKNOWN_PLAYER');
        const afterSave = play(afterKill, save('p6'));
        for (const target of badTargets) assertRefused(afterSave, { type: 'DETECTIVE_CHECK', target }, 'UNKNOWN_PLAYER');
    });

    it('must be alive: TARGET_DEAD, for all three actions', () => {
        const night2 = toNextNight(play(eight(), kill('p5'), save('p6'), check('p1')));
        assert.deepEqual(deadIds(getState(night2)), ['p5']);
        assertRefused(night2, kill('p5'), 'TARGET_DEAD');
        const afterKill = play(night2, kill('p6'));
        assertRefused(afterKill, save('p5'), 'TARGET_DEAD');
        const afterSave = play(afterKill, save('p7'));
        assertRefused(afterSave, check('p5'), 'TARGET_DEAD');
    });

    it('may be a mafia member for the kill (the mafia team may kill one of its own)', () => {
        const g = play(eight(), kill('p2'), save('p5'), check('p6'));
        const s = getState(g);
        assert.deepEqual(deadIds(s), ['p2']);
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p2', role: 'mafia' }], nobodyDied: false });
        assert.equal(s.winner, null, '1 mafia against 6 others: the game goes on');
        assert.equal(getState(toNextNight(g)).step, 'mafia', 'one mafia is alive, so the mafia step is still required');
    });

    it('may be the mafia team\'s own killer, a doctor, a detective: any living player', () => {
        for (const target of ['p1', 'p2', 'p3', 'p4', 'p5']) {
            const g = play(eight(), kill(target), save('p8'), check('p5'));
            assert.deepEqual(deadIds(getState(g)), [target]);
        }
    });
});

describe('the kill and the save', () => {
    it('kills the target and announces it, with its role', () => {
        const s = getState(play(eight(), kill('p5'), save('p6'), check('p1')));
        assert.deepEqual(deadIds(s), ['p5']);
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p5', role: 'citizen' }], nobodyDied: false });
        assert.equal(s.savedByDoctor, false);
    });

    it('lets the doctor\'s save cancel the kill on the same player', () => {
        const s = getState(play(eight(), kill('p5'), save('p5'), check('p1')));
        assert.deepEqual(deadIds(s), []);
        assert.deepEqual(s.announcement, { deaths: [], nobodyDied: true });
        assert.equal(s.savedByDoctor, true);
        assert.equal(s.phase, 'morning');
    });

    it('does not let a save of another player cancel the kill', () => {
        for (const saved of ['p1', 'p3', 'p4', 'p6', 'p8']) {
            const s = getState(play(eight(), kill('p5'), save(saved), check('p1')));
            assert.deepEqual(deadIds(s), ['p5'], `saved ${saved}`);
            assert.equal(s.savedByDoctor, false);
            assert.equal(s.announcement.nobodyDied, false);
        }
    });

    it('saves the doctor too when he is the target of the kill and of his own save', () => {
        const s = getState(play(eight(), kill('p3'), save('p3'), check('p1')));
        assert.deepEqual(deadIds(s), []);
        assert.equal(s.savedByDoctor, true);
    });

    it('kills the doctor, and the save he made that night is then moot', () => {
        const s = getState(play(eight(), kill('p3'), save('p5'), check('p1')));
        assert.deepEqual(deadIds(s), ['p3']);
        assert.equal(s.savedByDoctor, false);
    });

    it('resets the night record at the next night', () => {
        const g = toNextNight(play(eight(), kill('p5'), save('p5'), check('p1')));
        const s = getState(g);
        assert.equal(s.round, 2);
        assert.equal(s.savedByDoctor, false);
        assert.deepEqual(s.inputs, { mafia: null, doctor: null, detective: null });
        assert.equal(s.announcement, null);
    });
});

describe('what the announcement says', () => {
    it('has exactly deaths and nobodyDied, whatever happened in the night', () => {
        for (const saved of ['p5', 'p6']) {
            const s = getState(play(eight(), kill('p5'), save(saved), check('p1')));
            assert.deepEqual(Object.keys(s.announcement).sort(), ['deaths', 'nobodyDied']);
        }
    });

    it('never mentions the doctor\'s save: savedByDoctor is a separate moderator-only field', () => {
        const s = getState(play(eight(), kill('p5'), save('p5'), check('p1')));
        assert.equal(s.savedByDoctor, true);
        assert.ok(!JSON.stringify(s.announcement).toLowerCase().includes('sav'));
        assert.ok(!('savedByDoctor' in s.announcement));
        assert.ok(!('saved' in s.announcement));
        assert.equal(JSON.stringify(s.announcement), '{"deaths":[],"nobodyDied":true}');
    });

    it('announces a saved night as the empty one, so the table cannot tell a save from no kill', () => {
        const saved = getState(play(eight(), kill('p5'), save('p5'), check('p1'))).announcement;
        assert.deepEqual(saved, { deaths: [], nobodyDied: true });
    });

    it('with revealRoleOnDeath on (the default) names the role of the dead', () => {
        for (const rules of [undefined, {}, { revealRoleOnDeath: true }]) {
            const s = getState(play(eight(rules), kill('p4'), save('p5'), check('p1')));
            assert.deepEqual(s.announcement.deaths, [{ id: 'p4', role: 'detective' }]);
            assert.deepEqual(Object.keys(s.announcement.deaths[0]), ['id', 'role']);
        }
    });

    it('with revealRoleOnDeath off says only who died', () => {
        const s = getState(play(eight({ revealRoleOnDeath: false }), kill('p4'), save('p5'), check('p1')));
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p4' }], nobodyDied: false });
        assert.ok(!JSON.stringify(s.announcement).includes('detective'));
        // the moderator's players list still has the role
        assert.equal(s.players.find((p) => p.id === 'p4').role, 'detective');
    });

    it('is null during the night, and only the morning has it', () => {
        let g = eight();
        assert.equal(getState(g).announcement, null);
        g = play(g, kill('p5'), save('p6'));
        assert.equal(getState(g).announcement, null);
        g = play(g, check('p1'));
        assert.notEqual(getState(g).announcement, null);
        g = play(g, CONTINUE);
        assert.equal(getState(g).phase, 'day');
        assert.equal(getState(g).announcement, null);
    });
});

describe('the doctor saving himself', () => {
    it('never: refused every time, and it marks nothing', () => {
        const g = play(eight({ doctorSelfSave: 'never' }), kill('p5'));
        assertRefused(g, save('p3'), 'SELF_SAVE_NOT_ALLOWED');
        assert.equal(getState(g).doctorSelfSaveUsed, false);
        assert.equal(getState(g).step, 'doctor');
        assert.equal(getState(play(g, save('p6'))).doctorSelfSaveUsed, false, 'saving another is fine');
        const night2 = toNextNight(play(g, save('p6'), check('p1')));
        assertRefused(play(night2, kill('p6')), save('p3'), 'SELF_SAVE_NOT_ALLOWED');
    });

    it('once (the default): allowed one time, marks doctorSelfSaveUsed, then refused', () => {
        for (const rules of [undefined, { doctorSelfSave: 'once' }]) {
            let g = play(eight(rules), kill('p5'));
            assert.equal(getState(g).doctorSelfSaveUsed, false);
            g = play(g, save('p3'));
            assert.equal(getState(g).doctorSelfSaveUsed, true);
            g = toNextNight(play(g, check('p1')));
            assert.equal(getState(g).doctorSelfSaveUsed, true, 'the mark stays');
            g = play(g, kill('p6'));
            assertRefused(g, save('p3'), 'SELF_SAVE_NOT_ALLOWED');
            assert.equal(getState(play(g, save('p7'))).doctorSelfSaveUsed, true, 'saving another is still fine');
        }
    });

    it('once: a refused or a different save does not use it up', () => {
        const g = toNextNight(play(eight(), kill('p5'), save('p6'), check('p1')));
        assert.equal(getState(g).doctorSelfSaveUsed, false);
        assert.equal(getState(play(g, kill('p6'), save('p3'))).doctorSelfSaveUsed, true, 'still available in round 2');
    });

    it('once: undo frees it again', () => {
        const afterSave = play(eight(), kill('p5'), save('p3'));
        assert.equal(getState(afterSave).doctorSelfSaveUsed, true);
        const freed = undo(afterSave).game;
        assert.equal(getState(freed).doctorSelfSaveUsed, false);
        assert.equal(getState(play(freed, save('p3'))).doctorSelfSaveUsed, true, 'and it can be used again');
        // undone from further away: the mark follows the action, not the night
        let later = toNextNight(play(afterSave, check('p1')));
        assert.equal(getState(later).doctorSelfSaveUsed, true);
        while (getState(later).doctorSelfSaveUsed) later = undo(later).game;
        assert.deepEqual(later.actions.map((a) => a.type), ['MAFIA_KILL'], 'it was freed exactly when the self-save was undone');
    });

    it('once: the self-save counts when it cancels a kill on the doctor, too', () => {
        let g = toNextNight(play(eight(), kill('p3'), save('p3'), check('p1')));
        assert.equal(getState(g).doctorSelfSaveUsed, true);
        g = play(g, kill('p3'));
        assertRefused(g, save('p3'), 'SELF_SAVE_NOT_ALLOWED');
    });

    it('always: allowed every night, and never marked', () => {
        let g = eight({ doctorSelfSave: 'always' });
        for (let round = 1; round <= 4; round++) {
            g = play(g, kill('p3'), save('p3'));
            const s = getState(g);
            assert.equal(s.doctorSelfSaveUsed, false, `round ${round}`);
            g = toNextNight(play(g, check('p1')));
            assert.equal(getState(g).round, round + 1);
        }
        assert.ok(getState(g).players.every((p) => p.alive), 'every self-save cancelled the kill on the doctor');
    });

    it('applies to the doctor only: the detective cannot check himself in any mode', () => {
        for (const doctorSelfSave of ['never', 'once', 'always']) {
            const g = play(eight({ doctorSelfSave }), kill('p5'), save('p6'));
            assertRefused(g, check('p4'), 'CANNOT_CHECK_SELF');
        }
    });
});

describe('a step whose role is all dead', () => {
    const kill1 = (rules) => toNextNight(play(eight(rules), kill('p3'), save('p5'), check('p1'))); // the doctor dies in night 1
    const kill4 = (rules) => toNextNight(play(eight(rules), kill('p4'), save('p5'), check('p1'))); // the detective dies in night 1

    it('lists a dead doctor as alive:false, skippable:true, not required, and does not wait for him', () => {
        const g = kill1();
        const s = getState(g);
        assert.deepEqual(s.steps, [STEP('mafia'), STEP('doctor', false), STEP('detective')]);
        assert.equal(s.step, 'mafia');
        const afterKill = play(g, kill('p5'));
        assert.equal(getState(afterKill).step, 'detective', 'the doctor step is skipped');
        const done = getState(play(afterKill, check('p1')));
        assert.equal(done.phase, 'morning');
        assert.deepEqual(done.players.filter((p) => !p.alive).map((p) => p.id), ['p3', 'p5']);
    });

    it('refuses an action for a dead doctor: WRONG_STEP, both before and after his place in the order', () => {
        const g = kill1();
        assertRefused(g, save('p5'), 'WRONG_STEP');
        assertRefused(play(g, kill('p5')), save('p6'), 'WRONG_STEP');
        assertRefused(play(g, kill('p6')), save('p6'), 'WRONG_STEP');
    });

    it('lists a dead detective the same way, and resolves right after the doctor', () => {
        const g = kill4();
        assert.deepEqual(getState(g).steps, [STEP('mafia'), STEP('doctor'), STEP('detective', false)]);
        assertRefused(g, check('p5'), 'WRONG_STEP');
        const afterKill = play(g, kill('p6'));
        assertRefused(afterKill, check('p1'), 'WRONG_STEP');
        const s = getState(play(afterKill, save('p7')));
        assert.equal(s.phase, 'morning');
        assert.equal(s.inputs.detective, null);
        assert.deepEqual(s.players.filter((p) => !p.alive).map((p) => p.id), ['p4', 'p6']);
        assertRefused(play(afterKill, save('p7')), check('p1'), 'WRONG_PHASE');
    });

    it('needs only the mafia step when both are dead', () => {
        let g = play(eight(), kill('p4'), save('p5'), check('p1'));
        g = play(g, CONTINUE, votes({ p3: 3, p5: 1 }), CONTINUE);
        const s = getState(g);
        assert.equal(s.round, 2);
        assert.deepEqual(s.steps, [STEP('mafia'), STEP('doctor', false), STEP('detective', false)]);
        assert.equal(s.step, 'mafia');
        const done = getState(play(g, kill('p5')));
        assert.equal(done.phase, 'morning');
        assert.deepEqual(done.announcement, { deaths: [{ id: 'p5', role: 'citizen' }], nobodyDied: false });
    });

    it('keeps the mafia step required while any mafia-team member lives, even one of two', () => {
        const g = toNextNight(play(eight(), kill('p1'), save('p5'), check('p2')));
        assert.deepEqual(getState(g).steps[0], STEP('mafia'));
        assert.equal(getState(g).step, 'mafia');
    });

    it('with the godfather the mafia step is required while only he is left', () => {
        // p1 (mafia) dies in night 1; the godfather p2 is alone on the mafia side
        const g = toNextNight(play(eightGodfather(), kill('p1'), save('p5'), check('p2')));
        const s = getState(g);
        assert.deepEqual(s.steps[0], STEP('mafia'));
        assert.equal(s.step, 'mafia');
        assert.equal(s.winner, null);
    });

    it('also holds for a doctor that never existed (3 players): DOCTOR_SAVE is WRONG_STEP', () => {
        const g = newGame(3, { roles: ['mafia', 'detective', 'citizen'] });
        assertRefused(play(g, kill('p3')), save('p3'), 'WRONG_STEP');
        const s = getState(play(g, kill('p3'), check('p1')));
        assert.equal(s.phase, 'morning');
    });
});

describe('the detective', () => {
    const result = (game, target) => getState(play(game, kill('p5'), save('p6'), check(target))).inputs.detective;

    it('reads a mafia as mafia', () => {
        assert.deepEqual(result(eight(), 'p1'), { target: 'p1', isMafia: true });
        assert.deepEqual(result(eight(), 'p2'), { target: 'p2', isMafia: true });
    });

    it('reads the godfather as NOT mafia', () => {
        assert.deepEqual(result(eightGodfather(), 'p2'), { target: 'p2', isMafia: false });
        assert.deepEqual(result(eightGodfather(), 'p1'), { target: 'p1', isMafia: true }, 'the plain mafia of that game still reads true');
    });

    it('reads the doctor, a citizen and the player the mafia just killed as not mafia', () => {
        assert.deepEqual(result(eight(), 'p3'), { target: 'p3', isMafia: false });
        assert.deepEqual(result(eight(), 'p7'), { target: 'p7', isMafia: false });
        assert.deepEqual(result(eight(), 'p5'), { target: 'p5', isMafia: false }, 'checked in the same night the target dies');
    });

    it('cannot check himself: CANNOT_CHECK_SELF', () => {
        assertRefused(play(eight(), kill('p5'), save('p6')), check('p4'), 'CANNOT_CHECK_SELF');
    });

    it('records the result as a boolean, and nothing else', () => {
        const r = result(eight(), 'p1');
        assert.deepEqual(Object.keys(r), ['target', 'isMafia']);
        assert.equal(typeof r.isMafia, 'boolean');
    });
});

describe('invalid input to applyAction', () => {
    it('refuses an action that is not an object with a known type: INVALID_ACTION', () => {
        const g = eight();
        for (const action of [undefined, null, 5, 'MAFIA_KILL', [], [kill('p1')], {}, { type: 'NOPE' }, { type: 'mafia_kill', target: 'p1' }, { type: 5 }, { type: null }, { type: 'constructor' }, { type: '__proto__' }, { type: 'toString' }, { target: 'p1' }]) {
            assertRefused(g, action, 'INVALID_ACTION');
        }
    });

    it('refuses something that is not a game of this engine: INVALID_GAME, and never throws', () => {
        for (const game of [undefined, null, 5, 'x', [], {}, { version: 1 }, { version: 2, setup: { players: [], rules: {} }, actions: [] }, { version: 1, setup: null, actions: [] }, { version: 1, setup: { players: [], rules: {} }, actions: 'x' }]) {
            assert.deepEqual(applyAction(game, kill('p1')), { ok: false, error: 'INVALID_GAME' });
        }
    });

    it('does not change the game it is given', () => {
        const g = eight();
        const before = JSON.stringify(g);
        applyAction(g, kill('p5'));
        applyAction(g, save('p5'));
        assert.equal(JSON.stringify(g), before);
    });

    it('stores the action in its normal form: only type and target, extra fields dropped', () => {
        const g = play(eight(), { type: 'MAFIA_KILL', target: 'p5', note: 'x', isMafia: true });
        assert.deepEqual(g.actions, [{ type: 'MAFIA_KILL', target: 'p5' }]);
    });
});
