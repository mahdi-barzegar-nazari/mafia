/**
 * Step 3B on a fake page, through the real seams: the night, the morning, the day, the dusk and the end of the game
 * are driven the way the buttons drive them, and the page and the saved game are read back. The promises:
 *
 *  - the phase after reveal is always the engine's own, after every action and every undo;
 *  - Confirm is what calls the engine: tapping a name only picks it, and the night screen shows nothing of what
 *    was chosen;
 *  - a secret (the roles of the players panel, the moderator notes) is in the page only while it is asked for;
 *  - a game comes back from a reload on the screen and the step it was on, with nothing picked.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { CONTINUE, check, eight, eightGodfather, kill, newGame, play, save, votes } from './helpers/gameKit.mjs';
import { createGameApp } from './helpers/gameApp.mjs';

const app = await createGameApp();
const { byId, dispatch, gameState, session, getState, wait, show, reload, visibleScreens, textOf, pressTarget, targetNames, pressed, HAND_OFF_GUARD_MS, SAVE_KEY, env } = app;
const { isolate, setLang } = await import('../../js/i18n/index.js');
const { roleName } = await import('../../js/ui/roleTexts.js');
const { renderUI } = await import('../../js/ui/render.js');

const CATALOGS = { fa, en };
const fill = (lang, key, params = {}) => CATALOGS[lang][key].replace(/\{(\w+)\}/g, (_, name) => params[name]);
const savedGame = () => JSON.parse(env.storage.get(SAVE_KEY)).state.game;
const actionCount = () => gameState.game.actions.length;
const enginePhase = () => getState(gameState.game).phase;

/** Pick the n-th target and confirm it, through the buttons. */
function choose(index) {
    wait(HAND_OFF_GUARD_MS);
    pressTarget(index);
    byId('btn-night-confirm').onclick();
}
/** Pick a target by player id and confirm. */
function chooseId(id) {
    const index = byId('night-targets').children.findIndex((li) => li.children[0].dataset.id === id);
    assert.notEqual(index, -1, `${id} is offered`);
    choose(index);
}
const statusTexts = () => byId('night-steps').children.map((li) => li.children[2].textContent);
const stepStatuses = () => byId('night-steps').children.map((li) => li.dataset.status);

const NIGHT_1 = [kill('p5'), save('p6'), check('p1')];

