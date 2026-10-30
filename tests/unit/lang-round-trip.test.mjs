/**
 * The language switch seen from the page: the real index.html is turned into fake elements (every
 * `data-i18n` and `data-i18n-attr` one, with the Persian text it has before any JS runs), the real SET_LANG action
 * runs on them, and the page is compared before and after. What it protects:
 *
 *  - Persian -> English -> Persian gives back exactly the page it started from, however often it is repeated;
 *  - in English no element keeps a Persian text, and the two language buttons keep their own fixed names;
 *  - what JS writes by itself (the limit hint, the pressed button, the toasts) follows the language as main.js
 *    arranges it;
 *  - the person's typing and the saved settings are not touched by a switch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { VALID_PHASES } from '../../js/core/config.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { gameState } from '../../js/core/state.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';
import { elements, innerText, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { setDispatchHandler, dispatch } = await import('../../js/core/dispatch.js');
const { getLang, onLangChange, setLang } = await import('../../js/i18n/index.js');
const { clearToasts, showToast } = await import('../../js/ui/feedback.js');
const { syncLangSwitch } = await import('../../js/ui/langSwitch.js');
const { updateSetupLimitHints } = await import('../../js/ui/setup.js');

const PERSIAN = /[؀-ۿ]/;
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');

let translated; // the fake copies of the elements that carry data-i18n / data-i18n-attr
let buttons;
let stopListening;

/** The page as the browser would hold it on first load: Persian text in every translatable element. */
function buildPage() {
    translated = [];
    for (const node of elements(parseHtml(html))) {
        if (!node.attrs['data-i18n'] && !node.attrs['data-i18n-attr']) continue;
        const el = new FakeElement(node.attrs.id || '', node.tag);
        for (const [name, value] of Object.entries(node.attrs)) el.setAttribute(name, value);
        el.textContent = node.attrs['data-i18n'] ? normalizeText(innerText(node)) : '';
        translated.push(el);
    }
    env.stubQuery('[data-i18n]', translated.filter((el) => el.getAttribute('data-i18n')));
    env.stubQuery('[data-i18n-attr]', translated.filter((el) => el.getAttribute('data-i18n-attr')));

    buttons = ['fa', 'en'].map((code) => {
        const button = new FakeElement(`btn-lang-${code}`, 'button');
        button.dataset.lang = code;
        button.textContent = code === 'fa' ? 'فارسی' : 'English';
        return button;
    });
    env.stubQuery('.lang-btn', buttons);

    env.el('toast-container');
    env.el('players-limit-hint');
    env.el('setup-players-count').value = '8';
    document.documentElement = { lang: 'fa', dir: 'rtl', classList: { remove() {} } };
}

/** Everything a person can read or hear on the page, in a form two moments can be compared in. */
function snapshot() {
    return {
        texts: translated.map((el) => [el.id || el.tagName, el.textContent, { ...el.attributes }]),
        hint: env.el('players-limit-hint').textContent,
        pressed: buttons.map((b) => b.getAttribute('aria-pressed')),
        buttonNames: buttons.map((b) => b.textContent),
        html: { lang: document.documentElement.lang, dir: document.documentElement.dir }
    };
}

useGameHarness(env, {
    setup: () => {
        buildPage();
        // The real action handler behind dispatch, and the same follow-up main.js registers.
        setDispatchHandler(handleAction);
        stopListening = onLangChange(() => {
            syncLangSwitch();
            clearToasts();
            updateSetupLimitHints();
        });
        syncLangSwitch();
        updateSetupLimitHints();
    },
    teardown: () => {
        stopListening();
        setLang('fa');
        delete document.documentElement;
    }
});
after(() => env.uninstall());

const switchTo = (lang) => dispatch({ type: 'SET_LANG', payload: lang });

describe('the page, as built from index.html', () => {
    it('has translatable elements, and every key of them exists in both catalogs', () => {
        assert.ok(translated.length >= 25, `only ${translated.length} translatable elements found`);
        for (const el of translated) {
            const keys = [el.getAttribute('data-i18n')].filter(Boolean);
            for (const pair of (el.getAttribute('data-i18n-attr') || '').split(';').filter(Boolean)) keys.push(pair.slice(pair.indexOf(':') + 1).trim());
            for (const key of keys) {
                assert.ok(key in fa, `fa.js has no ${key}`);
                assert.ok(key in en, `en.js has no ${key}`);
            }
        }
    });

    it('starts in Persian: every text is the Persian catalog text', () => {
        for (const el of translated) {
            const key = el.getAttribute('data-i18n');
            if (key) assert.equal(el.textContent, fa[key], key);
        }
        assert.deepEqual(snapshot().pressed, ['true', 'false']);
    });
});

