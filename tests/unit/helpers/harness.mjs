/**
 * Shared test plumbing for the tests that drive the app: pristine singletons and recorders for the seams in
 * core/phase.js (renderer) and core/dispatch.js (action handler).
 *
 * This file only imports modules that are safe to load without a browser, so it can be imported
 * statically before `installFakeEnv()` runs.
 */
import { afterEach, beforeEach } from 'node:test';
import { setDispatchHandler } from '../../../js/core/dispatch.js';
import { setBeforePhaseChange, setRenderer } from '../../../js/core/phase.js';
import { gameState, replaceGameState, session } from '../../../js/core/state.js';

// Taken while this module loads, before any test can touch the singletons.
const INITIAL_GAME = structuredClone(gameState);
const INITIAL_SESSION = structuredClone(session);

/** Put gameState and session back to their start-up values (fresh copies). */
export function resetSingletons() {
    replaceGameState(structuredClone(INITIAL_GAME));
    Object.assign(session, structuredClone(INITIAL_SESSION));
}

/** A player as a match will hold one (step 2 gives players their real fields), with any field overridden. */
export function makePlayer(id, overrides = {}) {
    return { id, name: `Player ${id}`, ...overrides };
}

/** Players with ids p1..pN. */
export function makePlayers(count) {
    return Array.from({ length: count }, (_, i) => makePlayer(`p${i + 1}`));
}

/**
 * Registers beforeEach/afterEach hooks for the calling test file (call it once, at the top level):
 * fresh singletons and fake DOM, a manual clock as the global timers, a renderer that records the
 * phase it was asked to draw, and a dispatch handler that records every action.
 *
 * Returns `{ renders, actions }`. Both arrays are emptied before each test.
 * `setup` runs last in beforeEach, `teardown` first in afterEach (before the fakes are reset).
 */
export function useGameHarness(env, { setup, teardown } = {}) {
    const recorded = { renders: [], actions: [] };
    beforeEach(() => {
        env.reset();
        env.installTimers();
        resetSingletons();
        recorded.renders.length = 0;
        recorded.actions.length = 0;
        setRenderer(() => recorded.renders.push(gameState.phase));
        setDispatchHandler((action) => recorded.actions.push(action));
        if (setup) setup();
    });
    afterEach(() => {
        if (teardown) teardown();
        setRenderer(null);
        setBeforePhaseChange(null);
        setDispatchHandler(null);
        env.reset();
    });
    return recorded;
}
