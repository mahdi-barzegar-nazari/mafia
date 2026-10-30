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
import { makePlayers, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { bindEvents } = await import('../../js/ui/bindings.js');

const CONTROL_IDS = ['theme-selector', 'btn-nav-setup', 'btn-back-welcome-2', 'setup-players-count', 'btn-confirm-yes', 'btn-confirm-no'];

let langButtons;
const recorded = useGameHarness(env, {
    setup: () => {
        for (const id of CONTROL_IDS) env.el(id);
        langButtons = ['fa', 'en'].map((code) => {
            const button = new FakeElement(`btn-lang-${code}`, 'button');
            button.dataset.lang = code;
            return button;
        });
        env.stubQuery('.lang-btn', langButtons);
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

    it('saves a match when the page is hidden for good (pagehide), in the versioned record', () => {
        bindEvents();
        gameState.players = makePlayers(3);
        const [{ fn }] = listenersOf('window', 'pagehide');
        fn();
        const saved = JSON.parse(env.storage.get(SAVE_KEY));
        assert.equal(saved.version, SAVE_VERSION);
        assert.equal(saved.state.players.length, 3);
    });

    it('saves nothing on pagehide while there is no match (welcome or setup)', () => {
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
