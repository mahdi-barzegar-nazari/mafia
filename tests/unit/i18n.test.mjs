import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { CATALOGS } = await import('../../js/i18n/catalogs.js');
const { fa } = await import('../../js/i18n/fa.js');
const { DEFAULT_LANG, LANG_DIRECTIONS, LANG_STORAGE_KEY, SUPPORTED_LANGS, applyStaticTranslations, getLang, hasTranslation, initI18n, onLangChange, setLang, t } =
    await import('../../js/i18n/index.js');

const unsubscribers = [];
/** Register a listener that the afterEach hook removes even when the test fails. */
const listen = (callback) => {
    const stop = onLangChange(callback);
    unsubscribers.push(stop);
    return stop;
};

/** Run `run` with a second language registered, and take it out again whatever happens. */
function withLanguage(code, catalog, dir, run) {
    SUPPORTED_LANGS.push(code);
    CATALOGS[code] = catalog;
    LANG_DIRECTIONS[code] = dir;
    try {
        return run();
    } finally {
        setLang(DEFAULT_LANG);
        SUPPORTED_LANGS.splice(SUPPORTED_LANGS.indexOf(code), 1);
        delete CATALOGS[code];
        delete LANG_DIRECTIONS[code];
    }
}

/** Run `run` with a temporary Persian key. */
function withKey(key, value, run) {
    const had = key in fa;
    const previous = fa[key];
    fa[key] = value;
    try {
        return run();
    } finally {
        if (had) fa[key] = previous;
        else delete fa[key];
    }
}

function element(attributes, text = '') {
    const el = document.createElement('span');
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    el.textContent = text;
    return el;
}

/** Make `document.querySelectorAll` return these elements for the two selectors the translator uses. */
function stubStatic({ text = [], attr = [] }) {
    env.stubQuery('[data-i18n]', text);
    env.stubQuery('[data-i18n-attr]', attr);
}

beforeEach(() => {
    document.documentElement = { lang: 'sentinel', dir: 'sentinel' };
});

afterEach(() => {
    unsubscribers.splice(0).forEach((stop) => stop());
    setLang(DEFAULT_LANG);
    env.reset();
});

after(() => env.uninstall());

describe('t()', () => {
    it('returns the Persian text for a known key', () => {
        assert.equal(t('setup.title'), fa['setup.title']);
        assert.match(t('setup.title'), /[\u0600-\u06FF]/);
        assert.equal(t('welcome.tagline'), fa['welcome.tagline']);
    });

    it('returns the key itself when no catalog has it', () => {
        assert.equal(t('no.such.key'), 'no.such.key');
        assert.equal(hasTranslation('no.such.key'), false);
        assert.equal(hasTranslation('setup.title'), true);
    });

    it('does not mistake inherited object properties for keys', () => {
        for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
            assert.equal(t(key), key);
            assert.equal(hasTranslation(key), false);
        }
    });

    it('falls back from the active language to Persian, then to the key', () => {
        withLanguage('xx', { 'only.xx': 'X', 'setup.title': 'Setup (xx)' }, 'ltr', () => {
            setLang('xx');
            assert.equal(t('only.xx'), 'X');
            assert.equal(t('setup.title'), 'Setup (xx)');
            assert.equal(t('setup.players.label'), fa['setup.players.label']);
            assert.equal(t('no.such.key'), 'no.such.key');
        });
    });

    it('replaces {name} placeholders, every occurrence of them', () => {
        withKey('test.greet', 'سلام {name}، {score} امتیاز دارید. {name}!', () => {
            assert.equal(t('test.greet', { name: 'علی', score: 3 }), 'سلام علی، 3 امتیاز دارید. علی!');
            assert.equal(t('test.greet', { name: 'علی', score: 0 }), 'سلام علی، 0 امتیاز دارید. علی!');
        });
    });

    it('leaves a placeholder without a value as it is and ignores extra params', () => {
        withKey('test.greet', 'سلام {name}، {score} امتیاز', () => {
            assert.equal(t('test.greet', { name: 'علی' }), 'سلام علی، {score} امتیاز');
            assert.equal(t('test.greet', { name: 'علی', score: undefined }), 'سلام علی، {score} امتیاز');
            assert.equal(t('test.greet', { name: 'علی', score: null }), 'سلام علی، {score} امتیاز');
            assert.equal(t('test.greet', { name: 'علی', score: 1, extra: 'x' }), 'سلام علی، 1 امتیاز');
            assert.equal(t('test.greet'), 'سلام {name}، {score} امتیاز');
        });
    });

    it('replaces in a single pass: a value that looks like a placeholder or a $-pattern stays literal', () => {
        withKey('test.pair', '{a} {b}', () => {
            assert.equal(t('test.pair', { a: '{b}', b: 'B' }), '{b} B');
            assert.equal(t('test.pair', { a: '$&', b: '$1' }), '$& $1');
        });
    });

    it('never reads inherited properties of params', () => {
        withKey('test.inherited', '{toString} {constructor}', () => {
            assert.equal(t('test.inherited', {}), '{toString} {constructor}');
        });
    });

    it('returns plain text: no HTML is interpreted, escaped or added', () => {
        withKey('test.html', '<b>x</b> &amp; "q" {name}', () => {
            assert.equal(t('test.html'), '<b>x</b> &amp; "q" {name}');
            // Escaping is the caller's job: the parameter comes out exactly as it went in.
            assert.equal(t('test.html', { name: '<img src=x onerror=alert(1)>' }), '<b>x</b> &amp; "q" <img src=x onerror=alert(1)>');
        });
    });
});