describe('the night screen', () => {
    it('shows the three steps in order with a status each, the instruction of the current one, and every living player as a target', () => {
        show(eight());
        assert.deepEqual(visibleScreens(), ['night']);
        assert.equal(byId('title-night').textContent, fill('fa', 'game.heading.night', { n: '۱' }));
        assert.deepEqual(byId('night-steps').children.map((li) => li.dataset.step), ['mafia', 'doctor', 'detective']);
        assert.deepEqual(stepStatuses(), ['current', 'waiting', 'waiting']);
        assert.deepEqual(statusTexts(), [fa['night.status.current'], fa['night.status.waiting'], fa['night.status.waiting']]);
        assert.equal(byId('night-instruction').textContent, fa['night.do.mafia.plain']);
        assert.deepEqual(targetNames(), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
        assert.equal(byId('night-steps').children[0].getAttribute('aria-current'), 'step');
        assert.equal(byId('night-current').classList.contains('hidden'), false);
    });

    it('the mafia instruction names the godfather only when one is alive', () => {
        show(eightGodfather());
        assert.equal(byId('night-instruction').textContent, fa['night.do.mafia.godfather']);
        show(eight());
        assert.equal(byId('night-instruction').textContent, fa['night.do.mafia.plain']);
        setLang('en');
        show(eightGodfather());
        assert.equal(byId('night-instruction').textContent, en['night.do.mafia.godfather']);
        assert.match(en['night.do.mafia.godfather'], /godfather included.*ONE target/);
    });

    it('a tap on a name only picks it: aria-pressed, a Confirm that names the pick, and the engine untouched', () => {
        show(eight());
        const before = actionCount();
        assert.equal(byId('btn-night-confirm').disabled, true);
        assert.equal(byId('btn-night-confirm').textContent, fa['night.confirm.none']);
        wait(HAND_OFF_GUARD_MS);
        pressTarget(2);
        assert.deepEqual(pressed(), ['false', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
        assert.equal(byId('btn-night-confirm').disabled, false);
        assert.equal(byId('btn-night-confirm').textContent, fill('fa', 'night.confirm', { name: isolate('P3') }));
        assert.equal(actionCount(), before, 'nothing was recorded by the tap');
        assert.equal(savedGame().actions.length, before, 'nothing saved either');
        assert.equal(session.nightTarget, 'p3');
    });

    it('picking the same name again takes the pick back, picking another moves it', () => {
        show(eight());
        wait(HAND_OFF_GUARD_MS);
        pressTarget(0);
        pressTarget(0);
        assert.equal(session.nightTarget, null);
        assert.equal(byId('btn-night-confirm').disabled, true);
        pressTarget(1);
        pressTarget(4);
        assert.deepEqual(pressed().filter((value) => value === 'true').length, 1);
        assert.equal(session.nightTarget, 'p5');
    });

    it('Confirm records the step once, clears the pick and moves on to the next step', () => {
        show(eight());
        chooseId('p5');
        assert.equal(actionCount(), 1);
        assert.deepEqual(gameState.game.actions[0], kill('p5'));
        assert.equal(session.nightTarget, null);
        assert.deepEqual(stepStatuses(), ['done', 'current', 'waiting']);
        assert.equal(byId('night-instruction').textContent, fa['night.do.doctor']);
        assert.equal(byId('btn-night-confirm').disabled, true, 'nothing is picked for the new step');
        assert.deepEqual(pressed().filter((value) => value === 'true'), []);
        byId('btn-night-confirm').onclick();
        assert.equal(actionCount(), 1, 'a second press of a disabled Confirm does nothing');
    });

    it('shows nothing of what was chosen: a finished step is only "done", and no pick is marked in the next list', () => {
        show(eight());
        chooseId('p7');
        const stepsText = textOf(byId('night-steps'));
        assert.ok(!stepsText.includes('P7'));
        assert.equal(statusTexts()[0], fa['night.status.done']);
        assert.ok(!byId('night-instruction').textContent.includes('P7'));
        assert.ok(!byId('game-live').textContent.includes('P7'));
        assert.ok(!byId('title-night').textContent.includes('P7'));
        assert.ok(pressed().every((value) => value === 'false'));
        chooseId('p6');
        chooseId('p1');
        // the night is over: the morning
        assert.equal(gameState.phase, 'morning');
        assert.ok(!textOf(byId('night-steps')).includes('P6'));
    });

    it('the night resolves by itself when the last required step is recorded: the next screen is the morning', () => {
        show(eight());
        chooseId('p5');
        chooseId('p6');
        assert.equal(gameState.phase, 'night');
        chooseId('p1');
        assert.equal(gameState.phase, 'morning');
        assert.deepEqual(visibleScreens(), ['morning']);
        assert.equal(byId('title-morning').textContent, fill('fa', 'game.heading.morning', { n: '۱' }));
    });

    it('the doctor\'s own name is missing, and the note says why, when the rules forbid saving themselves', () => {
        show(play(eight({ doctorSelfSave: 'never' }), kill('p5')));
        assert.equal(byId('night-instruction').textContent, fa['night.do.doctor']);
        assert.ok(!targetNames().includes('P3'));
        assert.equal(targetNames().length, 7);
        assert.equal(byId('night-doctor-note').classList.contains('hidden'), false);
        assert.equal(byId('night-doctor-note').textContent, fa['night.doctor.noSelf']);
        show(play(eight(), kill('p5')));
        assert.ok(targetNames().includes('P3'));
        assert.equal(byId('night-doctor-note').classList.contains('hidden'), true);
        assert.equal(byId('night-doctor-note').textContent, '');
    });

    it('the detective\'s own name is never offered', () => {
        show(play(eight(), kill('p5'), save('p6')));
        assert.equal(byId('night-instruction').textContent, fa['night.do.detective']);
        assert.ok(!targetNames().includes('P4'));
        assert.equal(targetNames().length, 7);
    });

    it('a doctor who is dead leaves "nobody alive" and the line that tells the moderator to pause as if calling them', () => {
        const night2 = play(eight(), kill('p3'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE);
        show(night2);
        assert.deepEqual(stepStatuses(), ['current', 'nobody', 'waiting']);
        assert.equal(statusTexts()[1], fa['night.status.nobody']);
        const doctorItem = byId('night-steps').children[1];
        assert.equal(doctorItem.children.length, 4, 'the fourth part is the pause line');
        assert.equal(doctorItem.children[3].textContent, fa['night.pause.doctor']);
        assert.equal(byId('night-steps').children[0].children.length, 3, 'a living step has no such line');
        // the mafia step is played, then the detective: the dead doctor is passed by, three items stay
        chooseId('p5');
        assert.deepEqual(stepStatuses(), ['done', 'nobody', 'current']);
        assert.equal(byId('night-steps').children.length, 3);
        assert.equal(byId('night-instruction').textContent, fa['night.do.detective']);
    });

    it('a dead detective, and a game that never had a doctor, are told the same way', () => {
        show(play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE));
        assert.deepEqual(stepStatuses(), ['current', 'waiting', 'nobody']);
        assert.equal(byId('night-steps').children[2].children[3].textContent, fa['night.pause.detective']);
        show(newGame(3));
        assert.deepEqual(stepStatuses(), ['current', 'nobody', 'waiting']);
        assert.equal(byId('night-steps').children[1].children[3].textContent, fa['night.pause.doctor']);
        setLang('en');
        show(newGame(3));
        assert.equal(byId('night-steps').children[1].children[3].textContent, en['night.pause.doctor']);
    });

    it('presses that make no sense do nothing: a name that is not offered, Confirm with nothing picked', () => {
        show(eight());
        wait(HAND_OFF_GUARD_MS);
        for (const payload of ['p99', '', null, undefined, 7, {}]) dispatch({ type: 'NIGHT_SELECT', payload });
        assert.equal(session.nightTarget, null);
        dispatch({ type: 'NIGHT_CONFIRM' });
        assert.equal(actionCount(), 0);
        // the doctor's step refuses a name the mafia step offered but the doctor's list does not
        show(play(eight({ doctorSelfSave: 'never' }), kill('p5')));
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'NIGHT_SELECT', payload: 'p3' });
        assert.equal(session.nightTarget, null);
    });

    it('a pick is dropped when the page is hidden, and when the last move is undone', () => {
        show(eight());
        wait(HAND_OFF_GUARD_MS);
        pressTarget(1);
        dispatch({ type: 'HIDE_SECRETS' });
        assert.equal(session.nightTarget, null);
        assert.ok(pressed().every((value) => value === 'false'));
        assert.equal(byId('btn-night-confirm').disabled, true);
        chooseId('p5');
        pressTarget(0);
        dispatch({ type: 'UNDO_GAME' });
        assert.equal(session.nightTarget, null);
    });

    it('says in English what it says in Persian: same steps, same buttons', () => {
        setLang('en');
        show(eight());
        assert.equal(byId('title-night').textContent, 'Night 1');
        assert.deepEqual(statusTexts(), ['Now', 'Waiting', 'Waiting']);
        assert.equal(byId('night-instruction').textContent, en['night.do.mafia.plain']);
        wait(HAND_OFF_GUARD_MS);
        pressTarget(4);
        assert.equal(byId('btn-night-confirm').textContent, `Confirm: ${isolate('P5')}`);
    });

    it('the live line names the phase and the step, never a role of a player or a name', () => {
        show(eight());
        assert.equal(byId('game-live').textContent, fill('fa', 'game.live.night', { heading: fill('fa', 'game.heading.night', { n: '۱' }), step: fa['night.step.mafia.name'] }));
        chooseId('p5');
        assert.equal(byId('game-live').textContent, fill('fa', 'game.live.night', { heading: fill('fa', 'game.heading.night', { n: '۱' }), step: fa['night.step.doctor.name'] }));
        const text = byId('game-live').textContent;
        for (const player of gameState.game.setup.players) assert.ok(!text.includes(player.name), player.name);
        for (const role of ['mafia', 'doctor', 'detective', 'citizen', 'godfather']) assert.ok(!text.includes(roleName(role)), role);
    });
});

describe('the morning', () => {
    const morning = (rules) => play(eight(rules), ...NIGHT_1);

    it('announces who was eliminated, with the role when the rules say so', () => {
        show(morning());
        assert.deepEqual(visibleScreens(), ['morning']);
        assert.equal(byId('morning-announcement').textContent, fill('fa', 'morning.death.role', { name: isolate('P5'), role: roleName('citizen') }));
    });

    it('announces the death with no role when the rules keep it secret, and the role is nowhere in the page', () => {
        show(morning({ revealRoleOnDeath: false }));
        assert.equal(byId('morning-announcement').textContent, fill('fa', 'morning.death', { name: isolate('P5') }));
        for (const id of ['screen-morning', 'players-list']) assert.ok(!textOf(byId(id)).includes(roleName('citizen')), id);
    });

    it('says "nobody died" for a night the doctor stopped', () => {
        show(play(eight(), kill('p5'), save('p5'), check('p1')));
        assert.equal(byId('morning-announcement').textContent, fa['morning.nobody']);
    });

    it('keeps the moderator notes out of the page until asked, and they open and close with the button', () => {
        show(play(eight(), kill('p5'), save('p5'), check('p2')));
        const notesNow = () => textOf(byId('morning-notes'));
        assert.equal(session.notesShown, false);
        assert.equal(byId('morning-notes').classList.contains('hidden'), true);
        assert.equal(byId('morning-notes-list').children.length, 0);
        assert.equal(byId('btn-morning-notes').getAttribute('aria-expanded'), 'false');
        assert.equal(byId('btn-morning-notes').textContent, fa['morning.notes.show']);
        assert.ok(!textOf(byId('screen-morning')).includes(fill('fa', 'morning.note.check.mafia', { name: isolate('P2') })));
        byId('btn-morning-notes').onclick();
        assert.equal(byId('morning-notes').classList.contains('hidden'), false);
        assert.deepEqual(byId('morning-notes-list').children.map((li) => li.textContent), [
            fill('fa', 'morning.note.check.mafia', { name: isolate('P2') }),
            fill('fa', 'morning.note.saved', { name: isolate('P5') })
        ]);
        assert.equal(byId('btn-morning-notes').getAttribute('aria-expanded'), 'true');
        assert.equal(byId('btn-morning-notes').textContent, fa['morning.notes.hide']);
        byId('btn-morning-notes').onclick();
        assert.equal(notesNow().trim(), '');
        assert.equal(byId('morning-notes-list').children.length, 0);
    });

    it('closes the notes when the page is hidden, and when the phase changes', () => {
        show(morning());
        byId('btn-morning-notes').onclick();
        assert.equal(byId('morning-notes-list').children.length, 1);
        dispatch({ type: 'HIDE_SECRETS' });
        assert.equal(session.notesShown, false);
        assert.equal(byId('morning-notes-list').children.length, 0);
        assert.equal(byId('morning-notes').classList.contains('hidden'), true);
        byId('btn-morning-notes').onclick();
        byId('btn-morning-continue').onclick(); // morning -> day
        assert.equal(gameState.phase, 'day');
        assert.equal(session.notesShown, false);
        dispatch({ type: 'UNDO_GAME' }); // back to the morning: still closed
        assert.equal(gameState.phase, 'morning');
        assert.equal(byId('morning-notes-list').children.length, 0);
    });

    it('the godfather reads as innocent in the notes', () => {
        show(play(eightGodfather(), kill('p5'), save('p6'), check('p2')));
        byId('btn-morning-notes').onclick();
        assert.deepEqual(byId('morning-notes-list').children.map((li) => li.textContent), [fill('fa', 'morning.note.check.innocent', { name: isolate('P2') })]);
    });

    it('with nothing to note the box says so, in both languages', () => {
        show(play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'), save('p7')));
        byId('btn-morning-notes').onclick();
        assert.deepEqual(byId('morning-notes-list').children.map((li) => li.textContent), [fa['morning.notes.empty']]);
        setLang('en');
        show(play(eight(), kill('p4'), save('p5'), check('p1'), CONTINUE, votes({}), CONTINUE, kill('p6'), save('p7')));
        byId('btn-morning-notes').onclick();
        assert.deepEqual(byId('morning-notes-list').children.map((li) => li.textContent), [en['morning.notes.empty']]);
    });

    it('Continue goes to the day, and to the end screen when the engine already has a winner', () => {
        show(morning());
        byId('btn-morning-continue').onclick();
        assert.equal(gameState.phase, 'day');
        let game = eight();
        for (const target of ['p5', 'p6', 'p7']) game = play(game, kill(target), save('p4'), check('p1'), CONTINUE, votes({}), CONTINUE);
        game = play(game, kill('p8'), save('p4'), check('p1'));
        show(game);
        assert.equal(gameState.phase, 'morning');
        assert.ok(!textOf(byId('screen-morning')).includes(fa['ended.winner.mafia']), 'the winner is not announced before the end screen');
        byId('btn-morning-continue').onclick();
        assert.equal(gameState.phase, 'ended');
        assert.equal(byId('ended-winner').textContent, fa['ended.winner.mafia']);
    });
});

describe('the day', () => {
    const day = (rules) => play(eight(rules), ...NIGHT_1, CONTINUE);
    const rows = () => byId('vote-list').children;
    const counts = () => rows().map((li) => li.children[1].children[1].textContent);
    const minus = (i) => rows()[i].children[1].children[0];
    const plus = (i) => rows()[i].children[1].children[2];

    it('lists the living players with a stepper each and counts the votes given', () => {
        show(day());
        assert.deepEqual(visibleScreens(), ['day']);
        assert.equal(byId('title-day').textContent, fill('fa', 'game.heading.day', { n: '۱' }));
        assert.equal(rows().length, 7, 'p5 is dead');
        assert.deepEqual(rows().map((li) => li.children[0].textContent), ['P1', 'P2', 'P3', 'P4', 'P6', 'P7', 'P8']);
        assert.equal(byId('day-counter').textContent, fill('fa', 'day.counter.other', { used: '۰', count: '۷' }));
        assert.ok(rows().every((li) => li.children[1].children[1].textContent === '۰'));
        assert.equal(minus(0).getAttribute('aria-label'), fill('fa', 'day.vote.minus', { name: isolate('P1') }));
        assert.equal(plus(0).getAttribute('aria-label'), fill('fa', 'day.vote.plus', { name: isolate('P1') }));
    });

    it('a plus gives a vote and a minus takes it back; the minus is off at zero', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        assert.equal(minus(1).disabled, true);
        plus(1).onclick();
        plus(1).onclick();
        plus(3).onclick();
        assert.deepEqual(counts(), ['۰', '۲', '۰', '۱', '۰', '۰', '۰']);
        assert.equal(byId('day-counter').textContent, fill('fa', 'day.counter.other', { used: '۳', count: '۷' }));
        assert.equal(minus(1).disabled, false);
        minus(1).onclick();
        assert.equal(counts()[1], '۱');
        minus(1).onclick();
        minus(1).onclick();
        assert.equal(counts()[1], '۰');
        assert.deepEqual(session.voteCounts, { p4: 1 }, 'only the non-zero counts are kept');
    });

    it('every plus is off when no vote is left, and the total never goes above the number of living players', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        for (let i = 0; i < 30; i++) plus(i % 7).onclick();
        assert.equal(byId('day-counter').textContent, fill('fa', 'day.counter.other', { used: '۷', count: '۷' }));
        const total = counts().reduce((sum, text) => sum + Number(text.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 0);
        assert.equal(total, 7);
        assert.ok(rows().every((li) => li.children[1].children[2].disabled === true));
        dispatch({ type: 'VOTE_STEP', payload: { id: 'p1', delta: 1 } });
        assert.equal(Object.values(session.voteCounts).reduce((a, b) => a + b, 0), 7);
        minus(0).onclick();
        assert.ok(rows().every((li) => li.children[1].children[2].disabled === false), 'a vote given back opens every plus again');
    });

    it('is updated in place: the same rows stay on screen while votes are counted (a focused button is not lost)', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        const before = rows().slice();
        const button = plus(2);
        button.onclick();
        button.onclick();
        assert.deepEqual(rows(), before);
        assert.equal(plus(2), button);
    });

    it('English says one vote and many votes properly', () => {
        setLang('en');
        show(day());
        assert.equal(byId('day-counter').textContent, '0 of 7 votes given');
        wait(HAND_OFF_GUARD_MS);
        plus(0).onclick();
        assert.equal(byId('day-counter').textContent, '1 of 7 votes given');
        show(play(eight(), kill('p5'), save('p6'), check('p1'), CONTINUE, votes({ p1: 3 }), CONTINUE, kill('p6'), save('p7'), check('p2'), CONTINUE));
        assert.match(byId('day-counter').textContent, /^0 of \d votes given$/);
    });

    it('keeps the count while the page is hidden, and starts from zero on a reload, an undo and every phase change', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        plus(0).onclick();
        dispatch({ type: 'HIDE_SECRETS' });
        assert.deepEqual(session.voteCounts, { p1: 1 }, 'a phone that locks in the middle of a count keeps it');
        assert.equal(counts()[0], '۱');
        assert.ok(!env.storage.get(SAVE_KEY).includes('voteCounts'), 'never saved');
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(counts()[0], '۰');
        plus(0).onclick();
        dispatch({ type: 'UNDO_GAME' });
        dispatch({ type: 'CONTINUE_GAME' });
        assert.equal(gameState.phase, 'day');
        assert.deepEqual(session.voteCounts, {});
        plus(0).onclick();
        byId('btn-vote-close').onclick();
        dispatch({ type: 'CONTINUE_GAME' }); // dusk -> night
        dispatch({ type: 'UNDO_GAME' });
        assert.equal(gameState.phase, 'dusk');
        dispatch({ type: 'UNDO_GAME' });
        assert.equal(gameState.phase, 'day');
        assert.deepEqual(session.voteCounts, {});
    });

    it('Close the vote casts the non-zero counts and goes to the dusk', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        plus(1).onclick();
        plus(1).onclick();
        plus(1).onclick();
        plus(4).onclick();
        byId('btn-vote-close').onclick();
        assert.equal(gameState.phase, 'dusk');
        assert.deepEqual(gameState.game.actions.at(-1), { type: 'CAST_VOTES', tally: { p2: 3, p6: 1 } });
        assert.deepEqual(visibleScreens(), ['dusk']);
        assert.equal(byId('dusk-result').textContent, fill('fa', 'dusk.eliminated.role', { name: isolate('P2'), role: roleName('mafia') }));
    });

    it('zero votes is allowed: nobody is eliminated, and the day says so beforehand', () => {
        show(day());
        wait(HAND_OFF_GUARD_MS);
        byId('btn-vote-close').onclick();
        assert.equal(gameState.phase, 'dusk');
        assert.deepEqual(gameState.game.actions.at(-1), { type: 'CAST_VOTES', tally: {} });
        assert.equal(byId('dusk-result').textContent, fa['dusk.none']);
    });
});

