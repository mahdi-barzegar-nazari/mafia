/**
 * Step 3A end to end on a fake page, through the real seams (`wireApp` installs the real action handler and the
 * real renderer): the setup form deals a game, the roles are handed out one player at a time, the moderator's
 * list follows, and the game is saved at every step and resumed after a "reload". It protects the promises that
 * matter most at the table:
 *
 *  - a role card is built only after its player's gate was passed, matches the game, and is TAKEN OUT of the page
 *    (not hidden) when it is hidden, so the next person never holds a phone with a role in it;
 *  - the hand-off progress is saved at every hand-off, and a reload always lands on a gate, never on a card;
 *  - the moderator's list shows no role until asked, and hides them again when the page is hidden;
 *  - leaving a game, or starting another over a saved one, asks first and really discards the old one;
 *  - the language is locked from the first gate to "new game".
 */
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { SAVE_VERSION, gameState, session } from '../../js/core/state.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { MAFIA_TEAM } from '../../js/data/roles.js';
import { eight } from './helpers/gameKit.mjs';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { resetSingletons } from './helpers/harness.mjs';

const env = installFakeEnv();
const getById = document.getElementById;
document.getElementById = (id) => getById(id) || (env.el('setup-names').children.find((child) => child.id === id) ?? null);
const { wireApp } = await import('../../js/app/wire.js');
const { dispatch, setDispatchHandler } = await import('../../js/core/dispatch.js');
const { setBeforePhaseChange, setRenderer } = await import('../../js/core/phase.js');
const { SAVE_KEY } = await import('../../js/core/storage.js');
const { DEFAULT_LANG, getLang, isolate, setLang } = await import('../../js/i18n/index.js');
const { roleName } = await import('../../js/ui/roleTexts.js');
const { resetSetupForm } = await import('../../js/ui/setup.js');
const { syncResumeButton } = await import('../../js/ui/resume.js');

const PHASES = ['welcome', 'setup', 'reveal', 'moderator'];
const screen = (name) => env.el(`screen-${name}`);
const byId = (id) => env.el(id);
const names = () => byId('setup-names').children.map((input) => input.value);
const savedRecord = () => (env.storage.has(SAVE_KEY) ? JSON.parse(env.storage.get(SAVE_KEY)) : null);

/** The page: the four screens (only welcome showing), the parts of each that the code writes, and the dialogs. */
function buildPage() {
    const screens = PHASES.map((name) => {
        const el = env.el(`screen-${name}`);
        el.classList.add('screen-view');
        if (name !== 'welcome') el.classList.add('hidden');
        el.queries['h1, h2, h3'] = new FakeElement(`${name}-heading`, 'h2');
        return el;
    });
    env.stubQuery('.screen-view', screens);
    for (const id of ['reveal-gate', 'reveal-card']) byId(id).classList.add('hidden');
    byId('btn-resume-game').classList.add('hidden');
    for (const id of ['confirm-modal', 'info-modal']) {
        const modal = byId(id);
        modal.classList.add('modal-overlay', 'hidden');
        modal.querySelectorAll = () => [];
    }
    for (const id of ['confirm-modal-title', 'confirm-modal-text', 'main-content-root', 'toast-container', 'reveal-progress', 'reveal-gate-title', 'btn-reveal-show', 'btn-reveal-hide', 'reveal-card-body', 'reveal-live', 'moderator-list', 'moderator-rules', 'btn-roles-toggle', 'players-limit-hint', 'names-limit-hint', 'godfather-hint', 'setup-names']) byId(id);
    byId('setup-players-count').value = '8';
    byId('setup-doctor-save').value = 'once';
    byId('setup-godfather').checked = false;
    byId('setup-reveal-death').checked = true;
    document.body = new FakeElement('body', 'body');
    document.documentElement = { lang: 'fa', dir: 'rtl', classList: { remove() {} } };
}

beforeEach(() => {
    env.reset();
    env.installTimers();
    env.seedRandom(7);
    resetSingletons();
    buildPage();
    wireApp();
    resetSetupForm();
});
afterEach(() => {
    setLang(DEFAULT_LANG);
    setRenderer(null);
    setBeforePhaseChange(null);
    setDispatchHandler(null);
    delete document.body;
    delete document.documentElement;
    env.reset();
});
after(() => env.uninstall());