describe('Persian -> English', () => {
    it('shows every static text, and every aria-label, in English, and keeps no Persian letter', () => {
        switchTo('en');
        for (const el of translated) {
            const key = el.getAttribute('data-i18n');
            if (key) {
                assert.equal(el.textContent, en[key], key);
                assert.ok(!PERSIAN.test(el.textContent), `${key} still has Persian: ${el.textContent}`);
            }
            for (const pair of (el.getAttribute('data-i18n-attr') || '').split(';').filter(Boolean)) {
                const colon = pair.indexOf(':');
                const attr = pair.slice(0, colon).trim();
                const attrKey = pair.slice(colon + 1).trim();
                assert.equal(el.getAttribute(attr), en[attrKey], `${attr} <- ${attrKey}`);
                assert.ok(!PERSIAN.test(el.getAttribute(attr)), `${attrKey} still has Persian`);
            }
        }
    });

    it('turns the page left to right, saves the choice, and presses the English button', () => {
        switchTo('en');
        assert.deepEqual(snapshot().html, { lang: 'en', dir: 'ltr' });
        assert.equal(env.storage.get('mafia_lang'), 'en');
        assert.deepEqual(snapshot().pressed, ['false', 'true']);
    });

    it('keeps the two language names as they are: each is written in its own language, in any language', () => {
        switchTo('en');
        assert.deepEqual(snapshot().buttonNames, ['فارسی', 'English']);
    });

    it('rewrites the limit hint in English, with English digits', () => {
        assert.equal(snapshot().hint, 'بین ۳ تا ۲۰ نفر');
        switchTo('en');
        assert.equal(snapshot().hint, '3 to 20 players');
    });

    it('removes a toast that is on screen, so none is left in the old language', () => {
        showToast('پیام قدیمی');
        assert.deepEqual(env.toasts(), ['پیام قدیمی']);
        switchTo('en');
        assert.deepEqual(env.toasts(), []);
    });
});

describe('English -> Persian', () => {
    it('gives back exactly the page that was there before: texts, attributes, hint, pressed button, direction', () => {
        const before = snapshot();
        switchTo('en');
        assert.notDeepEqual(snapshot(), before, 'the switch really changed the page');
        switchTo('fa');
        assert.deepEqual(snapshot(), before);
    });

    it('does so again and again: five round trips end on the same page', () => {
        const before = snapshot();
        for (let i = 0; i < 5; i++) {
            switchTo('en');
            switchTo('fa');
        }
        assert.deepEqual(snapshot(), before);
        assert.equal(getLang(), 'fa');
    });

    it('is the same page whichever way the language was reached (a click, or setLang as the loader does)', () => {
        const before = snapshot();
        setLang('en');
        setLang('fa');
        assert.deepEqual(snapshot(), before);
    });
});

describe('what a switch leaves alone', () => {
    it('the number the person typed and the count saved in the settings, valid or not', () => {
        const field = env.el('setup-players-count');
        gameState.settings.playersCount = 11;
        for (const typed of ['12', '۱۲', 'abc', '']) {
            field.value = typed;
            switchTo('en');
            switchTo('fa');
            assert.equal(field.value, typed, JSON.stringify(typed));
            assert.equal(gameState.settings.playersCount, 11);
        }
    });

    it('the phase', () => {
        gameState.phase = 'setup';
        switchTo('en');
        assert.equal(gameState.phase, 'setup');
    });

    it('everything, when the switch is refused (a match is running, or the code is not a language)', () => {
        VALID_PHASES.add('night');
        try {
            gameState.phase = 'night';
            const before = snapshot();
            switchTo('en');
            assert.deepEqual(snapshot(), before);
        } finally {
            VALID_PHASES.delete('night');
        }
        gameState.phase = 'welcome';
        const before = snapshot();
        for (const payload of ['de', '', undefined, null, '__proto__']) switchTo(payload);
        assert.deepEqual(snapshot(), before);
    });

    it('asking for the language that is already shown changes nothing and saves nothing', () => {
        const before = snapshot();
        switchTo('fa');
        assert.deepEqual(snapshot(), before);
        assert.equal(env.storage.has('mafia_lang'), false);
    });
});

describe('main.js arranges the same follow-up (the test above copies it, so it is checked here)', () => {
    const body = mainSource.match(/function refreshLanguageDependentUi\(\) \{([\s\S]*?)\n\}/);

    it('registers the follow-up for every language change', () => {
        assert.match(mainSource, /onLangChange\(refreshLanguageDependentUi\)/);
    });

    it('which does exactly the three things the test does', () => {
        assert.ok(body, 'refreshLanguageDependentUi not found in main.js');
        const calls = [...body[1].matchAll(/(\w+)\(\);/g)].map((m) => m[1]);
        assert.deepEqual(calls, ['syncLangSwitch', 'clearToasts', 'updateSetupLimitHints']);
    });

    it('and runs once at start-up for the first paint, before the first screen is used', () => {
        const start = mainSource.match(/function start\(\) \{([\s\S]*?)\n\}/);
        assert.ok(start);
        assert.match(start[1], /syncLangSwitch\(\);/);
        assert.match(start[1], /updateSetupLimitHints\(\);/);
    });
});
