/**
 * ui/bindings.js: every control of the page becomes one dispatch() call (or, for the page itself, a wake lock
 * request and a save). The page is faked, the real `bindEvents` is run on it, and the tests press the controls the
 * way the browser would (call the handler it was given) and read what reached the dispatch seam.
 *
 * The same ids are checked against the real index.html, so a button cannot be renamed in one place only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { SAVE_VERSION, gameState, session } from '../../js/core/state.js';
import { SAVE_KEY } from '../../js/core/storage.js';
import { elements, parseHtml } from './helpers/htmlScan.mjs';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { newGame } from './helpers/gameKit.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { bindEvents } = await import('../../js/ui/bindings.js');

const CONTROL_IDS = [
    'theme-selector',
    'btn-nav-setup',
    'btn-resume-game',
    'btn-back-welcome-2',
    'setup-players-count',
    'btn-deal',
    'btn-info-modal-close',
    'btn-reveal-show',
    'btn-reveal-hide',
    'btn-reveal-back',
    'btn-roles-toggle',
    'btn-new-game',
    'btn-confirm-yes',
    'btn-confirm-no'
];

let langButtons;
let infoButtons;
const recorded = useGameHarness(env, {
    setup: () => {
        for (const id of CONTROL_IDS) env.el(id);
        langButtons = ['fa', 'en'].map((code) => {
            const button = new FakeElement(`btn-lang-${code}`, 'button');
            button.dataset.lang = code;
            return button;
        });
        env.stubQuery('.lang-btn', langButtons);
        infoButtons = ['doctorSelfSave', 'godfather', 'revealRoleOnDeath'].map((key) => {
            const button = new FakeElement(`btn-info-${key}`, 'button');
            button.dataset.info = key;
            return button;
        });
        env.stubQuery('.info-btn', infoButtons);
        document.visibilityState = 'visible';
    },
    teardown: () => {
        delete document.visibilityState;
    }
});
after(() => env.uninstall());

const listenersOf = (target, type) => env.logs.listeners.filter((l) => l.target === target && l.type === type);
const actions = () => recorded.actions;

describe('bindEvents: one control, one action', () => {
    it('each language button asks for the language written on it', () => {
        bindEvents();
        langButtons[1].onclick();
        langButtons[0].onclick();
        assert.deepEqual(actions(), [
            { type: 'SET_LANG', payload: 'en' },
            { type: 'SET_LANG', payload: 'fa' }
        ]);
    });

    it('the theme selector asks for the theme it now shows', () => {
        bindEvents();
        for (const value of ['noir', 'ocean', 'default']) env.el('theme-selector').onchange({ target: { value } });
        assert.deepEqual(actions(), [
            { type: 'CHANGE_THEME', payload: 'noir' },
            { type: 'CHANGE_THEME', payload: 'ocean' },
            { type: 'CHANGE_THEME', payload: 'default' }
        ]);
    });

    it('the start button goes to the setup screen, and the back button goes back to the welcome screen', () => {
        bindEvents();
        env.el('btn-nav-setup').onclick();
        env.el('btn-back-welcome-2').onclick();
        assert.deepEqual(actions(), [
            { type: 'NAVIGATE', payload: 'setup' },
            { type: 'NAVIGATE', payload: 'welcome' }
        ]);
    });

    it('the players-count field is judged when the person is done with it (change), not on every key', () => {
        bindEvents();
        const field = env.el('setup-players-count');
        assert.deepEqual(Object.keys(field.listeners), ['change'], 'only the change event is listened to');
        assert.equal(field.listeners.change.length, 1);
        field.listeners.change[0]();
        assert.deepEqual(actions(), [{ type: 'SET_PLAYERS_COUNT' }]);
    });

    it('the resume button resumes, the deal button deals', () => {
        bindEvents();
        env.el('btn-resume-game').onclick();
        env.el('btn-deal').onclick();
        assert.deepEqual(actions(), [{ type: 'RESUME_GAME' }, { type: 'DEAL_GAME' }]);
    });

    it('the reveal buttons show the card, hide it and pass on, and ask to leave', () => {
        bindEvents();
        env.el('btn-reveal-show').onclick();
        env.el('btn-reveal-hide').onclick();
        env.el('btn-reveal-back').onclick();
        assert.deepEqual(actions(), [{ type: 'REVEAL_SHOW' }, { type: 'REVEAL_HIDE' }, { type: 'CONFIRM_LEAVE_REVEAL' }]);
    });

    it('the moderator buttons toggle the roles and ask for a new game', () => {
        bindEvents();
        env.el('btn-roles-toggle').onclick();
        env.el('btn-new-game').onclick();
        assert.deepEqual(actions(), [{ type: 'TOGGLE_ROLES' }, { type: 'CONFIRM_NEW_GAME' }]);
    });

    it('each (i) button opens the help text of its own option, and the help modal closes', () => {
        bindEvents();
        env.el('info-modal-title');
        env.el('info-modal-desc');
        for (const button of infoButtons) button.onclick();
        env.el('btn-info-modal-close').onclick();
        const opened = actions().filter((a) => a.type === 'OPEN_MODAL');
        assert.deepEqual(opened, [1, 2, 3].map(() => ({ type: 'OPEN_MODAL', payload: 'info-modal' })));
        assert.equal(env.el('info-modal-title').textContent.length > 0, true, 'the title was written');
        assert.deepEqual(actions().at(-1), { type: 'CLOSE_MODAL', payload: 'info-modal' });
    });

    it('wires nothing by itself: no action is dispatched while binding', () => {
        bindEvents();
        assert.deepEqual(actions(), []);
    });
});

describe('bindEvents: the confirm modal', () => {
    it('"yes" closes the modal first, then runs the waiting callback once, and forgets it', () => {
        bindEvents();
        const order = [];
        session.pendingConfirmAction = () => order.push(`callback after ${actions().length} action(s)`);
        env.el('btn-confirm-yes').onclick();
        assert.deepEqual(actions(), [{ type: 'CLOSE_MODAL', payload: 'confirm-modal' }]);
        assert.deepEqual(order, ['callback after 1 action(s)'], 'the modal was already closed when the callback ran');
        assert.equal(session.pendingConfirmAction, null);
        env.el('btn-confirm-yes').onclick();
        assert.equal(order.length, 1, 'a second press does not run it again');
    });

    it('"yes" with nothing waiting just closes the modal', () => {
        bindEvents();
        session.pendingConfirmAction = null;
        assert.doesNotThrow(() => env.el('btn-confirm-yes').onclick());
        assert.deepEqual(actions(), [{ type: 'CLOSE_MODAL', payload: 'confirm-modal' }]);
    });

    it('"yes" clears the waiting callback even when the callback throws, so it can never run twice', () => {
        bindEvents();
        session.pendingConfirmAction = () => {
            throw new Error('boom');
        };
        assert.throws(() => env.el('btn-confirm-yes').onclick(), /boom/);
        assert.equal(session.pendingConfirmAction, null);
    });

    it('"cancel" closes the modal and drops the waiting callback without running it', () => {
        bindEvents();
        let ran = false;
        session.pendingConfirmAction = () => {
            ran = true;
        };
        env.el('btn-confirm-no').onclick();
        assert.equal(ran, false);
        assert.equal(session.pendingConfirmAction, null);
        assert.deepEqual(actions(), [{ type: 'CLOSE_MODAL', payload: 'confirm-modal' }]);
    });
});

describe('bindEvents: the page itself', () => {
    it('registers one visibilitychange listener on the document and one pagehide listener on the window, and no others', () => {
        bindEvents();
        assert.equal(listenersOf('document', 'visibilitychange').length, 1);
        assert.equal(listenersOf('window', 'pagehide').length, 1);
        assert.equal(env.logs.listeners.length, 2);
    });

    it('asks for the screen wake lock when the page becomes visible again, and not when it is hidden', async () => {
        bindEvents();
        const [{ fn }] = listenersOf('document', 'visibilitychange');
        document.visibilityState = 'hidden';
        await fn();
        assert.deepEqual(env.logs.wakeLocks, []);
        document.visibilityState = 'visible';
        await fn();
        assert.deepEqual(env.logs.wakeLocks, ['screen']);
    });

    it('hides the secrets (a role card, the roles of the list) when the page goes out of sight, and only then', async () => {
        bindEvents();
        const [{ fn }] = listenersOf('document', 'visibilitychange');
        document.visibilityState = 'visible';
        await fn();
        assert.deepEqual(actions(), [], 'nothing is hidden when the page comes back');
        document.visibilityState = 'hidden';
        await fn();
        assert.deepEqual(actions(), [{ type: 'HIDE_SECRETS' }]);
    });

    it('hides the secrets and saves the game when the page is hidden for good (pagehide), in the versioned record', () => {
        bindEvents();
        gameState.game = newGame(3);
        gameState.phase = 'reveal';
        const [{ fn }] = listenersOf('window', 'pagehide');
        fn();
        assert.deepEqual(actions(), [{ type: 'HIDE_SECRETS' }]);
        const saved = JSON.parse(env.storage.get(SAVE_KEY));
        assert.equal(saved.version, SAVE_VERSION);
        assert.deepEqual(saved.state.game, gameState.game);
        assert.equal(saved.state.phase, 'reveal');
    });

    it('saves nothing on pagehide while there is no game (welcome or setup)', () => {
        bindEvents();
        for (const phase of ['welcome', 'setup']) {
            gameState.phase = phase;
            listenersOf('window', 'pagehide')[0].fn();
        }
        assert.equal(env.storage.size, 0);
    });
});

describe('the ids bindEvents uses exist in index.html', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const ids = new Set([...elements(parseHtml(html))].map((el) => el.attrs.id).filter(Boolean));
    const source = readFileSync(new URL('../../js/ui/bindings.js', import.meta.url), 'utf8');
    const used = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

    it('finds the ids in the source (so the check below is not empty)', () => {
        assert.ok(used.length >= CONTROL_IDS.length, used.join(', '));
        for (const id of CONTROL_IDS) assert.ok(used.includes(id), id);
    });

    it('every one of them is an element of the page', () => {
        for (const id of used) assert.ok(ids.has(id), `index.html has no #${id}`);
    });

    it('the language buttons of the page carry the codes the action expects', () => {
        const buttons = [...elements(parseHtml(html))].filter((el) => (el.attrs.class || '').split(/\s+/).includes('lang-btn'));
        assert.deepEqual(buttons.map((b) => b.attrs['data-lang']).sort(), ['en', 'fa']);
    });

    it('the bound ids are unique in the page (a duplicate would bind the first and ignore the second)', () => {
        const all = [...elements(parseHtml(html))].map((el) => el.attrs.id).filter(Boolean);
        for (const id of used) assert.equal(all.filter((x) => x === id).length, 1, id);
    });
});
