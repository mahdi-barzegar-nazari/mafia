/**
 * The language switch, below the click: the SET_LANG action (app/actions.js), the rule behind it
 * (`isMatchInProgress` in core/phase.js) and the pressed state of the two buttons (`syncLangSwitch` in
 * ui/langSwitch.js). The click handler itself is one line in ui/bindings.js (tests/unit/bindings.test.mjs) and the
 * real buttons are checked in the browser by tests/e2e/lang-switch.test.mjs.
 *
 * Everything runs on the fake browser of helpers/fakeEnv.mjs, with the real handleAction.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { gameState } from '../../js/core/state.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { isMatchInProgress } = await import('../../js/core/phase.js');
const { getLang, onLangChange, setLang } = await import('../../js/i18n/index.js');
const { syncLangSwitch } = await import('../../js/ui/langSwitch.js');
const { VALID_PHASES } = await import('../../js/core/config.js');

useGameHarness(env);
after(() => env.uninstall());
// A test that switches language must not leak it into the next one.
afterEach(() => setLang('fa'));

const LANG_KEY = 'mafia_lang';
const savedLang = () => env.storage.get(LANG_KEY);

/** The language changes the app announced while `fn` ran. */
function watchLang(fn) {
    const seen = [];
    const stop = onLangChange((lang) => seen.push(lang));
    try {
        fn();
    } finally {
        stop();
    }
    return seen;
}

const OUTSIDE_A_MATCH = ['welcome', 'setup'];
const INSIDE_A_MATCH = [...VALID_PHASES].filter((phase) => !OUTSIDE_A_MATCH.includes(phase));

describe('isMatchInProgress', () => {
    it('is false on the welcome screen and the setup form, true in every phase of a match', () => {
        for (const phase of OUTSIDE_A_MATCH) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), false, phase);
        }
        for (const phase of INSIDE_A_MATCH) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), true, phase);
        }
    });

    it('covers every phase the app knows (a new phase has to be placed on purpose: step 2 lists its match phases here)', () => {
        assert.deepEqual(INSIDE_A_MATCH, []);
    });

    it('counts a phase it does not know as a match in progress, so a damaged state can never unlock the switch', () => {
        for (const phase of ['bogus', '', undefined, null, 42, ['welcome']]) {
            gameState.phase = phase;
            assert.equal(isMatchInProgress(), true, String(phase));
        }
    });

    it('treats a phase added to VALID_PHASES as a match phase until it is listed as outside a match', () => {
        VALID_PHASES.add('night');
        try {
            gameState.phase = 'night';
            assert.equal(isMatchInProgress(), true);
            handleAction({ type: 'SET_LANG', payload: 'en' });
            assert.equal(getLang(), 'fa', 'the switch is locked in the new phase');
        } finally {
            VALID_PHASES.delete('night');
        }
    });
});

describe('SET_LANG: accepted', () => {
    it('switches to English on the welcome screen, saves the choice in mafia_lang and tells the listeners once', () => {
        gameState.phase = 'welcome';
        const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'en' }));
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
        assert.deepEqual(seen, ['en']);
    });

    it('switches back to Persian, and the saved choice follows', () => {
        gameState.phase = 'welcome';
        handleAction({ type: 'SET_LANG', payload: 'en' });
        const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'fa' }));
        assert.equal(getLang(), 'fa');
        assert.equal(savedLang(), 'fa');
        assert.deepEqual(seen, ['fa']);
    });

    it('is also accepted on the setup form (no match exists yet)', () => {
        gameState.phase = 'setup';
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
    });

    it('never touches a key of another app: the only key written is mafia_lang', () => {
        gameState.phase = 'welcome';
        handleAction({ type: 'SET_LANG', payload: 'en' });
        assert.deepEqual([...env.storage.keys()], [LANG_KEY]);
    });
});

