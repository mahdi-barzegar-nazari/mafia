/**
 * Choosing and restoring a theme, for every theme the selector offers: the CHANGE_THEME action (app/actions.js)
 * sets `data-theme` on <body>, the colour of the browser bar and the saved choice; `initTheme` (ui/theme.js)
 * restores them at the next start. The colours of the themes themselves are checked in theme-colors.test.mjs and
 * theme-tokens.test.mjs (stylesheet) and tests/e2e/theme-colors.test.mjs (browser).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { THEME_COLORS } from '../../js/core/config.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';
import { elements, parseHtml } from './helpers/htmlScan.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { THEME_STORAGE_KEY, initTheme, updateThemeMeta } = await import('../../js/ui/theme.js');

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const select = [...elements(parseHtml(html))].find((el) => el.attrs.id === 'theme-selector');
const OFFERED = select.children.filter((c) => c.type === 'el' && c.tag === 'option').map((o) => o.attrs.value);

useGameHarness(env, {
    setup: () => {
        document.body = new FakeElement('body', 'body');
        env.el('theme-selector');
        env.el('meta-theme-color').setAttribute('content', THEME_COLORS.default);
    },
    teardown: () => {
        delete document.body;
    }
});
after(() => env.uninstall());

const meta = () => env.el('meta-theme-color').getAttribute('content');
const selector = () => env.el('theme-selector');
const bodyTheme = () => document.body.getAttribute('data-theme');

/** Make `localStorage.<method>` throw (private mode, blocked storage) while `fn` runs. */
function withBrokenStorage(method, fn) {
    const real = localStorage[method];
    localStorage[method] = () => {
        throw new Error('storage is blocked');
    };
    try {
        return fn();
    } finally {
        localStorage[method] = real;
    }
}

describe('the themes the page offers', () => {
    it('are the eight of THEME_COLORS, each with a colour for the browser bar', () => {
        assert.equal(OFFERED.length, 8);
        assert.deepEqual([...OFFERED].sort(), Object.keys(THEME_COLORS).sort());
        for (const name of OFFERED) assert.match(THEME_COLORS[name], /^#[0-9a-f]{6}$/i, name);
    });
});

describe('CHANGE_THEME', () => {
    for (const name of OFFERED) {
        it(`${name}: sets data-theme, the browser-bar colour and the saved choice`, () => {
            handleAction({ type: 'CHANGE_THEME', payload: name });
            assert.equal(bodyTheme(), name);
            assert.equal(meta(), THEME_COLORS[name]);
            assert.equal(env.storage.get(THEME_STORAGE_KEY), name);
        });
    }

    it('saves under mafia_selected_theme and writes no other key', () => {
        handleAction({ type: 'CHANGE_THEME', payload: 'noir' });
        assert.deepEqual([...env.storage.keys()], ['mafia_selected_theme']);
    });

    it('the last choice wins, going through all eight and back', () => {
        for (const name of [...OFFERED, ...[...OFFERED].reverse()]) handleAction({ type: 'CHANGE_THEME', payload: name });
        assert.equal(bodyTheme(), 'default');
        assert.equal(meta(), THEME_COLORS.default);
        assert.equal(env.storage.get(THEME_STORAGE_KEY), 'default');
    });

    it('still applies the theme when the storage refuses to save it', () => {
        assert.doesNotThrow(() => withBrokenStorage('setItem', () => handleAction({ type: 'CHANGE_THEME', payload: 'cyber' })));
        assert.equal(bodyTheme(), 'cyber');
        assert.equal(meta(), THEME_COLORS.cyber);
    });
});

describe('initTheme', () => {
    it('with nothing saved, shows the default theme and says so in the selector and the browser bar', () => {
        initTheme();
        assert.equal(bodyTheme(), 'default');
        assert.equal(selector().value, 'default');
        assert.equal(meta(), THEME_COLORS.default);
    });

    for (const name of OFFERED) {
        it(`restores ${name}: page, selector and browser bar agree`, () => {
            env.storage.set(THEME_STORAGE_KEY, name);
            initTheme();
            assert.equal(bodyTheme(), name);
            assert.equal(selector().value, name);
            assert.equal(meta(), THEME_COLORS[name]);
        });
    }

    it('shows the default theme when the storage cannot be read', () => {
        withBrokenStorage('getItem', () => initTheme());
        assert.equal(bodyTheme(), 'default');
        assert.equal(selector().value, 'default');
    });

    it('does not write anything: restoring a choice is not making one', () => {
        env.storage.set(THEME_STORAGE_KEY, 'ocean');
        initTheme();
        assert.deepEqual([...env.storage.entries()], [[THEME_STORAGE_KEY, 'ocean']]);
    });

    it('a choice made in one visit is the page of the next one', () => {
        handleAction({ type: 'CHANGE_THEME', payload: 'sunset' });
        document.body.setAttribute('data-theme', 'default');
        selector().value = 'default';
        initTheme();
        assert.equal(bodyTheme(), 'sunset');
        assert.equal(selector().value, 'sunset');
    });
});

describe('updateThemeMeta', () => {
    it('leaves the colour alone for a name that is not a theme (it never writes "undefined")', () => {
        // Only names the selector offers ever reach it. (Object.prototype names such as '__proto__' are not
        // covered on purpose: the template reads THEME_COLORS[theme] directly and the page cannot send them.)
        updateThemeMeta('nope');
        updateThemeMeta('');
        updateThemeMeta(undefined);
        assert.equal(meta(), THEME_COLORS.default);
    });

    it('does not fail on a page without the <meta> element', () => {
        env.reset();
        assert.doesNotThrow(() => updateThemeMeta('noir'));
    });
});