const go = (phase) => dispatch({ type: 'NAVIGATE', payload: phase });
const visibleScreens = () => PHASES.filter((name) => !screen(name).classList.contains('hidden'));

/** Deal from the setup form (the names and rules as the form holds them now) and return the game. */
function deal() {
    go('setup');
    dispatch({ type: 'DEAL_GAME' });
    return gameState.game;
}

/** The text of the role card on screen, or null when no card is built. */
function cardTexts() {
    const body = byId('reveal-card-body');
    return body.children.length === 0 ? null : body.children.map((child) => child.textContent);
}

/** Answer the confirm dialog that the last action opened. */
function answerConfirm(yes) {
    const callback = session.pendingConfirmAction;
    assert.equal(typeof callback, 'function', 'a question is waiting');
    assert.equal(byId('confirm-modal').classList.contains('hidden'), false, 'and it is open');
    session.pendingConfirmAction = null;
    dispatch({ type: 'CLOSE_MODAL', payload: 'confirm-modal' });
    if (yes) callback();
}

/** What a reload does: the page and every singleton start over; only localStorage survives. */
function reload() {
    const record = env.storage.get(SAVE_KEY);
    const lang = getLang();
    env.reset();
    env.seedRandom(8);
    resetSingletons();
    buildPage();
    wireApp();
    resetSetupForm();
    if (record !== undefined) env.storage.set(SAVE_KEY, record);
    setLang(lang);
    syncResumeButton();
}

/** Walk one player through the gate: show the card, return what it said. */
function peek() {
    dispatch({ type: 'REVEAL_SHOW' });
    return cardTexts();
}

describe('dealing from the setup form', () => {
    it('a good form starts the reveal: the game is in the state, the first gate shows, and the old form is cleared', () => {
        const typed = ['Ali', 'Sara', 'Reza', 'Nima', 'Mina', 'Omid', 'Kian', 'Roya'];
        go('setup');
        byId('setup-names').children.forEach((input, i) => (input.value = typed[i]));
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(gameState.game.setup.players.map((p) => p.name), typed);
        assert.deepEqual(gameState.reveal, { index: 0 });
        assert.deepEqual(visibleScreens(), ['reveal']);
        assert.equal(names()[0], 'بازیکن ۱', 'the names are not kept for the next game');
        assert.equal(byId('setup-players-count').value, '8');
    });

    it('a form with a problem starts nothing: still on setup, no game, nothing saved, the person is told', () => {
        go('setup');
        byId('setup-names').children[2].value = '';
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(gameState.phase, 'setup');
        assert.equal(gameState.game, null);
        assert.equal(env.storage.size, 0);
        assert.equal(env.toasts().length, 1);
        assert.equal(FakeElement.lastFocused.id, 'setup-name-3');
    });

    it('the message of an earlier refusal does not follow the form onto the first gate', () => {
        go('setup');
        byId('setup-names').children[0].value = '';
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(env.toasts().length, 1, 'refused, and told');
        byId('setup-names').children[0].value = 'Ali';
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(gameState.phase, 'reveal');
        assert.equal(env.toasts().length, 0, 'the old message is gone');
    });

    it('the save of the new game exists from the first gate on, in the reveal phase at player 1', () => {
        deal();
        const record = savedRecord();
        assert.equal(record.version, SAVE_VERSION);
        assert.equal(record.state.phase, 'reveal');
        assert.deepEqual(record.state.reveal, { index: 0 });
        assert.deepEqual(record.state.game, gameState.game);
    });

    it('over a saved game it asks first: nothing changes on "cancel", and "yes" replaces the old save', () => {
        env.storage.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: { phase: 'moderator', reveal: { index: 0 }, game: eight() } }));
        const old = env.storage.get(SAVE_KEY);
        go('setup');
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(byId('confirm-modal-title').textContent, fa['confirm.discard.title']);
        assert.equal(byId('confirm-modal-text').textContent, fa['confirm.discard.text']);
        assert.equal(gameState.phase, 'setup', 'not yet');
        assert.equal(gameState.game, null);
        answerConfirm(false);
        assert.equal(gameState.phase, 'setup');
        assert.equal(env.storage.get(SAVE_KEY), old, 'the old save is untouched');
        dispatch({ type: 'DEAL_GAME' });
        answerConfirm(true);
        assert.equal(gameState.phase, 'reveal');
        assert.notEqual(env.storage.get(SAVE_KEY), old);
        assert.equal(savedRecord().state.phase, 'reveal');
    });

    it('over a save that is damaged it does not ask: there is nothing to lose', () => {
        env.storage.set(SAVE_KEY, '{ damaged');
        go('setup');
        dispatch({ type: 'DEAL_GAME' });
        assert.equal(gameState.phase, 'reveal');
        assert.equal(session.pendingConfirmAction, null);
    });

    it('with no game, the reveal and moderator screens cannot be reached at all', () => {
        for (const phase of ['reveal', 'moderator']) {
            go(phase);
            assert.equal(gameState.phase, 'welcome', phase);
        }
    });
});