describe('setLang', () => {
    it('ignores an unsupported language and changes nothing', () => {
        const calls = [];
        listen((lang) => calls.push(lang));
        for (const bad of ['de', '', 'FA', '__proto__', 'constructor', undefined, null, 42, {}]) {
            assert.equal(setLang(bad), false, String(bad));
        }
        assert.equal(getLang(), 'fa');
        assert.equal(env.storage.has(LANG_STORAGE_KEY), false);
        assert.deepEqual(calls, []);
        assert.deepEqual(document.documentElement, { lang: 'sentinel', dir: 'sentinel' });
    });

    it('switches: saves the choice, sets lang and dir, translates the static HTML, tells the listeners', () => {
        withLanguage('xx', { 'setup.title': 'Setup' }, 'ltr', () => {
            const title = element({ 'data-i18n': 'setup.title' }, fa['setup.title']);
            stubStatic({ text: [title] });
            const calls = [];
            listen((lang) => calls.push(lang));

            assert.equal(setLang('xx'), true);
            assert.equal(getLang(), 'xx');
            assert.equal(env.storage.get(LANG_STORAGE_KEY), 'xx');
            assert.deepEqual(document.documentElement, { lang: 'xx', dir: 'ltr' });
            assert.equal(title.textContent, 'Setup');
            assert.deepEqual(calls, ['xx']);

            // Coming back to Persian must translate again, not leave the other language behind.
            assert.equal(setLang('fa'), true);
            assert.equal(env.storage.get(LANG_STORAGE_KEY), 'fa');
            assert.deepEqual(document.documentElement, { lang: 'fa', dir: 'rtl' });
            assert.equal(title.textContent, fa['setup.title']);
            assert.deepEqual(calls, ['xx', 'fa']);
        });
    });

    it('setting the language that is already active saves and translates, but does not notify', () => {
        const title = element({ 'data-i18n': 'setup.title' }, 'stale text');
        stubStatic({ text: [title] });
        const calls = [];
        listen((lang) => calls.push(lang));
        assert.equal(setLang('fa'), true);
        assert.equal(title.textContent, fa['setup.title']);
        assert.equal(env.storage.get(LANG_STORAGE_KEY), 'fa');
        assert.deepEqual(calls, []);
    });

    it('stops notifying after unsubscribe, and one failing listener does not block the others', () => {
        const original = console.error;
        const errors = [];
        console.error = (...args) => errors.push(args);
        try {
            withLanguage('xx', {}, 'ltr', () => {
                const calls = [];
                listen(() => {
                    throw new Error('boom');
                });
                const stop = listen((lang) => calls.push(lang));
                setLang('xx');
                assert.deepEqual(calls, ['xx']);
                assert.equal(errors.length, 1);
                stop();
                setLang('fa');
                assert.deepEqual(calls, ['xx']);
            });
        } finally {
            console.error = original;
        }
    });

    it('onLangChange rejects anything that is not a function', () => {
        assert.throws(() => onLangChange('nope'), TypeError);
        assert.throws(() => onLangChange(), TypeError);
    });

    it('still switches when localStorage cannot be written', () => {
        const original = localStorage.setItem;
        localStorage.setItem = () => {
            throw new Error('quota');
        };
        try {
            withLanguage('xx', {}, 'ltr', () => {
                assert.equal(setLang('xx'), true);
                assert.equal(getLang(), 'xx');
            });
        } finally {
            localStorage.setItem = original;
        }
    });
});

