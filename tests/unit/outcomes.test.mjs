/**
 * ui/outcomes.js and ui/outcomeTexts.js: what the morning, the dusk and the end of the game say, for every outcome
 * the engine can produce, in both languages. The rule that matters most: a dead player's role is in the text only
 * when the engine put it in the announcement (the rule "reveal the role of eliminated players"), never otherwise.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { getState } from '../../js/game/engine.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { CONTINUE, check, eight, eightGodfather, kill, play, save, votes } from './helpers/gameKit.mjs';

const env = installFakeEnv();
const { setLang, isolate } = await import('../../js/i18n/index.js');
const { duskOutcome, moderatorNotes, morningOutcome, playerRows, winnerOutcome } = await import('../../js/ui/outcomes.js');
const { duskText, morningText, noteText, winnerText } = await import('../../js/ui/outcomeTexts.js');
const { roleName } = await import('../../js/ui/roleTexts.js');
after(() => env.uninstall());
afterEach(() => setLang('fa'));

const CATALOGS = { fa, en };
/** A catalog template with its placeholders filled, the way t() does it (the name isolated, as the screens do). */
const fill = (lang, key, params = {}) => CATALOGS[lang][key].replace(/\{(\w+)\}/g, (_, name) => params[name]);

const NIGHT_1 = [kill('p5'), save('p6'), check('p1')]; // p5 dies, p6 is saved wrongly
const SAVED = [kill('p5'), save('p5'), check('p1')]; // the doctor saves the target: nobody dies

describe('morningOutcome', () => {
    it('a death: the name, and the role only when the rules announce it', () => {
        const withRole = morningOutcome(getState(play(eight(), ...NIGHT_1)));
        assert.deepEqual(withRole, { kind: 'death', id: 'p5', name: 'P5', role: 'citizen' });
        const secret = morningOutcome(getState(play(eight({ revealRoleOnDeath: false }), ...NIGHT_1)));
        assert.deepEqual(secret, { kind: 'death', id: 'p5', name: 'P5', role: null });
    });

    it('the role of the dead comes only from the announcement: with the rule off nothing leaves the engine\'s hiding', () => {
        const state = getState(play(eight({ revealRoleOnDeath: false }), kill('p1'), save('p5'), check('p2')));
        assert.equal(state.announcement.deaths[0].role, undefined);
        assert.equal(morningOutcome(state).role, null);
        assert.ok(!JSON.stringify(morningOutcome(state)).includes('mafia'));
    });

    it('a killed mafia member is announced as what they were, when the rules say so', () => {
        const outcome = morningOutcome(getState(play(eight(), kill('p1'), save('p5'), check('p2'))));
        assert.equal(outcome.role, 'mafia');
    });

    it('the doctor\'s save: "nobody died", the same outcome as a night without a death', () => {
        assert.deepEqual(morningOutcome(getState(play(eight(), ...SAVED))), { kind: 'nobody' });
    });

    it('is null outside the morning', () => {
        assert.equal(morningOutcome(getState(eight())), null);
        assert.equal(morningOutcome(getState(play(eight(), ...NIGHT_1, CONTINUE))), null);
        assert.equal(morningOutcome(null), null);
    });
});

describe('duskOutcome', () => {
    const day = (rules) => play(eight(rules), ...NIGHT_1, CONTINUE);

    it('an elimination: the name, and the role only when announced', () => {
        const shown = duskOutcome(getState(play(day(), votes({ p2: 3, p1: 1 }))));
        assert.deepEqual(shown, { kind: 'eliminated', id: 'p2', name: 'P2', role: 'mafia' });
        const secret = duskOutcome(getState(play(day({ revealRoleOnDeath: false }), votes({ p2: 3, p1: 1 }))));
        assert.deepEqual(secret, { kind: 'eliminated', id: 'p2', name: 'P2', role: null });
    });

    it('a tie is a tie, never an elimination', () => {
        for (const tally of [{ p1: 2, p2: 2 }, { p1: 1, p2: 1, p3: 1 }, { p1: 3, p7: 3 }]) {
            assert.deepEqual(duskOutcome(getState(play(day(), votes(tally)))), { kind: 'tie' }, JSON.stringify(tally));
        }
    });

    it('no votes at all: nobody is eliminated, and it is not a tie', () => {
        assert.deepEqual(duskOutcome(getState(play(day(), votes({})))), { kind: 'none' });
    });

    it('is null outside the dusk', () => {
        assert.equal(duskOutcome(getState(day())), null);
        assert.equal(duskOutcome(getState(eight())), null);
        assert.equal(duskOutcome(null), null);
    });
});

