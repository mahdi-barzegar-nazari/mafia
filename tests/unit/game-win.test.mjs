/**
 * Winning: the boundary of the counts, the order of the two checks, when the game ends (after the night or
 * after the vote), and that only undo works afterwards.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getState, undo, winnerFromCounts } from '../../js/game/engine.js';
import { CONTINUE, assertRefused, check, deadIds, eightGodfather, kill, newGame, play, save, votes } from './helpers/gameKit.mjs';

// n = 4: p1 mafia, p2 doctor, p3 detective, p4 citizen
const four = () => newGame(4, { roles: ['mafia', 'doctor', 'detective', 'citizen'] });
// n = 3: p1 mafia, p2 detective, p3 citizen
const three = () => newGame(3, { roles: ['mafia', 'detective', 'citizen'] });
// n = 6 (two mafia): p1 p2 mafia, p3 doctor, p4 detective, p5 p6 citizens
const six = () => newGame(6);
// n = 7 (two mafia): p1 p2 mafia, p3 doctor, p4 detective, p5 p6 p7 citizens
const seven = () => newGame(7);
const godfatherSix = () => newGame(6, { rules: { godfather: true }, roles: ['mafia', 'godfather', 'doctor', 'detective', 'citizen', 'citizen'] });

describe('winnerFromCounts: the rule on its own', () => {
    it('gives the town the win when no mafia-team member is alive', () => {
        for (const others of [0, 1, 2, 5, 14]) assert.equal(winnerFromCounts(0, others), 'town', `0 mafia, ${others} others`);
    });

    it('gives the mafia the win when it is at least as many as the others: equal counts included', () => {
        for (const [mafia, others] of [[1, 1], [2, 2], [5, 5], [6, 6], [2, 1], [3, 2], [1, 0], [6, 5]]) {
            assert.equal(winnerFromCounts(mafia, others), 'mafia', `${mafia} against ${others}`);
        }
    });

    it('lets the game go on when the mafia is outnumbered, even by one', () => {
        for (const [mafia, others] of [[1, 2], [2, 3], [5, 6], [6, 7], [1, 14], [3, 4]]) {
            assert.equal(winnerFromCounts(mafia, others), null, `${mafia} against ${others}`);
        }
    });

    it('checks the town first: with nobody left at all the town wins, not the mafia', () => {
        assert.equal(winnerFromCounts(0, 0), 'town');
    });
});

describe('the boundary in a real game', () => {
    it('mafia equal to the others: the mafia wins (4 players: 1 against 1 after the vote)', () => {
        let g = play(four(), kill('p4'), save('p2'), check('p1'));
        assert.equal(getState(g).winner, null, 'one mafia against two others: it goes on');
        g = play(g, CONTINUE, votes({ p2: 2, p3: 1 }));
        const s = getState(g);
        assert.deepEqual(deadIds(s), ['p2', 'p4']);
        assert.equal(s.winner, 'mafia');
        assert.equal(s.phase, 'dusk', 'the vote is announced first; CONTINUE ends the game');
    });

    it('mafia one fewer than the others: the game goes on (7 players: 2 against 3 after the vote)', () => {
        const g = play(seven(), kill('p5'), save('p6'), check('p1'), CONTINUE, votes({ p6: 2 }));
        const s = getState(g);
        assert.equal(s.players.filter((p) => p.alive && ['mafia', 'godfather'].includes(p.role)).length, 2);
        assert.equal(s.players.filter((p) => p.alive && !['mafia', 'godfather'].includes(p.role)).length, 3);
        assert.equal(s.winner, null);
        assert.equal(getState(play(g, CONTINUE)).phase, 'night');
    });

    it('mafia equal to the others with a bigger team: 6 players, 2 against 2', () => {
        const g = play(six(), kill('p5'), save('p4'), check('p1'), CONTINUE, votes({ p6: 2, p4: 1 }));
        const s = getState(g);
        assert.deepEqual(deadIds(s), ['p5', 'p6']);
        assert.equal(s.winner, 'mafia');
    });

    it('more than the others wins as well: a night kill that leaves 1 mafia against 1 other (3 players)', () => {
        const s = getState(play(three(), kill('p3'), check('p1')));
        assert.equal(s.winner, 'mafia');
        assert.equal(s.players.filter((p) => p.alive).length, 2);
    });

    it('the winner is null all the way until the condition is met', () => {
        let g = six();
        assert.equal(getState(g).winner, null);
        g = play(g, kill('p5'));
        assert.equal(getState(g).winner, null);
        g = play(g, save('p3'), check('p1'));
        assert.equal(getState(g).winner, null, '2 mafia against 3 others');
        g = play(g, CONTINUE);
        assert.equal(getState(g).winner, null);
    });
});

describe('the town wins', () => {
    it('when the last mafia is voted out (4 players, nobody died in the night)', () => {
        let g = play(four(), kill('p4'), save('p4'), check('p1'), CONTINUE);
        g = play(g, votes({ p1: 2, p2: 1 }));
        const s = getState(g);
        assert.equal(s.winner, 'town');
        assert.equal(s.phase, 'dusk');
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p1', role: 'mafia' }], nobodyDied: false });
        assert.deepEqual(s.vote, { tally: { p1: 2, p2: 1 }, eliminated: 'p1', tie: false });
    });

    it('only when the LAST member of the team is out: the first of two mafia does not end the game', () => {
        let g = play(six(), kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p1: 3 }));
        assert.equal(getState(g).winner, null);
        g = play(g, CONTINUE, kill('p6'), save('p6'), check('p2'), CONTINUE, votes({ p2: 2 }));
        const s = getState(g);
        assert.equal(s.winner, 'town');
        assert.deepEqual(deadIds(s), ['p1', 'p2']);
        assert.equal(s.round, 2);
    });

    it('when the mafia kills its own last member at night: decided in the morning', () => {
        const g = play(three(), kill('p1'), check('p3'));
        const s = getState(g);
        assert.equal(s.phase, 'morning');
        assert.equal(s.winner, 'town');
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p1', role: 'mafia' }], nobodyDied: false });
    });

    it('does not end the game when the mafia kills one of two of its own', () => {
        const s = getState(play(six(), kill('p1'), save('p5'), check('p6')));
        assert.equal(s.winner, null);
    });
});

describe('the godfather counts as mafia', () => {
    it('on the mafia side of the count: godfather + mafia against 2 others is a mafia win', () => {
        const g = play(godfatherSix(), kill('p5'), save('p6'), check('p2'), CONTINUE, votes({ p6: 2 }));
        const s = getState(g);
        assert.equal(s.winner, 'mafia', '2 on the mafia team (one of them the godfather) against 2 others');
    });

    it('against the town: while the godfather lives the town has not won, even with every plain mafia dead', () => {
        const g = play(godfatherSix(), kill('p5'), save('p6'), check('p2'), CONTINUE, votes({ p1: 3, p6: 1 }));
        const s = getState(g);
        assert.deepEqual(deadIds(s), ['p1', 'p5']);
        assert.equal(s.winner, null);
        const done = play(g, CONTINUE, kill('p6'), save('p6'), check('p2'), CONTINUE, votes({ p2: 3, p4: 1 }));
        assert.equal(getState(done).winner, 'town', 'and when he is voted out too, the town wins');
    });

    it('with the full godfather game: the detective reads him as innocent while he still counts against the town', () => {
        const g = play(eightGodfather(), kill('p5'), save('p6'), check('p2'));
        assert.deepEqual(getState(g).inputs.detective, { target: 'p2', isMafia: false });
        assert.deepEqual(getState(g).mafiaTeamIds, ['p1', 'p2']);
    });
});

describe('a night that decides the game', () => {
    it('shows the morning with the winner set, and CONTINUE then ends the game (there is no day)', () => {
        const g = play(three(), kill('p3'), check('p1'));
        let s = getState(g);
        assert.equal(s.phase, 'morning');
        assert.equal(s.winner, 'mafia');
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p3', role: 'citizen' }], nobodyDied: false });
        const ended = play(g, CONTINUE);
        s = getState(ended);
        assert.equal(s.phase, 'ended');
        assert.equal(s.winner, 'mafia');
        assert.equal(s.round, 1);
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p3', role: 'citizen' }], nobodyDied: false }, 'the last announcement is kept');
    });

    it('allows nothing but CONTINUE in that morning', () => {
        const g = play(three(), kill('p3'), check('p1'));
        assertRefused(g, votes({}), 'WRONG_PHASE');
        assertRefused(g, kill('p1'), 'WRONG_PHASE');
    });

    it('does the same in a bigger game: 7 players, the second night\'s kill makes it 2 against 2', () => {
        // night 1 kills p5, the vote removes the doctor p3: p1 p2 against p4 p6 p7 (2 against 3, it goes on)
        const day2 = play(seven(), kill('p5'), save('p3'), check('p1'), CONTINUE, votes({ p3: 2 }), CONTINUE);
        assert.equal(getState(day2).winner, null);
        // night 2: kill p6 -> p1 p2 against p4 p7 (2 against 2): the night decides it
        const night = play(day2, kill('p6'), check('p1'));
        const s = getState(night);
        assert.equal(s.phase, 'morning');
        assert.equal(s.winner, 'mafia');
        assert.equal(getState(play(night, CONTINUE)).phase, 'ended');
    });
});

describe('after the game has ended', () => {
    const ended = () => play(four(), kill('p4'), save('p2'), check('p1'), CONTINUE, votes({ p2: 2, p3: 1 }), CONTINUE);

    it('is in the phase ended with the winner and the last vote kept', () => {
        const s = getState(ended());
        assert.equal(s.phase, 'ended');
        assert.equal(s.winner, 'mafia');
        assert.equal(s.step, null);
        assert.deepEqual(s.vote, { tally: { p2: 2, p3: 1 }, eliminated: 'p2', tie: false });
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p2', role: 'doctor' }], nobodyDied: false });
    });

    it('refuses every action with GAME_ENDED', () => {
        const g = ended();
        for (const action of [kill('p1'), save('p1'), check('p1'), CONTINUE, votes({}), votes({ p1: 1 }), { type: 'MAFIA_KILL' }]) {
            assertRefused(g, action, 'GAME_ENDED');
        }
    });

    it('still says INVALID_ACTION for something that is not an action at all', () => {
        assertRefused(ended(), { type: 'NOPE' }, 'INVALID_ACTION');
        assertRefused(ended(), null, 'INVALID_ACTION');
    });

    it('lets undo work, step by step, back to the start', () => {
        let g = ended();
        const phases = [];
        while (g.actions.length > 0) {
            g = undo(g).game;
            phases.push(getState(g).phase);
        }
        // CONTINUE (ended -> dusk), votes (-> day), CONTINUE, check, save, kill (each still night)
        assert.deepEqual(phases, ['dusk', 'day', 'morning', 'night', 'night', 'night']);
        assert.equal(getState(g).winner, null);
        assert.equal(getState(g).step, 'mafia');
    });

    it('can be taken back and played differently: undo the ending, then vote another player', () => {
        let g = undo(undo(ended()).game).game; // back to the day
        assert.equal(getState(g).phase, 'day');
        assert.equal(getState(g).winner, null);
        g = play(g, votes({ p1: 2, p2: 1 }));
        const s = getState(g);
        assert.equal(s.winner, 'town');
        assert.equal(getState(play(g, CONTINUE)).phase, 'ended');
    });

    it('lets undo take back the very action that decided the game, in the morning', () => {
        const g = play(three(), kill('p3'), check('p1'));
        assert.equal(getState(g).winner, 'mafia');
        const back = undo(g).game;
        assert.equal(getState(back).winner, null);
        assert.equal(getState(back).phase, 'night');
        assert.equal(getState(back).step, 'detective');
    });
});