describe('the dusk', () => {
    const dusk = (tally, rules) => play(eight(rules), ...NIGHT_1, CONTINUE, votes(tally));

    it('tells who was eliminated by the vote, with the role only when announced', () => {
        show(dusk({ p2: 3, p1: 1 }));
        assert.equal(byId('title-dusk').textContent, fill('fa', 'game.heading.dusk', { n: '۱' }));
        assert.equal(byId('dusk-result').textContent, fill('fa', 'dusk.eliminated.role', { name: isolate('P2'), role: roleName('mafia') }));
        show(dusk({ p2: 3, p1: 1 }, { revealRoleOnDeath: false }));
        assert.equal(byId('dusk-result').textContent, fill('fa', 'dusk.eliminated', { name: isolate('P2') }));
        assert.ok(!textOf(byId('screen-dusk')).includes(roleName('mafia')));
    });

    it('a tie eliminates nobody and says so', () => {
        show(dusk({ p1: 2, p2: 2 }));
        assert.equal(byId('dusk-result').textContent, fa['dusk.tie']);
        assert.doesNotMatch(byId('dusk-result').textContent, /حذف شد/);
        setLang('en');
        show(dusk({ p1: 2, p2: 2 }));
        assert.equal(byId('dusk-result').textContent, en['dusk.tie']);
        assert.ok(getState(gameState.game).players.filter((p) => !p.alive).length === 1, 'only the night\'s victim is out');
    });

    it('Continue starts the next night, round 2', () => {
        show(dusk({ p2: 3 }));
        byId('btn-dusk-continue').onclick();
        assert.equal(gameState.phase, 'night');
        assert.equal(byId('title-night').textContent, fill('fa', 'game.heading.night', { n: '۲' }));
        assert.deepEqual(stepStatuses(), ['current', 'waiting', 'waiting']);
    });

    it('Continue goes to the end screen when the vote decided the game', () => {
        const townWins = play(eight(), kill('p5'), save('p5'), check('p1'), CONTINUE, votes({ p1: 3 }), CONTINUE, kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p2: 3 }));
        show(townWins);
        assert.equal(gameState.phase, 'dusk');
        byId('btn-dusk-continue').onclick();
        assert.equal(gameState.phase, 'ended');
        assert.equal(byId('ended-winner').textContent, fa['ended.winner.town']);
    });
});