describe('winnerOutcome', () => {
    const townWon = () => {
        const dayOne = play(eight(), ...SAVED, CONTINUE);
        return play(dayOne, votes({ p1: 3 }), CONTINUE, kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p2: 3 }));
    };
    const mafiaWon = () => {
        let game = eight();
        for (const target of ['p5', 'p6', 'p7']) game = play(game, kill(target), save('p4'), check('p1'), CONTINUE, votes({}), CONTINUE);
        return play(game, kill('p8'), save('p4'), check('p1'));
    };

    it('"town" when the last mafia member is voted out: known at the dusk by the engine, announced only on the end screen', () => {
        const dusk = townWon();
        assert.equal(getState(dusk).phase, 'dusk');
        assert.equal(getState(dusk).winner, 'town');
        assert.equal(winnerOutcome(getState(dusk)), null, 'the dusk does not announce the winner');
        assert.equal(winnerOutcome(getState(play(dusk, CONTINUE))), 'town');
    });

    it('"mafia" when the mafia reach the town in number: known in the morning, announced only on the end screen', () => {
        const morning = mafiaWon();
        assert.equal(getState(morning).phase, 'morning');
        assert.equal(getState(morning).winner, 'mafia');
        assert.equal(winnerOutcome(getState(morning)), null, 'the morning does not announce the winner');
        assert.equal(winnerOutcome(getState(play(morning, CONTINUE))), 'mafia');
    });

    it('is null while the game goes on, and for nothing at all', () => {
        assert.equal(winnerOutcome(getState(eight())), null);
        assert.equal(winnerOutcome(getState(play(eight(), ...NIGHT_1))), null);
        assert.equal(winnerOutcome(null), null);
    });
});

describe('moderatorNotes', () => {
    it('the detective\'s finding: a mafia member reads "mafia", a citizen "not mafia"', () => {
        const mafia = moderatorNotes(getState(play(eight(), kill('p5'), save('p6'), check('p2'))));
        assert.deepEqual(mafia, [{ kind: 'check', id: 'p2', name: 'P2', isMafia: true }]);
        const citizen = moderatorNotes(getState(play(eight(), kill('p5'), save('p6'), check('p7'))));
        assert.deepEqual(citizen, [{ kind: 'check', id: 'p7', name: 'P7', isMafia: false }]);
    });

    it('the godfather reads as innocent: "not mafia"', () => {
        const notes = moderatorNotes(getState(play(eightGodfather(), kill('p5'), save('p6'), check('p2'))));
        assert.deepEqual(notes, [{ kind: 'check', id: 'p2', name: 'P2', isMafia: false }]);
    });

    it('a doctor who saved the target is a note of its own, after the detective\'s', () => {
        const notes = moderatorNotes(getState(play(eight(), ...SAVED)));
        assert.deepEqual(notes.map((note) => note.kind), ['check', 'saved']);
        assert.deepEqual(notes[1], { kind: 'saved', id: 'p5', name: 'P5' });
    });

    it('no note about a save when the doctor saved somebody else', () => {
        assert.deepEqual(moderatorNotes(getState(play(eight(), ...NIGHT_1))).map((note) => note.kind), ['check']);
    });

    it('with the detective dead there is no finding (and so maybe nothing to note)', () => {
        const game = play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'), save('p6'));
        assert.deepEqual(moderatorNotes(getState(game)), [{ kind: 'saved', id: 'p6', name: 'P6' }]);
        const none = play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'), save('p7'));
        assert.deepEqual(moderatorNotes(getState(none)), []);
    });

    it('is empty outside the morning, and no note names a role', () => {
        assert.deepEqual(moderatorNotes(getState(eight())), []);
        assert.deepEqual(moderatorNotes(null), []);
        const text = JSON.stringify(moderatorNotes(getState(play(eight(), ...SAVED))));
        for (const role of ['mafia', 'doctor', 'detective', 'citizen', 'godfather']) assert.ok(!text.includes(`"${role}"`), role);
    });
});