describe('the hand-off gate', () => {
    it('says whose turn it is, with the name isolated, and offers "I am" with the same name; no role is in the page', () => {
        deal();
        const name = isolate('بازیکن ۱');
        assert.equal(byId('reveal-gate-title').textContent, `گوشی را به ${name} بدهید`);
        assert.equal(byId('btn-reveal-show').textContent, `من ${name} هستم`);
        assert.equal(byId('reveal-progress').textContent, 'بازیکن ۱ از ۸');
        assert.equal(byId('reveal-gate').classList.contains('hidden'), false);
        assert.equal(byId('reveal-card').classList.contains('hidden'), true);
        assert.equal(cardTexts(), null);
    });

    it('in English the gate speaks English', () => {
        setLang('en');
        resetSetupForm();
        deal();
        assert.equal(byId('reveal-gate-title').textContent, `Hand the phone to ${isolate('Player 1')}`);
        assert.equal(byId('btn-reveal-show').textContent, `I am ${isolate('Player 1')}`);
        assert.equal(byId('reveal-progress').textContent, 'Player 1 of 8');
    });

    it('moves the focus to its heading and says the step in the one live line, without a role', () => {
        deal();
        assert.equal(FakeElement.lastFocused, byId('reveal-gate-title'));
        assert.equal(byId('reveal-gate-title').getAttribute('tabindex'), '-1');
        assert.equal(byId('reveal-live').textContent, `بازیکن ۱ از ۸: گوشی را به ${isolate('بازیکن ۱')} بدهید`);
    });

    it('a stray "hide" with no card open does nothing: nobody is skipped', () => {
        deal();
        dispatch({ type: 'REVEAL_HIDE' });
        dispatch({ type: 'REVEAL_HIDE' });
        assert.deepEqual(gameState.reveal, { index: 0 });
        assert.equal(gameState.phase, 'reveal');
    });
});