describe('the end of the game', () => {
    const townWon = () => play(eight(), kill('p5'), save('p5'), check('p1'), CONTINUE, votes({ p1: 3 }), CONTINUE, kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p2: 3 }), CONTINUE);

    it('says who won and lists every player with the role and the alive mark, no toggle needed', () => {
        show(townWon());
        assert.deepEqual(visibleScreens(), ['ended']);
        assert.equal(byId('title-ended').textContent, fill('fa', 'game.heading.ended', { n: '۲' }));
        assert.equal(byId('ended-winner').textContent, fa['ended.winner.town']);
        const rowsOf = byId('players-list').children;
        assert.equal(rowsOf.length, 8);
        assert.deepEqual(rowsOf.map((row) => row.children[1].textContent), gameState.game.setup.players.map((p) => roleName(p.role)));
        assert.deepEqual(rowsOf.map((row) => row.dataset.alive), ['false', 'false', 'true', 'true', 'true', 'true', 'true', 'true']);
        assert.equal(byId('btn-roles-toggle').classList.contains('hidden'), true, 'no toggle: the game is over');
        assert.equal(byId('btn-new-game').classList.contains('hidden'), true, 'the end screen has its own');
        assert.match(byId('game-live').textContent, new RegExp(fa['ended.winner.town']));
    });

    it('"New game" on the end screen needs no question: the game and the save are gone, the welcome screen is back', () => {
        show(townWon());
        byId('btn-ended-new-game').onclick();
        assert.equal(session.pendingConfirmAction, null);
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.game, null);
        assert.equal(env.storage.has(SAVE_KEY), false);
        assert.deepEqual(visibleScreens(), ['welcome']);
    });

    it('"New game" from the end screen\'s action does nothing anywhere else', () => {
        show(eight());
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'NEW_GAME_NOW' });
        assert.equal(gameState.phase, 'night');
        assert.notEqual(gameState.game, null);
    });

    it('Undo leaves the end screen: back to the dusk of the last vote, and from there to the day', () => {
        show(townWon());
        byId('btn-undo').onclick();
        assert.equal(gameState.phase, 'dusk');
        assert.equal(enginePhase(), 'dusk');
        assert.deepEqual(visibleScreens(), ['dusk']);
        byId('btn-undo').onclick();
        assert.equal(gameState.phase, 'day');
        assert.equal(byId('btn-new-game').classList.contains('hidden'), false, 'the chrome\'s own button is back');
    });

    it('the mafia win says so', () => {
        let game = eight();
        for (const target of ['p5', 'p6', 'p7']) game = play(game, kill(target), save('p4'), check('p1'), CONTINUE, votes({}), CONTINUE);
        show(play(game, kill('p8'), save('p4'), check('p1'), CONTINUE));
        assert.equal(byId('ended-winner').textContent, fa['ended.winner.mafia']);
        setLang('en');
        show(play(game, kill('p8'), save('p4'), check('p1'), CONTINUE));
        assert.equal(byId('ended-winner').textContent, 'The mafia wins');
        assert.match(byId('game-live').textContent, /The mafia wins/);
    });
});