describe('playerRows', () => {
    it('with the roles hidden a row has no role at all, not even a hidden one', () => {
        const rows = playerRows(getState(eight()), false);
        assert.equal(rows.length, 8);
        assert.ok(rows.every((row) => row.role === null));
        assert.ok(!JSON.stringify(rows).match(/mafia|doctor|detective|citizen/));
    });

    it('with the roles shown a row carries the role id and the alive mark, in the order dealt', () => {
        const rows = playerRows(getState(play(eight(), ...NIGHT_1)), true);
        assert.deepEqual(rows.map((row) => row.role), ['mafia', 'mafia', 'doctor', 'detective', 'citizen', 'citizen', 'citizen', 'citizen']);
        assert.deepEqual(rows.map((row) => row.alive), [true, true, true, true, false, true, true, true]);
        assert.deepEqual(playerRows(null, true), []);
    });
});

describe('the sentences, in both languages', () => {
    for (const lang of ['fa', 'en']) {
        describe(lang, () => {
            const name = (n) => isolate(n);

            it('a death with the role, a death without, and nobody died', () => {
                setLang(lang);
                const dead = { kind: 'death', id: 'p5', name: 'P5', role: 'citizen' };
                assert.equal(morningText(dead), fill(lang, 'morning.death.role', { name: name('P5'), role: roleName('citizen') }));
                assert.equal(morningText({ ...dead, role: null }), fill(lang, 'morning.death', { name: name('P5') }));
                assert.equal(morningText({ kind: 'nobody' }), CATALOGS[lang]['morning.nobody']);
                assert.equal(morningText(null), '');
            });

            it('an elimination by the vote with and without the role, a tie, and no votes', () => {
                setLang(lang);
                const out = { kind: 'eliminated', id: 'p2', name: 'P2', role: 'mafia' };
                assert.equal(duskText(out), fill(lang, 'dusk.eliminated.role', { name: name('P2'), role: roleName('mafia') }));
                assert.equal(duskText({ ...out, role: null }), fill(lang, 'dusk.eliminated', { name: name('P2') }));
                assert.equal(duskText({ kind: 'tie' }), CATALOGS[lang]['dusk.tie']);
                assert.equal(duskText({ kind: 'none' }), CATALOGS[lang]['dusk.none']);
                assert.equal(duskText(null), '');
            });

            it('who won', () => {
                setLang(lang);
                assert.equal(winnerText('town'), CATALOGS[lang]['ended.winner.town']);
                assert.equal(winnerText('mafia'), CATALOGS[lang]['ended.winner.mafia']);
                assert.equal(winnerText(null), '');
                assert.equal(winnerText('aliens'), '');
            });

            it('the moderator notes', () => {
                setLang(lang);
                assert.equal(noteText({ kind: 'check', id: 'p2', name: 'P2', isMafia: true }), fill(lang, 'morning.note.check.mafia', { name: name('P2') }));
                assert.equal(noteText({ kind: 'check', id: 'p2', name: 'P2', isMafia: false }), fill(lang, 'morning.note.check.innocent', { name: name('P2') }));
                assert.equal(noteText({ kind: 'saved', id: 'p5', name: 'P5' }), fill(lang, 'morning.note.saved', { name: name('P5') }));
            });
        });
    }

    it('a tie text never says "eliminated by the vote", and a death text never says tie', () => {
        setLang('en');
        assert.doesNotMatch(duskText({ kind: 'tie' }), /was eliminated/);
        assert.match(duskText({ kind: 'tie' }), /nobody is eliminated/i);
        assert.doesNotMatch(morningText({ kind: 'nobody' }), /eliminated/);
    });

    it('a name is isolated in the sentence, so a name in the other script cannot reorder it', () => {
        setLang('en');
        assert.ok(morningText({ kind: 'death', id: 'p1', name: 'Ali', role: null }).includes(isolate('Ali')));
        setLang('fa');
        assert.ok(duskText({ kind: 'eliminated', id: 'p1', name: 'Ali', role: null }).includes(isolate('Ali')));
        assert.notEqual(isolate('Ali'), 'Ali');
    });

    it('a role id the game does not know is left out rather than printed as an empty "role:"', () => {
        setLang('en');
        assert.equal(morningText({ kind: 'death', id: 'p1', name: 'Ali', role: 'wizard' }), fill('en', 'morning.death', { name: isolate('Ali') }));
    });
});