describe('the role cards', () => {
    it('the card appears only after "I am", shows the dealt role, and moves the focus to the role', () => {
        deal();
        assert.equal(cardTexts(), null);
        const texts = peek();
        const role = gameState.game.setup.players[0].role;
        assert.ok(texts.includes(roleName(role)), `${role} on the card: ${texts}`);
        assert.equal(byId('reveal-card').classList.contains('hidden'), false);
        assert.equal(byId('reveal-gate').classList.contains('hidden'), true);
        assert.equal(FakeElement.lastFocused.textContent, roleName(role));
        assert.equal(byId('reveal-live').textContent, fa['reveal.live.card']);
        assert.ok(!byId('reveal-live').textContent.includes(roleName(role)), 'the live line never says the role');
    });

    it('hiding takes the whole card out of the page: no role name, no description, no teammate name is left', () => {
        deal();
        peek();
        dispatch({ type: 'REVEAL_HIDE' });
        assert.equal(cardTexts(), null);
        assert.equal(byId('reveal-card-body').children.length, 0);
        const page = JSON.stringify([...document.querySelectorAll('.screen-view')].map(() => 0)) + [byId('reveal-gate-title'), byId('btn-reveal-show'), byId('reveal-progress'), byId('reveal-live')].map((el) => el.textContent).join('|');
        for (const role of ['mafia', 'godfather', 'doctor', 'detective', 'citizen']) {
            assert.ok(!page.includes(roleName(role)), `${role} still in the page`);
        }
    });

    it('every player of 3, 8 and 20 sees the role the game dealt, and the mafia team sees its own names', () => {
        for (const count of [3, 8, 20]) {
            env.storage.delete(SAVE_KEY); // the game of the round before is over: no save, so no question on "deal"
            reload();
            resetSetupForm();
            go('setup');
            byId('setup-players-count').value = String(count);
            dispatch({ type: 'SET_PLAYERS_COUNT' });
            if (count >= 6) byId('setup-godfather').checked = true;
            dispatch({ type: 'DEAL_GAME' });
            const { players } = gameState.game.setup;
            assert.equal(players.length, count);
            players.forEach((player, i) => {
                assert.equal(byId('reveal-progress').textContent, `بازیکن ${String(i + 1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} از ${String(count).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])}`);
                const texts = peek();
                assert.ok(texts.includes(roleName(player.role)), `${count} players, ${player.name}: ${player.role}`);
                const team = players.filter((p) => p !== player && MAFIA_TEAM.includes(p.role)).map((p) => p.name);
                const shown = texts.join('\n');
                if (MAFIA_TEAM.includes(player.role)) {
                    for (const mate of team) assert.ok(shown.includes(mate), `${player.name} should see ${mate}`);
                    if (team.length === 0) assert.ok(shown.includes(fa['reveal.card.alone']));
                } else {
                    for (const mate of players.filter((p) => MAFIA_TEAM.includes(p.role))) assert.ok(!shown.includes(mate.name), `${player.name} must not see ${mate.name}`);
                }
                dispatch({ type: 'REVEAL_HIDE' });
                assert.equal(cardTexts(), null);
            });
            assert.equal(gameState.phase, 'moderator', `${count} players: after the last card`);
        }
    });

    it('the last card says "hand back to the moderator" and finishing goes to the moderator\'s screen with the index reset', () => {
        deal();
        for (let i = 0; i < 7; i++) {
            peek();
            assert.equal(byId('btn-reveal-hide').textContent, fa['reveal.card.hide']);
            dispatch({ type: 'REVEAL_HIDE' });
        }
        peek();
        assert.equal(byId('btn-reveal-hide').textContent, fa['reveal.card.hideLast']);
        dispatch({ type: 'REVEAL_HIDE' });
        assert.equal(gameState.phase, 'moderator');
        assert.deepEqual(gameState.reveal, { index: 0 });
        assert.deepEqual(visibleScreens(), ['moderator']);
        // The last card must not stay behind in the (now hidden) reveal screen: it is taken out of the page too.
        assert.equal(byId('reveal-card-body').children.length, 0);
    });

    it('the card is in English in English', () => {
        setLang('en');
        resetSetupForm();
        deal();
        const texts = peek();
        assert.ok(texts.includes(en[`role.${gameState.game.setup.players[0].role}.name`]));
        assert.equal(texts[0], `${isolate('Player 1')}’s card`);
    });
});

describe('progress is saved at every hand-off', () => {
    it('after each "hide" the save holds the next player\'s index, and the phase moderator after the last', () => {
        deal();
        for (let i = 0; i < 8; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
            const state = savedRecord().state;
            if (i < 7) {
                assert.equal(state.phase, 'reveal');
                assert.deepEqual(state.reveal, { index: i + 1 }, `after player ${i + 1}`);
            } else {
                assert.equal(state.phase, 'moderator');
                assert.deepEqual(state.reveal, { index: 0 });
            }
        }
    });

    it('showing a card does not move the progress: a reload with the card open still has that player to go', () => {
        deal();
        peek();
        dispatch({ type: 'REVEAL_HIDE' });
        peek();
        assert.deepEqual(savedRecord().state.reveal, { index: 1 });
    });
});