describe('undo', () => {
    it('is disabled at the start of the game and the first press of Undo does nothing', () => {
        show(eight());
        assert.equal(byId('btn-undo').disabled, true);
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'UNDO_GAME' });
        assert.equal(actionCount(), 0);
        assert.equal(gameState.phase, 'night');
    });

    it('is enabled after the first action, and takes back one step of the night, drawing it from the new state', () => {
        show(eight());
        chooseId('p5');
        assert.equal(byId('btn-undo').disabled, false);
        byId('btn-undo').onclick();
        assert.equal(actionCount(), 0);
        assert.deepEqual(stepStatuses(), ['current', 'waiting', 'waiting']);
        assert.equal(byId('night-instruction').textContent, fa['night.do.mafia.plain']);
        assert.equal(byId('btn-undo').disabled, true);
        assert.equal(savedGame().actions.length, 0, 'saved too');
    });

    it('undoes across phases and the phase is re-derived every time: the whole game forwards and back', () => {
        show(eight());
        const steps = [
            () => chooseId('p5'),
            () => chooseId('p6'),
            () => chooseId('p1'),
            () => byId('btn-morning-continue').onclick(),
            () => {
                wait(HAND_OFF_GUARD_MS);
                dispatch({ type: 'VOTE_STEP', payload: { id: 'p2', delta: 1 } });
                byId('btn-vote-close').onclick();
            },
            () => byId('btn-dusk-continue').onclick()
        ];
        const seen = [];
        for (const step of steps) {
            step();
            wait(HAND_OFF_GUARD_MS);
            assert.equal(gameState.phase, enginePhase(), 'after an action');
            assert.deepEqual(visibleScreens(), [gameState.phase]);
            seen.push(`${gameState.phase}:${actionCount()}`);
        }
        assert.deepEqual(seen, ['night:1', 'night:2', 'morning:3', 'day:4', 'dusk:5', 'night:6']);
        while (actionCount() > 0) {
            byId('btn-undo').onclick();
            wait(HAND_OFF_GUARD_MS);
            assert.equal(gameState.phase, enginePhase(), `after an undo down to ${actionCount()} action(s)`);
            assert.deepEqual(visibleScreens(), [gameState.phase]);
            assert.equal(JSON.stringify(savedGame()), JSON.stringify(gameState.game), 'the save follows');
        }
        assert.equal(byId('btn-undo').disabled, true);
        assert.equal(gameState.phase, 'night');
    });

    it('closes the roles in the panel only when the phase changes: an undo inside the same phase leaves them', () => {
        show(eight());
        chooseId('p5');
        byId('btn-roles-toggle').onclick();
        assert.equal(session.rolesShown, true);
        byId('btn-undo').onclick();
        assert.equal(gameState.phase, 'night');
        assert.equal(session.rolesShown, true, 'same phase');
        chooseId('p5');
        chooseId('p6');
        chooseId('p1');
        assert.equal(session.rolesShown, false, 'the morning opened closed');
    });

    it('is refused outside a game screen: on the welcome screen nothing is undone', () => {
        show(play(eight(), kill('p5')));
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'NAVIGATE', payload: 'welcome' });
        dispatch({ type: 'UNDO_GAME' });
        assert.equal(actionCount(), 1);
    });

    it('a save that says "reveal" but already holds an action is not a game that can be resumed', () => {
        show(play(eight(), kill('p5')), { phase: 'reveal' });
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.game, null);
    });
});