describe('initI18n', () => {
    it('reads the saved language and translates the static HTML for a non-default language', () => {
        withLanguage('xx', { 'setup.title': 'Setup' }, 'ltr', () => {
            const title = element({ 'data-i18n': 'setup.title' }, fa['setup.title']);
            stubStatic({ text: [title] });
            env.storage.set(LANG_STORAGE_KEY, 'xx');
            assert.equal(initI18n(), 'xx');
            assert.equal(getLang(), 'xx');
            assert.deepEqual(document.documentElement, { lang: 'xx', dir: 'ltr' });
            assert.equal(title.textContent, 'Setup');
        });
    });

    it('leaves the HTML alone for the default language, so the Persian path is unchanged', () => {
        const title = element({ 'data-i18n': 'setup.title' }, 'sentinel text');
        stubStatic({ text: [title] });
        for (const saved of [undefined, 'fa']) {
            env.storage.clear();
            if (saved) env.storage.set(LANG_STORAGE_KEY, saved);
            assert.equal(initI18n(), 'fa');
            assert.equal(title.textContent, 'sentinel text');
            assert.deepEqual(document.documentElement, { lang: 'fa', dir: 'rtl' });
        }
    });

    it('falls back to Persian for an unknown or unreadable saved value', () => {
        env.storage.set(LANG_STORAGE_KEY, 'zz');
        assert.equal(initI18n(), 'fa');
        const original = localStorage.getItem;
        localStorage.getItem = () => {
            throw new Error('denied');
        };
        try {
            assert.equal(initI18n(), 'fa');
        } finally {
            localStorage.getItem = original;
        }
    });

    it('does not save the language and does not notify', () => {
        const calls = [];
        listen((lang) => calls.push(lang));
        initI18n();
        assert.equal(env.storage.has(LANG_STORAGE_KEY), false);
        assert.deepEqual(calls, []);
    });
});

describe('applyStaticTranslations', () => {
    it('sets textContent from data-i18n and attributes from data-i18n-attr', () => {
        withLanguage('xx', { 'setup.title': 'Setup', 'install.aria': 'Install it' }, 'ltr', () => {
            setLang('xx');
            const text = element({ 'data-i18n': 'setup.title' }, 'old');
            const attrs = element({ 'aria-label': 'old', placeholder: 'old', 'data-i18n-attr': 'aria-label:install.aria; placeholder : setup.players.label' });
            const both = element({ 'data-i18n': 'setup.title', title: 'old', 'data-i18n-attr': 'title:install.aria' }, 'old');
            stubStatic({ text: [text, both], attr: [attrs, both] });
            applyStaticTranslations();
            assert.equal(text.textContent, 'Setup');
            assert.equal(attrs.getAttribute('aria-label'), 'Install it');
            // A key the active language lacks falls back to the Persian text.
            assert.equal(attrs.getAttribute('placeholder'), fa['setup.players.label']);
            assert.equal(both.textContent, 'Setup');
            assert.equal(both.getAttribute('title'), 'Install it');
        });
    });

    it('keeps the HTML default when a key has no text anywhere, and skips malformed pairs', () => {
        const text = element({ 'data-i18n': 'no.such.key' }, 'keep me');
        const attrs = element({ 'aria-label': 'keep me too', 'data-i18n-attr': 'aria-label:no.such.key;broken;:setup.title;title' });
        stubStatic({ text: [text], attr: [attrs] });
        applyStaticTranslations();
        assert.equal(text.textContent, 'keep me');
        assert.equal(attrs.getAttribute('aria-label'), 'keep me too');
        assert.equal(attrs.getAttribute('title'), null);
    });

    it('translates below a given root, and does nothing without one', () => {
        const el = element({ 'data-i18n': 'setup.title' }, 'old');
        const root = { querySelectorAll: (selector) => (selector === '[data-i18n]' ? [el] : []) };
        applyStaticTranslations(root);
        assert.equal(el.textContent, fa['setup.title']);
        assert.doesNotThrow(() => applyStaticTranslations(null));
        assert.doesNotThrow(() => applyStaticTranslations({}));
    });
});