describe('SET_LANG: ignored', () => {
    const NOT_A_LANGUAGE = ['de', '__proto__', 'constructor', 'toString', 'EN', ' en', 'en ', 'en-US', '', undefined, null, 0, 1, true, {}, ['en'], ['fa'], ['en', 'fa'], { toString: () => 'en' }];

    it('ignores a value that is not a supported language code, and saves and announces nothing', () => {
        gameState.phase = 'welcome';
        for (const payload of NOT_A_LANGUAGE) {
            const seen = watchLang(() => handleAction({ type: 'SET_LANG', payload }));
            assert.equal(getLang(), 'fa', String(payload));
            assert.deepEqual(seen, [], String(payload));
        }
        assert.equal(savedLang(), undefined, 'nothing was written to mafia_lang');
    });

    it('ignores a missing payload', () => {
        gameState.phase = 'welcome';
        handleAction({ type: 'SET_LANG' });
        assert.equal(getLang(), 'fa');
        assert.equal(savedLang(), undefined);
    });

    it('a bad value does not disturb English either (it is not read as "the default")', () => {
        gameState.phase = 'welcome';
        handleAction({ type: 'SET_LANG', payload: 'en' });
        for (const payload of NOT_A_LANGUAGE) handleAction({ type: 'SET_LANG', payload });
        assert.equal(getLang(), 'en');
        assert.equal(savedLang(), 'en');
    });

    it('ignores the request when the phase is damaged or unknown', () => {
        for (const phase of ['bogus', undefined]) {
            gameState.phase = phase;
            handleAction({ type: 'SET_LANG', payload: 'en' });
            assert.equal(getLang(), 'fa', String(phase));
        }
    });

    it('is a no-op for the language that is already active: nothing is saved and nobody is told', () => {
        gameState.phase = 'welcome';
        let seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'fa' }));
        assert.deepEqual(seen, []);
        assert.equal(savedLang(), undefined, 'Persian, already active: mafia_lang is not written');

        handleAction({ type: 'SET_LANG', payload: 'en' });
        env.storage.delete(LANG_KEY);
        seen = watchLang(() => handleAction({ type: 'SET_LANG', payload: 'en' }));
        assert.deepEqual(seen, []);
        assert.equal(savedLang(), undefined, 'English, already active: mafia_lang is not written again');
    });
});

describe('syncLangSwitch: the pressed state follows the active language', () => {
    function twoButtons() {
        const make = (code) => {
            const button = new FakeElement(`btn-lang-${code}`, 'button');
            button.dataset.lang = code;
            button.setAttribute('aria-pressed', 'false');
            return button;
        };
        const fa = make('fa');
        const en = make('en');
        env.stubQuery('.lang-btn', [fa, en]);
        return { fa, en, pressed: () => [fa.getAttribute('aria-pressed'), en.getAttribute('aria-pressed')] };
    }

    it('marks exactly the active language as pressed', () => {
        const { pressed } = twoButtons();
        syncLangSwitch();
        assert.deepEqual(pressed(), ['true', 'false']);
        setLang('en');
        syncLangSwitch();
        assert.deepEqual(pressed(), ['false', 'true']);
        setLang('fa');
        syncLangSwitch();
        assert.deepEqual(pressed(), ['true', 'false']);
    });

    it('follows a click (SET_LANG) when it listens to the language, as main.js does', () => {
        const { pressed } = twoButtons();
        const stop = onLangChange(syncLangSwitch);
        try {
            syncLangSwitch();
            assert.deepEqual(pressed(), ['true', 'false']);

            gameState.phase = 'welcome';
            handleAction({ type: 'SET_LANG', payload: 'en' });
            assert.deepEqual(pressed(), ['false', 'true'], 'after a click');

            handleAction({ type: 'SET_LANG', payload: 'fa' });
            assert.deepEqual(pressed(), ['true', 'false']);
        } finally {
            stop();
        }
    });

    it('a button for a language that is not active is never pressed, and nothing else is touched', () => {
        const { fa, en } = twoButtons();
        fa.setAttribute('aria-label', 'x');
        en.textContent = 'English';
        setLang('en');
        syncLangSwitch();
        assert.equal(fa.getAttribute('aria-label'), 'x');
        assert.equal(en.textContent, 'English');
        assert.equal(fa.getAttribute('aria-pressed'), 'false');
    });
});
