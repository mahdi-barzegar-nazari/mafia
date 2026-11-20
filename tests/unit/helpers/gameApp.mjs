/**
 * The whole app on a fake page, for the tests that press the buttons of the game screens: the real action handler
 * and the real renderer are wired (`wireApp`), the page is the fake one of `gamePage.mjs`, the clock the guard
 * reads is the test's own, and a game can be put on any screen by saving it and resuming it, which is also how a
 * real reload gets there. Call `createGameApp()` once at the top of a test file; it registers the hooks that give
 * every test a fresh page.
 */
import { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeEnv } from './fakeEnv.mjs';
import { resetSingletons } from './harness.mjs';
import { PHASES, buildPage } from './gamePage.mjs';

export async function createGameApp() {
    const env = installFakeEnv();
    const getById = document.getElementById;
    document.getElementById = (id) => getById(id) || (env.el('setup-names').children.find((child) => child.id === id) ?? null);
    const { wireApp } = await import('../../../js/app/wire.js');
    const { dispatch, setDispatchHandler } = await import('../../../js/core/dispatch.js');
    const { setBeforePhaseChange, setRenderer } = await import('../../../js/core/phase.js');
    const { SAVE_VERSION, gameState, session } = await import('../../../js/core/state.js');
    const { SAVE_KEY } = await import('../../../js/core/storage.js');
    const { DEFAULT_LANG, getLang, setLang } = await import('../../../js/i18n/index.js');
    const { setNow, resetNow } = await import('../../../js/ui/clock.js');
    const { HAND_OFF_GUARD_MS } = await import('../../../js/core/config.js');
    const { resetSetupForm } = await import('../../../js/ui/setup.js');
    const { syncResumeButton } = await import('../../../js/ui/resume.js');
    const { getState } = await import('../../../js/game/engine.js');
    const { bindEvents } = await import('../../../js/ui/bindings.js');

    const byId = (id) => env.el(id);
    const screen = (name) => env.el(`screen-${name}`);
    const clock = { now: 1000 };
    const wait = (ms) => {
        clock.now += ms;
    };

    /** A fresh page with the real app on it: wired, bound and drawn once, as the welcome screen. */
    function boot() {
        buildPage(env);
        for (const id of ['theme-selector', 'btn-nav-setup', 'btn-back-welcome-2', 'btn-deal', 'btn-info-modal-close', 'btn-reveal-back', 'btn-confirm-yes', 'btn-confirm-no']) env.el(id);
        document.visibilityState = 'visible';
        env.stubQuery('.lang-btn', []);
        env.stubQuery('.info-btn', []);
        wireApp();
        bindEvents();
        resetSetupForm();
        // The renderer remembers the screen it drew last (for the focus and the live line); a new page has drawn none.
        dispatch({ type: 'NAVIGATE', payload: 'welcome' });
    }

    beforeEach(() => {
        env.reset();
        env.installTimers();
        env.seedRandom(7);
        resetSingletons();
        clock.now = 1000;
        setNow(() => clock.now);
        boot();
    });
    afterEach(() => {
        setLang(DEFAULT_LANG);
        setRenderer(null);
        setBeforePhaseChange(null);
        setDispatchHandler(null);
        delete document.body;
        delete document.documentElement;
        resetNow();
        env.reset();
    });
    after(() => env.uninstall());

    /** The save record of a game on the screen `phase` (the engine's own phase for a game past the reveal). */
    function record(game, { phase, index = 0 } = {}) {
        const derived = getState(game).phase;
        return JSON.stringify({ version: SAVE_VERSION, state: { version: 1, phase: phase ?? derived, settings: {}, reveal: { index }, game } });
    }

    /** What a reload does: the page and every singleton start over; only localStorage survives. */
    function reload() {
        const saved = env.storage.get(SAVE_KEY);
        const lang = getLang();
        env.reset();
        env.seedRandom(8);
        resetSingletons();
        boot();
        if (saved !== undefined) env.storage.set(SAVE_KEY, saved);
        setLang(lang);
        syncResumeButton();
    }

    /** Put `game` on screen the way a resume does: save it, start the page over, press "resume". */
    function show(game, options) {
        env.storage.set(SAVE_KEY, record(game, options));
        reload();
        dispatch({ type: 'RESUME_GAME' });
        assert.equal(session.cardHiddenAt, null);
    }

    const visibleScreens = () => PHASES.filter((name) => !screen(name).classList.contains('hidden'));

    /** Every text in the subtree of an element, joined, for "this is (not) in the page" checks. */
    function textOf(el) {
        const own = el.textContent ?? '';
        return [own, ...(el.children ?? []).map(textOf)].join('\n');
    }

    /** Press the n-th target button of the night, the way a finger does (the handler the screen built). */
    const pressTarget = (index) => byId('night-targets').children[index].children[0].onclick();
    const targetNames = () => byId('night-targets').children.map((li) => li.children[0].children[0].textContent);
    const pressed = () => byId('night-targets').children.map((li) => li.children[0].getAttribute('aria-pressed'));

    return { env, byId, screen, clock, wait, record, reload, show, visibleScreens, textOf, pressTarget, targetNames, pressed, dispatch, gameState, session, getState, HAND_OFF_GUARD_MS, SAVE_KEY, setLang, getLang };
}
