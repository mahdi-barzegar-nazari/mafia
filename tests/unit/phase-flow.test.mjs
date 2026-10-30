/**
 * The phase machine of this step end to end: welcome -> setup -> back to welcome, through the real seams
 * (`wireApp` installs the real handler and the real renderer behind `dispatch` and `commitState`) and a fake page
 * with the two screens of index.html. The rule it protects: a phase is the only thing that decides which screen
 * is shown, and an unknown phase changes nothing, so step 2 can add phases without restructuring.
 */
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { gameState } from '../../js/core/state.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { resetSingletons } from './helpers/harness.mjs';

const env = installFakeEnv();
const { wireApp } = await import('../../js/app/wire.js');
const { dispatch, setDispatchHandler } = await import('../../js/core/dispatch.js');
const { isMatchInProgress, setBeforePhaseChange, setPhase, setRenderer } = await import('../../js/core/phase.js');
const { renderUI } = await import('../../js/ui/render.js');

/** The page: two `.screen-view` sections, each with a heading, and the second one hidden as in index.html. */
function buildPage() {
    const page = {};
    for (const name of ['welcome', 'setup']) {
        const screen = env.el(`screen-${name}`);
        screen.classList.add('screen-view');
        if (name !== 'welcome') screen.classList.add('hidden');
        const heading = new FakeElement(`${name}-heading`, name === 'welcome' ? 'h1' : 'h2');
        screen.queries['h1, h2, h3'] = heading;
        page[name] = { screen, heading };
    }
    env.stubQuery('.screen-view', [page.welcome.screen, page.setup.screen]);
    return page;
}

let page;
let renders;
beforeEach(() => {
    env.reset();
    env.installTimers();
    resetSingletons();
    page = buildPage();
    wireApp();
    // Count the redraws, and still draw: the real renderer runs inside the wrapper.
    renders = 0;
    setRenderer(() => {
        renders++;
        renderUI();
    });
});
afterEach(() => {
    setRenderer(null);
    setBeforePhaseChange(null);
    setDispatchHandler(null);
    env.reset();
});
after(() => env.uninstall());

const visible = () => ['welcome', 'setup'].filter((name) => !page[name].screen.classList.contains('hidden'));
const go = (phase) => dispatch({ type: 'NAVIGATE', payload: phase });

describe('welcome -> setup -> back', () => {
    it('starts on the welcome screen, outside any match', () => {
        assert.equal(gameState.phase, 'welcome');
        assert.equal(isMatchInProgress(), false);
        assert.deepEqual(visible(), ['welcome'], 'index.html shows the welcome screen first');
    });

    it('NAVIGATE setup shows the setup screen and only that one, and moves the focus to its heading', () => {
        go('setup');
        assert.equal(gameState.phase, 'setup');
        assert.deepEqual(visible(), ['setup']);
        assert.equal(FakeElement.lastFocused, page.setup.heading);
        assert.equal(page.setup.heading.getAttribute('tabindex'), '-1');
        assert.ok(page.setup.screen.classList.contains('screen-anim'));
        assert.equal(isMatchInProgress(), false, 'setup is still outside a match');
    });

    it('NAVIGATE welcome brings the welcome screen back, with the focus on its heading', () => {
        go('setup');
        go('welcome');
        assert.equal(gameState.phase, 'welcome');
        assert.deepEqual(visible(), ['welcome']);
        assert.equal(FakeElement.lastFocused, page.welcome.heading);
        assert.ok(page.welcome.screen.classList.contains('screen-anim'));
    });

    it('every step draws exactly one screen, and a round trip leaves the page as it started', () => {
        const trail = [];
        for (const phase of ['setup', 'welcome', 'setup', 'welcome']) {
            go(phase);
            trail.push([gameState.phase, visible().join(',')]);
        }
        assert.deepEqual(trail, [['setup', 'setup'], ['welcome', 'welcome'], ['setup', 'setup'], ['welcome', 'welcome']]);
        assert.equal(renders, 4);
        assert.equal(isMatchInProgress(), false);
    });

    it('asking for the phase that is already shown redraws it but does not move the focus or restart the animation', () => {
        go('setup');
        FakeElement.lastFocused = null;
        page.setup.screen.classList.remove('screen-anim');
        go('setup');
        assert.deepEqual(visible(), ['setup']);
        assert.equal(FakeElement.lastFocused, null, 'the focus was not pulled back to the heading');
        assert.equal(page.setup.screen.classList.contains('screen-anim'), false);
    });

    it('saves nothing: there is no match yet, so the storage stays empty', () => {
        go('setup');
        go('welcome');
        assert.equal(env.storage.size, 0);
    });

    it('runs the before-phase-change hook with (from, to) for each step, as the seam promises', () => {
        const seen = [];
        setBeforePhaseChange((from, to) => seen.push(`${from}->${to}`));
        go('setup');
        go('welcome');
        assert.deepEqual(seen, ['welcome->setup', 'setup->welcome']);
    });
});

describe('an unknown phase changes nothing', () => {
    it('NAVIGATE to anything that is not a screen of the app is ignored: no state change, no redraw', () => {
        go('setup');
        const before = renders;
        for (const phase of ['reveal', 'vote', 'night', '', 'WELCOME', ' setup', 'constructor', '__proto__', undefined, null, 7, ['setup'], { toString: () => 'setup' }]) {
            go(phase);
            assert.equal(gameState.phase, 'setup', String(phase));
        }
        assert.equal(renders, before);
        assert.deepEqual(visible(), ['setup']);
    });

    it('setPhase itself, called without NAVIGATE in front of it, refuses a phase that is not in VALID_PHASES: no hook, no redraw, no change', () => {
        go('setup');
        const before = renders;
        const hooked = [];
        setBeforePhaseChange((from, to) => hooked.push(`${from}->${to}`));
        for (const phase of ['reveal', 'night', '', 'WELCOME', 'constructor', '__proto__', undefined, null, 7, ['setup']]) {
            setPhase(phase);
            assert.equal(gameState.phase, 'setup', String(phase));
        }
        assert.deepEqual(hooked, []);
        assert.equal(renders, before);
        assert.deepEqual(visible(), ['setup']);
    });

    it('a phase added to VALID_PHASES by a later step works with no other change in the machine', async () => {
        const { VALID_PHASES } = await import('../../js/core/config.js');
        const night = env.el('screen-night');
        night.classList.add('screen-view', 'hidden');
        env.stubQuery('.screen-view', [page.welcome.screen, page.setup.screen, night]);
        VALID_PHASES.add('night');
        try {
            go('night');
            assert.equal(gameState.phase, 'night');
            assert.equal(night.classList.contains('hidden'), false);
            assert.deepEqual(visible(), []);
            assert.equal(isMatchInProgress(), true);
        } finally {
            VALID_PHASES.delete('night');
        }
    });
});

describe('the seams', () => {
    it('commitState fails loudly when nobody installed a renderer, and dispatch when nobody installed a handler', async () => {
        const { commitState } = await import('../../js/core/phase.js');
        setRenderer(null);
        assert.throws(() => commitState(), /renderer/);
        setDispatchHandler(null);
        assert.throws(() => go('setup'), /NAVIGATE.*handler/);
    });

    it('wireApp can be called again: the later call simply replaces the seams', () => {
        wireApp();
        wireApp();
        go('setup');
        assert.equal(gameState.phase, 'setup');
    });
});