describe('a reload', () => {
    it('in the middle of the reveal: the welcome screen offers "resume", and resuming lands on the NEXT player\'s gate, never on a card', () => {
        deal();
        for (let i = 0; i < 3; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
        }
        const game = gameState.game;
        reload();
        assert.equal(gameState.phase, 'welcome');
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), false, 'the resume button is offered');
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(gameState.game, game);
        assert.deepEqual(gameState.reveal, { index: 3 });
        assert.equal(byId('reveal-gate-title').textContent, `گوشی را به ${isolate('بازیکن ۴')} بدهید`);
        assert.equal(cardTexts(), null);
        assert.equal(byId('reveal-card').classList.contains('hidden'), true);
        assert.equal(session.revealCardOpen, false);
    });

    it('with a card open: it comes back as the gate of that same player (they never lose their turn)', () => {
        deal();
        peek();
        dispatch({ type: 'REVEAL_HIDE' });
        peek();
        assert.notEqual(cardTexts(), null);
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(byId('reveal-gate-title').textContent, `گوشی را به ${isolate('بازیکن ۲')} بدهید`);
        assert.equal(cardTexts(), null);
    });

    it('on the moderator screen: it comes back there with the roles hidden', () => {
        deal();
        for (let i = 0; i < 8; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
        }
        dispatch({ type: 'TOGGLE_ROLES' });
        assert.equal(session.rolesShown, true);
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(gameState.phase, 'moderator');
        assert.equal(session.rolesShown, false);
        assert.equal(byId('moderator-list').children.length, 8);
        assert.ok(byId('moderator-list').children.every((row) => row.children.length === 1), 'names only, no role');
    });

    it('resuming does not change the language and does not leave the welcome screen offering the button once the game is gone', () => {
        deal();
        reload();
        assert.equal(getLang(), 'fa');
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(getLang(), 'fa');
        dispatch({ type: 'CONFIRM_LEAVE_REVEAL' });
        answerConfirm(true);
        go('welcome');
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
    });

    it('with no save, or a damaged one: the resume button stays hidden and "resume" does nothing', () => {
        syncResumeButton();
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
        env.storage.set(SAVE_KEY, '{ damaged');
        syncResumeButton();
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.game, null);
    });

    it('a game saved by a tampered record is not resumed', () => {
        deal();
        const record = savedRecord();
        record.state.game.setup.players[0].role = 'wizard';
        env.storage.set(SAVE_KEY, JSON.stringify(record));
        reload();
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(gameState.phase, 'welcome');
    });
});

describe("the moderator's screen", () => {
    function toModerator() {
        deal();
        for (let i = 0; i < 8; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
        }
    }

    it('opens with every player\'s name and no role anywhere, and the button offers to show them', () => {
        toModerator();
        const rows = byId('moderator-list').children;
        assert.equal(rows.length, 8);
        rows.forEach((row, i) => {
            assert.equal(row.children.length, 1, 'only the name');
            assert.equal(row.children[0].textContent, gameState.game.setup.players[i].name);
        });
        assert.equal(byId('btn-roles-toggle').textContent, fa['moderator.roles.show']);
        assert.equal(session.rolesShown, false);
    });

    it('"show roles" adds each player\'s role, "hide roles" takes them out of the page again', () => {
        toModerator();
        dispatch({ type: 'TOGGLE_ROLES' });
        byId('moderator-list').children.forEach((row, i) => {
            assert.equal(row.children[1].textContent, roleName(gameState.game.setup.players[i].role));
        });
        assert.equal(byId('btn-roles-toggle').textContent, fa['moderator.roles.hide']);
        dispatch({ type: 'TOGGLE_ROLES' });
        assert.ok(byId('moderator-list').children.every((row) => row.children.length === 1));
        assert.equal(byId('btn-roles-toggle').textContent, fa['moderator.roles.show']);
    });

    it('the mafia team\'s roles are marked, the others not', () => {
        toModerator();
        dispatch({ type: 'TOGGLE_ROLES' });
        byId('moderator-list').children.forEach((row, i) => {
            const marked = row.children[1].classList.contains('is-mafia');
            assert.equal(marked, MAFIA_TEAM.includes(gameState.game.setup.players[i].role));
        });
    });

    it('the roles are hidden when the page is hidden (pagehide and visibilitychange both ask for it)', () => {
        toModerator();
        dispatch({ type: 'TOGGLE_ROLES' });
        dispatch({ type: 'HIDE_SECRETS' });
        assert.equal(session.rolesShown, false);
        assert.ok(byId('moderator-list').children.every((row) => row.children.length === 1));
        assert.equal(byId('btn-roles-toggle').textContent, fa['moderator.roles.show']);
    });

    it('the roles are hidden again every time the screen opens', () => {
        toModerator();
        dispatch({ type: 'TOGGLE_ROLES' });
        go('moderator');
        assert.equal(session.rolesShown, false);
        assert.ok(byId('moderator-list').children.every((row) => row.children.length === 1));
    });

    it('lists the rules this game is played by, one line each, from the typed form', () => {
        go('setup');
        byId('setup-godfather').checked = true;
        byId('setup-doctor-save').value = 'never';
        byId('setup-reveal-death').checked = false;
        dispatch({ type: 'DEAL_GAME' });
        for (let i = 0; i < 8; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
        }
        assert.deepEqual(byId('moderator-rules').children.map((li) => li.textContent), [
            fa['moderator.rule.selfSave.never'],
            fa['moderator.rule.godfather.on'],
            fa['moderator.rule.revealRole.off']
        ]);
    });

    it('"new game" asks first, and on "yes" the game, its save and the form are gone and the welcome screen is back', () => {
        toModerator();
        dispatch({ type: 'CONFIRM_NEW_GAME' });
        assert.equal(byId('confirm-modal-title').textContent, fa['confirm.discard.title']);
        assert.equal(gameState.phase, 'moderator', 'not yet');
        answerConfirm(false);
        assert.equal(gameState.phase, 'moderator');
        assert.notEqual(savedRecord(), null);
        dispatch({ type: 'CONFIRM_NEW_GAME' });
        answerConfirm(true);
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.game, null);
        assert.equal(savedRecord(), null);
        assert.equal(byId('btn-resume-game').classList.contains('hidden'), true);
        assert.deepEqual(visibleScreens(), ['welcome']);
    });

    it('"new game" does nothing outside the moderator screen', () => {
        dispatch({ type: 'CONFIRM_NEW_GAME' });
        assert.equal(session.pendingConfirmAction, null);
    });
});