describe('the players panel and the chrome', () => {
    it('is the same on every game screen: every player with a mark, the rules, undo and new game', () => {
        const games = [eight(), play(eight(), ...NIGHT_1), play(eight(), ...NIGHT_1, CONTINUE), play(eight(), ...NIGHT_1, CONTINUE, votes({ p2: 3 }))];
        for (const game of games) {
            show(game);
            assert.equal(byId('game-chrome').classList.contains('hidden'), false, gameState.phase);
            assert.equal(byId('players-list').children.length, 8, gameState.phase);
            assert.equal(byId('rules-list').children.length, 3, gameState.phase);
            assert.equal(byId('btn-new-game').classList.contains('hidden'), false, gameState.phase);
            assert.equal(byId('btn-roles-toggle').classList.contains('hidden'), false, gameState.phase);
        }
    });

    it('marks the dead and shows no role until asked, on every screen', () => {
        show(play(eight(), ...NIGHT_1));
        const rowsOf = byId('players-list').children;
        assert.deepEqual(rowsOf.map((row) => row.dataset.alive), ['true', 'true', 'true', 'true', 'false', 'true', 'true', 'true']);
        assert.equal(rowsOf[4].children.at(-1).textContent, fa['game.player.dead']);
        assert.equal(rowsOf[0].children.at(-1).textContent, fa['game.player.alive']);
        assert.ok(rowsOf.every((row) => row.children.length === 2));
        assert.ok(!textOf(byId('players-list')).includes(roleName('mafia')));
        byId('btn-roles-toggle').onclick();
        assert.equal(byId('players-list').children[0].children.length, 3);
        assert.equal(byId('players-list').children[0].children[1].textContent, roleName('mafia'));
    });

    it('closes the roles whenever the phase changes (continue) and when the page is hidden', () => {
        show(play(eight(), ...NIGHT_1));
        byId('btn-roles-toggle').onclick();
        assert.equal(session.rolesShown, true);
        byId('btn-morning-continue').onclick();
        assert.equal(session.rolesShown, false);
        assert.ok(byId('players-list').children.every((row) => row.children.length === 2));
        byId('btn-roles-toggle').onclick();
        dispatch({ type: 'HIDE_SECRETS' });
        assert.ok(byId('players-list').children.every((row) => row.children.length === 2));
    });

    it('rules: one line for each rule in force, in the language of the game', () => {
        show(eightGodfather({ doctorSelfSave: 'always', revealRoleOnDeath: false }));
        assert.deepEqual(byId('rules-list').children.map((li) => li.textContent), [fa['game.rule.selfSave.always'], fa['game.rule.godfather.on'], fa['game.rule.revealRole.off']]);
        setLang('en');
        show(eight({ doctorSelfSave: 'never' }));
        assert.deepEqual(byId('rules-list').children.map((li) => li.textContent), [en['game.rule.selfSave.never'], en['game.rule.godfather.off'], en['game.rule.revealRole.on']]);
    });

    it('"New game" asks first; "no" changes nothing, "yes" discards the game and the save', () => {
        show(play(eight(), ...NIGHT_1));
        wait(HAND_OFF_GUARD_MS);
        byId('btn-new-game').onclick();
        assert.equal(typeof session.pendingConfirmAction, 'function');
        assert.equal(gameState.phase, 'morning');
        const callback = session.pendingConfirmAction;
        session.pendingConfirmAction = null;
        callback();
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.game, null);
        assert.equal(env.storage.has(SAVE_KEY), false);
    });

    it('is not shown on the welcome and setup screens', () => {
        show(eight());
        assert.equal(byId('game-chrome').classList.contains('hidden'), false);
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'NAVIGATE', payload: 'setup' });
        assert.equal(byId('game-chrome').classList.contains('hidden'), true);
    });
});

