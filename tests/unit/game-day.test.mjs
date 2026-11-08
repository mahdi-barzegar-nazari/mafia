/**
 * The day: CONTINUE between phases, and the vote (majority, ties, empty and zero tallies, every invalid tally).
 *
 * After night 1 of `eight()` (kill p5, save p6, check p1) seven players live: p1 p2 mafia, p3 doctor,
 * p4 detective, p6 p7 p8 citizens.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAction, getState } from '../../js/game/engine.js';
import { CONTINUE, assertRefused, check, deadIds, eight, kill, play, save, toNextNight, votes } from './helpers/gameKit.mjs';

const morning = (rules) => play(eight(rules), kill('p5'), save('p6'), check('p1'));
const day = (rules) => play(morning(rules), CONTINUE);

describe('CONTINUE and the order of the phases', () => {
    it('goes night, morning, day, dusk, night, and counts the round only when a new night begins', () => {
        let g = eight();
        const seen = [];
        const note = () => seen.push(`${getState(g).phase}${getState(g).round}`);
        note();
        g = play(g, kill('p5'), save('p6'), check('p1'));
        note();
        g = play(g, CONTINUE);
        note();
        g = play(g, votes({ p6: 2 }));
        note();
        g = play(g, CONTINUE);
        note();
        assert.deepEqual(seen, ['night1', 'morning1', 'day1', 'dusk1', 'night2']);
    });

    it('is refused in the night and in the day: WRONG_PHASE', () => {
        assertRefused(eight(), CONTINUE, 'WRONG_PHASE');
        assertRefused(play(eight(), kill('p5')), CONTINUE, 'WRONG_PHASE');
        assertRefused(day(), CONTINUE, 'WRONG_PHASE');
    });

    it('is accepted in the morning and at dusk, and carries nothing else', () => {
        assert.deepEqual(play(morning(), CONTINUE).actions.at(-1), { type: 'CONTINUE' });
        const dusk = play(day(), votes({}));
        assert.equal(getState(dusk).phase, 'dusk');
        assert.deepEqual(play(dusk, CONTINUE).actions.at(-1), { type: 'CONTINUE' });
        assert.deepEqual(play(morning(), { type: 'CONTINUE', extra: 1 }).actions.at(-1), { type: 'CONTINUE' });
    });

    it('starts the next night fresh: new inputs, steps by who lives, no announcement, no vote', () => {
        const g = play(day(), votes({ p7: 3, p8: 1 }), CONTINUE);
        const s = getState(g);
        assert.equal(s.phase, 'night');
        assert.equal(s.round, 2);
        assert.equal(s.step, 'mafia');
        assert.deepEqual(s.inputs, { mafia: null, doctor: null, detective: null });
        assert.equal(s.announcement, null);
        assert.equal(s.vote, null);
        assert.deepEqual(deadIds(s), ['p5', 'p7']);
        assert.ok(s.steps.every((x) => x.done === false));
    });

    it('can go on for many rounds with nobody dying: a stalemate is possible, and there is no round limit', () => {
        let g = eight({ doctorSelfSave: 'always' });
        for (let round = 1; round <= 30; round++) {
            g = play(g, kill('p3'), save('p3'), check('p1'));
            g = play(g, CONTINUE, votes({ p6: 1, p7: 1 }), CONTINUE);
            assert.equal(getState(g).round, round + 1);
        }
        const s = getState(g);
        assert.equal(s.phase, 'night');
        assert.equal(s.winner, null);
        assert.ok(s.players.every((p) => p.alive));
    });
});

describe('the vote: who is eliminated', () => {
    it('eliminates the player with the unique top count', () => {
        const s = getState(play(day(), votes({ p6: 3, p7: 1 })));
        assert.equal(s.phase, 'dusk');
        assert.deepEqual(s.vote, { tally: { p6: 3, p7: 1 }, eliminated: 'p6', tie: false });
        assert.deepEqual(deadIds(s), ['p5', 'p6']);
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p6', role: 'citizen' }], nobodyDied: false });
    });

    it('works when the top player is not first in the list, and for a single vote', () => {
        assert.equal(getState(play(day(), votes({ p6: 1, p7: 2, p8: 1 }))).vote.eliminated, 'p7');
        assert.equal(getState(play(day(), votes({ p8: 1 }))).vote.eliminated, 'p8');
        assert.equal(getState(play(day(), votes({ p1: 4, p2: 3 }))).vote.eliminated, 'p1');
    });

    it('reveals the role of an eliminated mafia (and of anyone) when revealRoleOnDeath is on', () => {
        const s = getState(play(day(), votes({ p2: 2, p3: 1 })));
        assert.deepEqual(s.announcement.deaths, [{ id: 'p2', role: 'mafia' }]);
    });

    it('says only who was eliminated when revealRoleOnDeath is off', () => {
        const s = getState(play(day({ revealRoleOnDeath: false }), votes({ p2: 2, p3: 1 })));
        assert.deepEqual(s.announcement, { deaths: [{ id: 'p2' }], nobodyDied: false });
        assert.ok(!JSON.stringify(s.announcement).includes('mafia'));
    });

    it('eliminates nobody on a tie for the top: tie is true and nobodyDied is true', () => {
        for (const tally of [{ p6: 2, p7: 2 }, { p6: 1, p7: 1 }, { p6: 2, p7: 2, p8: 1 }, { p6: 1, p7: 1, p8: 1 }, { p1: 3, p8: 3 }]) {
            const s = getState(play(day(), votes(tally)));
            assert.equal(s.phase, 'dusk', JSON.stringify(tally));
            assert.deepEqual(s.vote, { tally, eliminated: null, tie: true });
            assert.deepEqual(s.announcement, { deaths: [], nobodyDied: true });
            assert.deepEqual(deadIds(s), ['p5']);
        }
    });

    it('eliminates nobody for an empty tally or all zeros, and that is not a tie', () => {
        for (const tally of [{}, { p6: 0 }, { p6: 0, p7: 0, p8: 0 }]) {
            const s = getState(play(day(), votes(tally)));
            assert.equal(s.phase, 'dusk');
            assert.deepEqual(s.vote, { tally, eliminated: null, tie: false }, JSON.stringify(tally));
            assert.deepEqual(s.announcement, { deaths: [], nobodyDied: true });
            assert.deepEqual(deadIds(s), ['p5']);
        }
    });

    it('does not count a tie among lower counts: only the top matters', () => {
        const s = getState(play(day(), votes({ p6: 3, p7: 1, p8: 1 })));
        assert.deepEqual(s.vote, { tally: { p6: 3, p7: 1, p8: 1 }, eliminated: 'p6', tie: false });
    });

    it('accepts a total equal to the number of living players, and no more', () => {
        // seven live: a total of 7 is legal, 8 is not
        assert.equal(getState(play(day(), votes({ p6: 4, p7: 3 }))).vote.eliminated, 'p6');
        assertRefused(day(), votes({ p6: 4, p7: 4 }), 'INVALID_TALLY');
        assertRefused(day(), votes({ p6: 8 }), 'INVALID_TALLY');
    });

    it('counts the living at the moment of the vote, not at the start', () => {
        // round 2: six live, so a total of 7 is too many
        const d2 = play(toNextNight(morning()), kill('p6'), save('p7'), check('p1'), CONTINUE);
        assert.equal(getState(d2).phase, 'day');
        assert.equal(getState(d2).players.filter((p) => p.alive).length, 6);
        assertRefused(d2, votes({ p7: 4, p8: 3 }), 'INVALID_TALLY');
        assert.equal(getState(play(d2, votes({ p7: 4, p8: 2 }))).vote.eliminated, 'p7');
    });
});

describe('the vote: invalid tallies are INVALID_TALLY and change nothing', () => {
    const bad = (tally, label) => it(`refuses ${label}`, () => assertRefused(day(), { type: 'CAST_VOTES', tally }, 'INVALID_TALLY'));

    bad(undefined, 'a missing tally');
    bad(null, 'null');
    bad('p6', 'a string');
    bad(3, 'a number');
    bad(true, 'a boolean');
    bad([], 'an empty array');
    bad([['p6', 1]], 'an array of pairs');
    bad([1, 2], 'an array of counts');
    bad({ p5: 1 }, 'a player who is dead');
    bad({ p6: 1, p5: 1 }, 'a dead player among living ones');
    bad({ p99: 1 }, 'an unknown player');
    bad({ P6: 1 }, 'an id in the wrong case');
    bad({ '': 1 }, 'an empty key');
    bad({ constructor: 1 }, 'a key that is a property of every object');
    bad(JSON.parse('{"__proto__": 1}'), 'an own key named __proto__');
    bad({ p6: -1 }, 'a negative count');
    bad({ p6: 1.5 }, 'a fractional count');
    bad({ p6: NaN }, 'NaN');
    bad({ p6: Infinity }, 'Infinity');
    bad({ p6: '2' }, 'a count written as a string');
    bad({ p6: null }, 'a null count');
    bad({ p6: undefined }, 'an undefined count');
    bad({ p6: true }, 'a boolean count');
    bad({ p6: [1] }, 'an array as a count');
    bad({ p6: { n: 1 } }, 'an object as a count');
    bad({ p6: 1e21 }, 'a huge count');
    bad({ p6: 4, p7: 4 }, 'a total above the number of living players');
    bad({ p6: 1, p7: 1, p8: 1, p1: 1, p2: 1, p3: 1, p4: 1, p5: 0 }, 'a dead player even with a zero count');
    bad(Object.create({ p6: 1 }), 'an object whose votes are inherited (not a plain object)');
    bad(new Map([['p6', 1]]), 'a Map');

    it('refuses a bad tally with the game exactly as it was, and the right vote still works after', () => {
        const g = day();
        assertRefused(g, votes({ p6: -1 }), 'INVALID_TALLY');
        assert.equal(getState(play(g, votes({ p6: 1 }))).vote.eliminated, 'p6');
    });
});

describe('the vote: when it may happen', () => {
    it('is refused outside the day: WRONG_PHASE', () => {
        assertRefused(eight(), votes({}), 'WRONG_PHASE');
        assertRefused(morning(), votes({ p6: 1 }), 'WRONG_PHASE');
        assertRefused(play(day(), votes({ p6: 1 })), votes({ p7: 1 }), 'WRONG_PHASE');
    });

    it('is checked for the phase before the tally', () => {
        assertRefused(morning(), votes('nonsense'), 'WRONG_PHASE');
    });

    it('keeps the tally in player order with plain zeros, as stored', () => {
        const g = play(day(), { type: 'CAST_VOTES', tally: { p8: 1, p6: 2, p7: -0 }, junk: 1 });
        const stored = g.actions.at(-1);
        assert.deepEqual(stored, { type: 'CAST_VOTES', tally: { p6: 2, p7: 0, p8: 1 } });
        assert.deepEqual(Object.keys(stored.tally), ['p6', 'p7', 'p8']);
        assert.ok(Object.is(stored.tally.p7, 0), 'negative zero is stored as 0');
    });

    it('does not keep a reference to the tally it was given', () => {
        const tally = { p6: 2, p7: 1 };
        const g = play(day(), votes(tally));
        tally.p6 = 99;
        assert.deepEqual(g.actions.at(-1).tally, { p6: 2, p7: 1 });
    });

    it('leaves the night\'s record in place for the moderator through day and dusk', () => {
        const s = getState(play(day(), votes({ p6: 1 })));
        assert.deepEqual(s.inputs.detective, { target: 'p1', isMafia: true });
        assert.deepEqual(s.inputs.mafia, { target: 'p5' });
    });
});

describe('the dead stay out', () => {
    it('cannot be targeted at night after a vote elimination either', () => {
        const night2 = play(day(), votes({ p6: 2 }), CONTINUE);
        assertRefused(night2, kill('p6'), 'TARGET_DEAD');
        assertRefused(play(night2, kill('p7')), save('p6'), 'TARGET_DEAD');
    });

    it('cannot receive votes on the next day', () => {
        const day2 = play(day(), votes({ p6: 2 }), CONTINUE, kill('p7'), save('p8'), check('p1'), CONTINUE);
        assertRefused(day2, votes({ p6: 1 }), 'INVALID_TALLY');
        assertRefused(day2, votes({ p7: 1 }), 'INVALID_TALLY');
        assert.ok(applyAction(day2, votes({ p8: 1 })).ok);
    });
});