describe('the roles shown while the page is hidden', () => {
    it('a role card goes back to its gate (same player) and leaves no text behind', () => {
        deal();
        peek();
        dispatch({ type: 'REVEAL_HIDE' });
        peek();
        dispatch({ type: 'HIDE_SECRETS' });
        assert.equal(cardTexts(), null);
        assert.equal(session.revealCardOpen, false);
        assert.deepEqual(gameState.reveal, { index: 1 });
        assert.equal(byId('reveal-gate-title').textContent, `گوشی را به ${isolate('بازیکن ۲')} بدهید`);
    });

    it('does nothing on the welcome and setup screens', () => {
        const before = JSON.stringify(gameState);
        dispatch({ type: 'HIDE_SECRETS' });
        go('setup');
        dispatch({ type: 'HIDE_SECRETS' });
        assert.equal(JSON.stringify(gameState), before.replace('"welcome"', '"setup"'));
    });
});

describe('leaving the reveal', () => {
    it('"back" asks first; on "yes" the game and its save are discarded and the setup form is fresh', () => {
        deal();
        peek();
        dispatch({ type: 'REVEAL_HIDE' });
        dispatch({ type: 'CONFIRM_LEAVE_REVEAL' });
        assert.equal(byId('confirm-modal-title').textContent, fa['confirm.discard.title']);
        answerConfirm(false);
        assert.equal(gameState.phase, 'reveal');
        assert.deepEqual(gameState.reveal, { index: 1 });
        dispatch({ type: 'CONFIRM_LEAVE_REVEAL' });
        answerConfirm(true);
        assert.equal(gameState.phase, 'setup');
        assert.equal(gameState.game, null);
        assert.deepEqual(gameState.reveal, { index: 0 });
        assert.equal(savedRecord(), null);
        assert.equal(session.revealCardOpen, false);
        assert.equal(names()[0], 'بازیکن ۱');
    });

    it('is not offered outside the reveal phase', () => {
        dispatch({ type: 'CONFIRM_LEAVE_REVEAL' });
        assert.equal(session.pendingConfirmAction, null);
    });
});

describe('the language is locked while a game is on screen', () => {
    it('SET_LANG is ignored on the reveal and the moderator screens, and works again after "new game"', () => {
        deal();
        dispatch({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'fa', 'reveal');
        for (let i = 0; i < 8; i++) {
            peek();
            dispatch({ type: 'REVEAL_HIDE' });
        }
        dispatch({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'fa', 'moderator');
        dispatch({ type: 'CONFIRM_NEW_GAME' });
        answerConfirm(true);
        dispatch({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'en', 'welcome again');
    });
});

describe('the focus and the live line at every step', () => {
    it('each gate and each card moves the focus to its own heading', () => {
        deal();
        for (let i = 0; i < 3; i++) {
            assert.equal(FakeElement.lastFocused, byId('reveal-gate-title'), `gate ${i + 1}`);
            peek();
            assert.equal(FakeElement.lastFocused.getAttribute('tabindex'), '-1');
            assert.equal(FakeElement.lastFocused.textContent, roleName(gameState.game.setup.players[i].role), `card ${i + 1}`);
            dispatch({ type: 'REVEAL_HIDE' });
        }
    });
});