describe('a reload on every screen', () => {
    const CASES = [
        ['night', eight()],
        ['night', play(eight(), kill('p5'))],
        ['night', play(eight(), kill('p5'), save('p6'))],
        ['morning', play(eight(), ...NIGHT_1)],
        ['day', play(eight(), ...NIGHT_1, CONTINUE)],
        ['dusk', play(eight(), ...NIGHT_1, CONTINUE, votes({ p1: 1 }))],
        ['ended', play(eight(), kill('p5'), save('p5'), check('p1'), CONTINUE, votes({ p1: 3 }), CONTINUE, kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p2: 3 }), CONTINUE)]
    ];

    for (const [phase, game] of CASES) {
        it(`${phase} (${game.actions.length} action(s)): the same screen and the same step come back, with nothing open or picked`, () => {
            show(game);
            wait(HAND_OFF_GUARD_MS);
            // open every toggle that exists here, pick a name if there are names
            if (phase !== 'ended') byId('btn-roles-toggle').onclick();
            if (phase === 'morning') byId('btn-morning-notes').onclick();
            if (phase === 'night') pressTarget(0);
            if (phase === 'day') byId('vote-list').children[0].children[1].children[2].onclick();
            const phaseBefore = gameState.phase;
            const stepBefore = getState(gameState.game).step;
            const headingBefore = byId(`title-${phase}`).textContent;
            const statusesBefore = phase === 'night' ? stepStatuses() : null;
            dispatch({ type: 'HIDE_SECRETS' }); // pagehide
            reload();
            assert.equal(byId('btn-resume-game').classList.contains('hidden'), false, 'the welcome screen offers it');
            dispatch({ type: 'RESUME_GAME' });
            assert.equal(gameState.phase, phaseBefore);
            assert.equal(gameState.phase, enginePhase());
            assert.equal(getState(gameState.game).step, stepBefore);
            assert.deepEqual(visibleScreens(), [phase]);
            assert.equal(byId(`title-${phase}`).textContent, headingBefore);
            assert.equal(session.rolesShown, false);
            assert.equal(session.notesShown, false);
            assert.equal(session.nightTarget, null);
            assert.deepEqual(session.voteCounts, {});
            if (phase === 'night') {
                assert.deepEqual(stepStatuses(), statusesBefore);
                assert.ok(pressed().every((value) => value === 'false'), 'nothing is selected');
                assert.equal(byId('btn-night-confirm').disabled, true);
            }
            if (phase !== 'ended') assert.ok(byId('players-list').children.every((row) => row.children.length === 2), 'no role in the page');
            assert.equal(byId('btn-undo').disabled, game.actions.length === 0);
        });
    }

    it('a reload in the middle of the night does not restore a picked name, even one that was picked a moment before the page went away', () => {
        show(play(eight(), kill('p5')));
        wait(HAND_OFF_GUARD_MS);
        pressTarget(3);
        assert.equal(session.nightTarget, 'p4');
        // the page goes away without its HIDE_SECRETS ever running (a crash, a killed tab)
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(session.nightTarget, null);
        assert.ok(pressed().every((value) => value === 'false'));
        assert.ok(!env.storage.get(SAVE_KEY).includes('nightTarget'), 'never in the save');
    });

    it('a save made by the version before this one (phase "moderator") is ignored', () => {
        show(eight());
        const record = JSON.parse(env.storage.get(SAVE_KEY));
        record.version = record.version - 1;
        record.state.phase = 'moderator';
        env.storage.set(SAVE_KEY, JSON.stringify(record));
        reload();
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(gameState.phase, 'welcome');
    });
});

