/**
 * Fuzz: seeded random playthroughs of whole games, 3 to 20 players, godfather on and off, the three
 * self-save modes. The driver keeps its OWN model of who lives, who is saved and what the night needs, and
 * compares the engine with it after every action. It also throws illegal actions at the engine, which must
 * refuse them with the right code and leave the game untouched.
 *
 * Invariants after every action: the alive sets agree, alive counts add up, the dead stay dead, the phase,
 * step and winner are the ones the model expects, the round never passes n, serialize -> deserialize gives
 * the same game and state, and undo then redo gives the same game. At the end of each game: a rebuild from
 * scratch equals the played game (replay equals state), and undo all the way equals the initial game.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, createGame, getState, undo } from '../../js/game/engine.js';
import { deserializeGame, serializeGame } from '../../js/game/persistence.js';
import { getModeratorView } from '../../js/game/view.js';
import { namesFor, seeded } from './helpers/gameKit.mjs';

const MODES = ['never', 'once', 'always'];
const REPS = 4;
const STEPS = ['mafia', 'doctor', 'detective'];
const ACTION_OF = { mafia: 'MAFIA_KILL', doctor: 'DOCTOR_SAVE', detective: 'DETECTIVE_CHECK' };
const isMafiaTeam = (role) => role === 'mafia' || role === 'godfather';

const stats = {
    playthroughs: 0,
    actions: 0,
    illegal: 0,
    saves: 0,
    selfSaves: 0,
    skippedSteps: 0,
    ties: 0,
    emptyVotes: 0,
    mafiaWins: 0,
    townWins: 0,
    nightEnds: 0,
    voteEnds: 0,
    refusedByCode: {}
};

/** The vote result by the plain rule, written independently of the engine. */
function eliminatedBy(tally) {
    const entries = Object.entries(tally);
    const top = Math.max(0, ...entries.map(([, c]) => c));
    if (top === 0) return { eliminated: null, tie: false };
    const leaders = entries.filter(([, c]) => c === top);
    return leaders.length === 1 ? { eliminated: leaders[0][0], tie: false } : { eliminated: null, tie: true };
}

function winnerBy(model) {
    const mafia = [...model.alive].filter((id) => isMafiaTeam(model.roleOf[id])).length;
    const others = model.alive.size - mafia;
    if (mafia === 0) return 'town';
    if (mafia >= others) return 'mafia';
    return null;
}