describe('the hand-off guard', () => {
    function toLastCard() {
        show(eight(), { phase: 'reveal', index: 7 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, true);
    }

    it('a press of "I am {name}" 799 ms after a card was hidden is ignored, and at 800 ms it is accepted', () => {
        show(eight(), { phase: 'reveal', index: 0 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        dispatch({ type: 'REVEAL_HIDE' });
        assert.equal(gameState.reveal.index, 1);
        wait(HAND_OFF_GUARD_MS - 1);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, false, '799 ms: ignored');
        assert.equal(byId('reveal-card-body').children.length, 0, 'no role was built');
        wait(1);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, true, '800 ms: accepted');
        assert.ok(byId('reveal-card-body').children.length > 0);
    });

    it('a whole double tap on "Hide and pass on" shows no second card', () => {
        show(eight(), { phase: 'reveal', index: 0 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        dispatch({ type: 'REVEAL_HIDE' });
        dispatch({ type: 'REVEAL_SHOW' }); // the second tap, a few ms later, lands on the next gate's button
        dispatch({ type: 'REVEAL_HIDE' }); // and the one after
        assert.equal(session.revealCardOpen, false);
        assert.equal(byId('reveal-card-body').children.length, 0);
        assert.equal(gameState.reveal.index, 1, 'nobody was skipped either');
    });

    it('the guard is measured from the LAST hide, not the first', () => {
        show(eight(), { phase: 'reveal', index: 0 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        dispatch({ type: 'REVEAL_HIDE' });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        dispatch({ type: 'REVEAL_HIDE' });
        wait(HAND_OFF_GUARD_MS - 1);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, false);
        wait(1);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, true);
    });

    it('after the last card the first night ignores every press for 800 ms: no pick, no Confirm, no roles, no undo, no new game', () => {
        toLastCard();
        dispatch({ type: 'REVEAL_HIDE' });
        assert.equal(gameState.phase, 'night');
        wait(HAND_OFF_GUARD_MS - 1);
        dispatch({ type: 'TOGGLE_ROLES' });
        dispatch({ type: 'NIGHT_SELECT', payload: 'p5' });
        dispatch({ type: 'NIGHT_CONFIRM' });
        dispatch({ type: 'UNDO_GAME' });
        dispatch({ type: 'CONFIRM_NEW_GAME' });
        dispatch({ type: 'NEW_GAME_NOW' });
        assert.equal(session.rolesShown, false, 'the roles stay out of the panel');
        assert.equal(session.nightTarget, null);
        assert.equal(session.pendingConfirmAction, null);
        assert.equal(actionCount(), 0);
        assert.ok(byId('players-list').children.every((row) => row.children.length === 2));
        // a pick is a quiet thing; the real danger is the toggle, and it is shut at 799 ms and open at 800
        wait(1);
        dispatch({ type: 'TOGGLE_ROLES' });
        assert.equal(session.rolesShown, true, '800 ms: accepted');
        dispatch({ type: 'NIGHT_SELECT', payload: 'p5' });
        assert.equal(session.nightTarget, 'p5');
    });

    it('the guard covers the buttons of the other game screens too (they can be the first screen after a resume of an undone game)', () => {
        toLastCard();
        dispatch({ type: 'REVEAL_HIDE' });
        for (const type of ['TOGGLE_NOTES', 'CONTINUE_GAME', 'VOTE_CLOSE', 'VOTE_STEP']) {
            dispatch({ type, payload: { id: 'p1', delta: 1 } });
        }
        assert.equal(actionCount(), 0);
        assert.deepEqual(session.voteCounts, {});
    });

    it('a reload ends it: nothing is guarded after the page starts over', () => {
        toLastCard();
        dispatch({ type: 'REVEAL_HIDE' });
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(session.cardHiddenAt, null);
        dispatch({ type: 'TOGGLE_ROLES' });
        assert.equal(session.rolesShown, true);
    });

    it('a clock that goes backwards never blocks a press for long', () => {
        show(eight(), { phase: 'reveal', index: 0 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_SHOW' });
        dispatch({ type: 'REVEAL_HIDE' });
        wait(-5000);
        dispatch({ type: 'REVEAL_SHOW' });
        assert.equal(session.revealCardOpen, true);
    });

    it('a stray "Hide and pass on" with no card showing does not skip a player', () => {
        show(eight(), { phase: 'reveal', index: 2 });
        wait(HAND_OFF_GUARD_MS);
        dispatch({ type: 'REVEAL_HIDE' });
        assert.equal(gameState.reveal.index, 2);
    });
});

describe('a screen that is not showing holds nothing of its last drawing', () => {
    it('the night leaves no step, no name and no pick behind once the morning is up', () => {
        show(eight());
        chooseId('p5');
        chooseId('p6');
        chooseId('p1');
        assert.equal(gameState.phase, 'morning');
        assert.equal(byId('night-steps').children.length, 0);
        assert.equal(byId('night-targets').children.length, 0);
        assert.equal(byId('btn-night-confirm').textContent, '');
        assert.equal(byId('night-instruction').textContent, '');
        assert.ok(!textOf(byId('screen-night')).includes('P5'));
    });

    it('the vote leaves no list behind once the dusk is up, and the notes none once the day is up', () => {
        show(play(eight(), ...NIGHT_1));
        byId('btn-morning-notes').onclick();
        byId('btn-morning-continue').onclick();
        assert.equal(byId('morning-notes-list').children.length, 0, 'the note about the detective is not left in the hidden page');
        wait(HAND_OFF_GUARD_MS);
        byId('vote-list').children[0].children[1].children[2].onclick();
        byId('btn-vote-close').onclick();
        assert.equal(byId('vote-list').children.length, 0);
    });

    it('leaving the game empties the chrome too: a game that was over leaves no role in the page', () => {
        show(play(eight(), kill('p5'), save('p5'), check('p1'), CONTINUE, votes({ p1: 3 }), CONTINUE, kill('p5'), save('p5'), check('p2'), CONTINUE, votes({ p2: 3 }), CONTINUE));
        assert.ok(textOf(byId('players-list')).includes(roleName('doctor')), 'the end screen shows the roles');
        byId('btn-ended-new-game').onclick();
        assert.equal(gameState.phase, 'welcome');
        for (const id of ['players-list', 'rules-list', 'ended-winner', 'morning-announcement', 'dusk-result', 'game-live']) assert.equal(textOf(byId(id)).trim(), '', id);
        assert.ok(!textOf(byId('game-chrome')).includes(roleName('doctor')));
    });

    it('the roles shown in the panel when the game is thrown away are not left in the page either', () => {
        show(eight());
        wait(HAND_OFF_GUARD_MS);
        byId('btn-roles-toggle').onclick();
        assert.ok(textOf(byId('players-list')).includes(roleName('doctor')));
        byId('btn-new-game').onclick();
        const callback = session.pendingConfirmAction;
        session.pendingConfirmAction = null;
        callback();
        assert.ok(!textOf(byId('game-chrome')).includes(roleName('doctor')));
    });

    it('a new game with the same ids but other names shows the new names, not the old list', () => {
        show(eight());
        assert.deepEqual(targetNames().slice(0, 2), ['P1', 'P2']);
        const other = structuredClone(eight());
        other.setup.players.forEach((player) => {
            player.name = `Z${player.id}`;
        });
        gameState.game = other;
        renderUI();
        assert.deepEqual(targetNames().slice(0, 2), ['Zp1', 'Zp2']);
        assert.deepEqual(byId('players-list').children.map((row) => row.children[0].textContent).slice(0, 2), ['Zp1', 'Zp2']);
    });

    it('the same goes for the vote rows', () => {
        show(play(eight(), ...NIGHT_1, CONTINUE));
        const other = structuredClone(play(eight(), ...NIGHT_1, CONTINUE));
        other.setup.players.forEach((player) => {
            player.name = `Z${player.id}`;
        });
        gameState.game = other;
        renderUI();
        assert.deepEqual(byId('vote-list').children.map((li) => li.children[0].textContent).slice(0, 2), ['Zp1', 'Zp2']);
    });
});