function playthrough(n, godfather, mode, seed) {
    const rnd = seeded(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const reveal = rnd() < 0.5;
    const rules = { doctorSelfSave: mode, godfather, revealRoleOnDeath: reveal };
    const created = createGame({ names: namesFor(n), rules, random: rnd });
    assert.equal(created.ok, true, JSON.stringify(created));
    const initial = structuredClone(created.game);
    let game = created.game;

    const roleOf = Object.fromEntries(game.setup.players.map((p) => [p.id, p.role]));
    const ids = game.setup.players.map((p) => p.id);
    const doctorId = ids.find((id) => roleOf[id] === 'doctor') ?? null;
    const detectiveId = ids.find((id) => roleOf[id] === 'detective');
    const model = { roleOf, alive: new Set(ids), selfUsed: false, round: 1, phase: 'night', done: {}, kill: null, saved: null, deathThisRound: false, winner: null };

    const games = [game];
    const states = [getState(game)];
    const aliveList = () => ids.filter((id) => model.alive.has(id));
    const required = (step) => model.alive.size > 0 && aliveList().some((id) => (step === 'mafia' ? isMafiaTeam(roleOf[id]) : roleOf[id] === step));
    const currentStep = () => STEPS.find((s) => required(s) && !model.done[s]) ?? null;
    const selfSaveAllowed = () => !(mode === 'never' || (mode === 'once' && model.selfUsed));

    function expectRefusal(action, code) {
        const before = games.at(-1);
        const snapshot = JSON.stringify(before);
        const result = applyAction(before, action);
        assert.deepEqual(result, { ok: false, error: code }, `seed ${seed}, ${n} players: ${JSON.stringify(action)} in ${model.phase}`);
        assert.equal(JSON.stringify(before), snapshot, 'a refused action must leave the game untouched');
        assert.deepStrictEqual(getState(before), states.at(-1));
        stats.illegal++;
        stats.refusedByCode[code] = (stats.refusedByCode[code] ?? 0) + 1;
    }

    /** One illegal action that must be refused with a known code, chosen for the current phase. */
    function tryIllegal() {
        const dead = ids.filter((id) => !model.alive.has(id));
        const living = aliveList();
        const cases = [[{ type: 'NOPE' }, 'INVALID_ACTION'], [null, 'INVALID_ACTION']];
        const nightActionAt = (step, target) => ({ type: ACTION_OF[step], target });
        if (model.phase === 'night') {
            const step = currentStep();
            cases.push([{ type: 'CONTINUE' }, 'WRONG_PHASE'], [{ type: 'CAST_VOTES', tally: {} }, 'WRONG_PHASE']);
            cases.push([nightActionAt(step, 'p999'), 'UNKNOWN_PLAYER'], [nightActionAt(step, undefined), 'UNKNOWN_PLAYER']);
            if (dead.length > 0) cases.push([nightActionAt(step, pick(dead)), 'TARGET_DEAD']);
            for (const other of STEPS.filter((s) => s !== step)) {
                cases.push([nightActionAt(other, pick(living)), model.done[other] ? 'STEP_ALREADY_DONE' : 'WRONG_STEP']);
            }
            if (step === 'doctor' && !selfSaveAllowed()) cases.push([nightActionAt('doctor', doctorId), 'SELF_SAVE_NOT_ALLOWED']);
            if (step === 'detective') cases.push([nightActionAt('detective', detectiveId), 'CANNOT_CHECK_SELF']);
        } else if (model.phase === 'morning' || model.phase === 'dusk') {
            cases.push([nightActionAt('mafia', pick(living)), 'WRONG_PHASE'], [nightActionAt('doctor', pick(living)), 'WRONG_PHASE'], [{ type: 'CAST_VOTES', tally: {} }, 'WRONG_PHASE']);
        } else if (model.phase === 'day') {
            const first = living[0];
            cases.push([nightActionAt('mafia', pick(living)), 'WRONG_PHASE'], [nightActionAt('detective', pick(living)), 'WRONG_PHASE'], [{ type: 'CONTINUE' }, 'WRONG_PHASE']);
            cases.push([{ type: 'CAST_VOTES', tally: { [first]: living.length + 1 } }, 'INVALID_TALLY']);
            cases.push([{ type: 'CAST_VOTES', tally: { p999: 1 } }, 'INVALID_TALLY'], [{ type: 'CAST_VOTES', tally: { [first]: -1 } }, 'INVALID_TALLY']);
            cases.push([{ type: 'CAST_VOTES', tally: { [first]: 0.5 } }, 'INVALID_TALLY'], [{ type: 'CAST_VOTES', tally: [first] }, 'INVALID_TALLY'], [{ type: 'CAST_VOTES' }, 'INVALID_TALLY']);
            if (dead.length > 0) cases.push([{ type: 'CAST_VOTES', tally: { [pick(dead)]: 1 } }, 'INVALID_TALLY']);
        }
        const [action, code] = pick(cases);
        expectRefusal(action, code);
    }

    function nightAction(step) {
        const living = aliveList();
        let target;
        if (step === 'mafia') {
            target = pick(living);
        } else if (step === 'doctor') {
            const allowed = living.filter((id) => id !== doctorId || selfSaveAllowed());
            target = model.kill !== null && allowed.includes(model.kill) && rnd() < 0.45 ? model.kill : pick(allowed);
        } else {
            target = pick(living.filter((id) => id !== detectiveId));
        }
        return { type: ACTION_OF[step], target };
    }

    function voteTally(forceUnique) {
        const living = aliveList();
        const m = living.length;
        const tally = {};
        const kind = forceUnique ? 'unique' : pick(['unique', 'unique', 'tie', 'random', 'empty', 'zero']);
        if (kind === 'unique') {
            const victim = pick(living);
            const k = 1 + Math.floor(rnd() * m);
            let left = m - k;
            tally[victim] = k;
            for (const id of living.filter((x) => x !== victim)) {
                const c = Math.min(k - 1, Math.floor(rnd() * (left + 1)));
                left -= c;
                if (c > 0 || rnd() < 0.3) tally[id] = c;
            }
        } else if (kind === 'tie' && m >= 2) {
            const first = pick(living);
            const second = pick(living.filter((x) => x !== first));
            const top = 1 + Math.floor(rnd() * Math.floor(m / 2));
            tally[first] = top;
            tally[second] = top;
        } else if (kind === 'random') {
            let left = m;
            for (const id of living) {
                const c = Math.min(left, Math.floor(rnd() * 3));
                left -= c;
                tally[id] = c;
            }
        } else if (kind === 'zero') {
            for (const id of living) tally[id] = 0;
        }
        return { type: 'CAST_VOTES', tally };
    }

    /** Apply the action to the engine and to the model, then compare everything. */
    function step(action) {
        const before = games.at(-1);
        const prev = states.at(-1);
        const result = applyAction(before, action);
        assert.equal(result.ok, true, `seed ${seed}, ${n} players: ${JSON.stringify(action)} refused with ${result.error} in ${model.phase}`);
        const next = result.game;
        const state = getState(next);
        stats.actions++;

        // ---- advance the model
        let expectedDeaths = null;
        if (model.phase === 'night') {
            const s = action.type === 'MAFIA_KILL' ? 'mafia' : action.type === 'DOCTOR_SAVE' ? 'doctor' : 'detective';
            model.done[s] = true;
            if (s === 'mafia') model.kill = action.target;
            if (s === 'doctor') {
                model.saved = action.target;
                if (action.target === doctorId) {
                    stats.selfSaves++;
                    if (mode === 'once') model.selfUsed = true;
                }
            }
            if (s === 'detective') {
                assert.deepEqual(state.inputs.detective, { target: action.target, isMafia: roleOf[action.target] === 'mafia' });
            }
            if (currentStep() === null) {
                const savedIt = model.saved !== null && model.saved === model.kill;
                if (savedIt) stats.saves++;
                expectedDeaths = savedIt ? [] : [model.kill];
                expectedDeaths.forEach((id) => model.alive.delete(id));
                model.deathThisRound = expectedDeaths.length > 0;
                model.winner = winnerBy(model);
                model.phase = 'morning';
                assert.equal(state.savedByDoctor, savedIt);
            }
        } else if (model.phase === 'day') {
            const { eliminated, tie } = eliminatedBy(action.tally);
            if (tie) stats.ties++;
            if (Object.values(action.tally).every((c) => c === 0)) stats.emptyVotes++;
            expectedDeaths = eliminated === null ? [] : [eliminated];
            expectedDeaths.forEach((id) => model.alive.delete(id));
            model.winner = winnerBy(model);
            model.phase = 'dusk';
            assert.deepEqual(state.vote, { tally: state.vote.tally, eliminated, tie });
            for (const [id, c] of Object.entries(action.tally)) assert.equal(state.vote.tally[id], c);
        } else {
            assert.equal(action.type, 'CONTINUE');
            if (model.winner !== null) {
                model.phase = 'ended';
            } else if (model.phase === 'morning') {
                model.phase = 'day';
            } else {
                model.phase = 'night';
                model.round++;
                model.done = {};
                model.kill = null;
                model.saved = null;
                model.deathThisRound = false;
                stats.skippedSteps += STEPS.filter((s) => !required(s)).length;
            }
        }

        // ---- compare the engine with the model
        assert.equal(state.phase, model.phase, `seed ${seed}: phase`);
        assert.equal(state.round, model.round);
        assert.ok(state.round <= n, `seed ${seed}: round ${state.round} passes ${n}`);
        assert.equal(state.step, model.phase === 'night' ? currentStep() : null, `seed ${seed}: step`);
        assert.deepEqual(new Set(state.players.filter((p) => p.alive).map((p) => p.id)), model.alive, `seed ${seed}: who is alive`);
        assert.equal(state.players.filter((p) => p.alive).length, model.alive.size);
        const mafiaAlive = state.players.filter((p) => p.alive && isMafiaTeam(p.role)).length;
        const othersAlive = state.players.filter((p) => p.alive && !isMafiaTeam(p.role)).length;
        assert.equal(mafiaAlive + othersAlive, model.alive.size, 'alive counts add up');
        for (const p of prev.players.filter((q) => !q.alive)) assert.equal(state.players.find((q) => q.id === p.id).alive, false, `${p.id} came back to life`);
        assert.deepEqual(state.players.map((p) => [p.id, p.name, p.role]), prev.players.map((p) => [p.id, p.name, p.role]), 'names and roles never change');
        assert.deepEqual(state.mafiaTeamIds, ids.filter((id) => isMafiaTeam(roleOf[id])));
        assert.equal(state.doctorSelfSaveUsed, mode === 'once' && model.selfUsed);

        // winner agrees with the counts, and is only announced in morning, dusk and ended
        const showsWinner = ['morning', 'dusk', 'ended'].includes(model.phase);
        assert.equal(state.winner, showsWinner ? model.winner : null, `seed ${seed}: winner`);
        assert.equal(state.winner, showsWinner ? (mafiaAlive === 0 ? 'town' : mafiaAlive >= othersAlive ? 'mafia' : null) : null);
        if (!showsWinner) assert.equal(winnerBy(model), null, 'no unannounced win in the night or the day');

        // announcement
        if (expectedDeaths !== null) {
            assert.deepEqual(Object.keys(state.announcement).sort(), ['deaths', 'nobodyDied']);
            assert.deepEqual(
                state.announcement.deaths,
                expectedDeaths.map((id) => (reveal ? { id, role: roleOf[id] } : { id }))
            );
            assert.equal(state.announcement.nobodyDied, expectedDeaths.length === 0);
            assert.ok(!JSON.stringify(state.announcement).includes('saved'));
        }
        assert.equal(['morning', 'dusk', 'ended'].includes(state.phase) ? state.announcement !== null : state.announcement === null, true, `seed ${seed}: announcement presence in ${state.phase}`);

        // the moderator view agrees with the model
        const view = getModeratorView(state);
        if (state.phase === 'night') {
            const current = view.steps.find((x) => x.current);
            const expected =
                current.step === 'mafia' ? aliveList() : current.step === 'doctor' ? aliveList().filter((id) => id !== doctorId || selfSaveAllowed()) : aliveList().filter((id) => id !== detectiveId);
            assert.deepEqual(current.targetIds, expected);
        } else if (state.phase === 'day') {
            assert.deepEqual(view.vote, { candidateIds: aliveList(), maxTotal: model.alive.size });
        }
        assert.equal(view.canContinue, state.phase === 'morning' || state.phase === 'dusk');

        // serialize -> deserialize gives the same game and state
        const loaded = deserializeGame(serializeGame(next));
        assert.equal(loaded.ok, true, `seed ${seed}: ${loaded.error}`);
        assert.deepStrictEqual(loaded.game, next);
        assert.deepStrictEqual(getState(loaded.game), state);

        // undo then redo
        if (rnd() < 0.2) {
            const back = undo(next);
            assert.equal(back.ok, true);
            assert.deepStrictEqual(back.game, before);
            assert.deepStrictEqual(getState(back.game), prev);
            const again = applyAction(back.game, action);
            assert.equal(again.ok, true);
            assert.deepStrictEqual(again.game, next);
        }

        games.push(next);
        states.push(state);
        game = next;
    }

    // ---- play
    let guard = 0;
    while (model.phase !== 'ended') {
        assert.ok(++guard < 1000, `seed ${seed}: the game does not end`);
        if (rnd() < 0.3) tryIllegal();
        if (model.phase === 'night') step(nightAction(currentStep()));
        else if (model.phase === 'day') step(voteTally(!model.deathThisRound));
        else step({ type: 'CONTINUE' });
    }

    // ---- the end
    const final = states.at(-1);
    assert.equal(final.phase, 'ended');
    assert.ok(final.round <= n);
    assert.ok(final.winner === 'mafia' || final.winner === 'town');
    if (final.winner === 'mafia') stats.mafiaWins++;
    else stats.townWins++;
    if (games.at(-2) && getState(games.at(-2)).phase === 'morning') stats.nightEnds++;
    else stats.voteEnds++;

    // only undo works now
    for (const action of [{ type: 'MAFIA_KILL', target: 'p1' }, { type: 'DOCTOR_SAVE', target: 'p1' }, { type: 'DETECTIVE_CHECK', target: 'p1' }, { type: 'CONTINUE' }, { type: 'CAST_VOTES', tally: {} }]) {
        expectRefusal(action, 'GAME_ENDED');
    }

    // replay equals state: a rebuild from nothing, action by action, gives the same game and the same state
    const rebuild = (count) => {
        let g = createGame({ names: game.setup.players.map((p) => p.name), rules: game.setup.rules, roles: game.setup.players.map((p) => p.role) }).game;
        for (const action of game.actions.slice(0, count)) {
            const r = applyAction(g, action);
            assert.equal(r.ok, true);
            g = r.game;
        }
        return g;
    };
    assert.deepStrictEqual(rebuild(game.actions.length), game);
    for (let i = 0; i < 2; i++) {
        const k = Math.floor(rnd() * game.actions.length);
        assert.deepStrictEqual(getState(rebuild(k)), states[k], `seed ${seed}: replay of the first ${k} actions`);
    }

    // undo all equals the initial game
    let g = game;
    for (let k = games.length - 1; k > 0; k--) {
        const r = undo(g);
        assert.equal(r.ok, true);
        g = r.game;
        assert.deepStrictEqual(g, games[k - 1]);
    }
    assert.deepStrictEqual(g, initial);
    assert.deepEqual(undo(g), { ok: false, error: 'NOTHING_TO_UNDO' });
    assert.deepStrictEqual(games[0], initial, 'the first game was never mutated');
    stats.playthroughs++;
}

describe('fuzz: seeded random playthroughs', () => {
    for (let n = 3; n <= 20; n++) {
        it(`${n} players: every option, ${REPS} playthroughs each`, () => {
            for (const godfather of [false, true]) {
                for (const [m, mode] of MODES.entries()) {
                    for (let rep = 0; rep < REPS; rep++) {
                        const seed = 1000003 * n + 10007 * (godfather ? 1 : 0) + 101 * m + rep + 1;
                        if (godfather && n < 6) {
                            assert.deepEqual(createGame({ names: namesFor(n), rules: { godfather, doctorSelfSave: mode }, random: seeded(seed) }), { ok: false, error: 'GODFATHER_NOT_ALLOWED' });
                            continue;
                        }
                        playthrough(n, godfather, mode, seed);
                    }
                }
            }
        });
    }

    it('ran at least 300 playthroughs, and they really reached every kind of event', () => {
        // 3 sizes x 3 modes + 15 sizes x 2 x 3 modes, 4 each
        assert.equal(stats.playthroughs, (9 + 90) * REPS);
        assert.ok(stats.playthroughs >= 300, `${stats.playthroughs} playthroughs`);
        assert.ok(stats.actions > 5000, `${stats.actions} actions`);
        assert.ok(stats.illegal > 800, `${stats.illegal} illegal actions refused`);
        for (const code of ['INVALID_ACTION', 'WRONG_PHASE', 'WRONG_STEP', 'STEP_ALREADY_DONE', 'UNKNOWN_PLAYER', 'TARGET_DEAD', 'SELF_SAVE_NOT_ALLOWED', 'CANNOT_CHECK_SELF', 'INVALID_TALLY', 'GAME_ENDED']) {
            assert.ok((stats.refusedByCode[code] ?? 0) > 0, `${code} was never provoked`);
        }
        assert.ok(stats.saves > 40, `${stats.saves} saved nights`);
        assert.ok(stats.selfSaves > 40, `${stats.selfSaves} self-saves`);
        assert.ok(stats.skippedSteps > 40, `${stats.skippedSteps} skipped steps`);
        assert.ok(stats.ties > 30, `${stats.ties} tied votes`);
        assert.ok(stats.emptyVotes > 30, `${stats.emptyVotes} empty or zero votes`);
        assert.ok(stats.mafiaWins > 60 && stats.townWins > 60, `${stats.mafiaWins} mafia wins, ${stats.townWins} town wins`);
        assert.ok(stats.nightEnds > 20 && stats.voteEnds > 20, `${stats.nightEnds} games ended in the night, ${stats.voteEnds} after a vote`);
    });
});
