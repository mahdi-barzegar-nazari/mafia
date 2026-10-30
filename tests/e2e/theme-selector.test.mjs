/**
 * The theme selector, in a real Chromium at 360x740 against the PRODUCTION build: it offers the eight themes in the
 * language of the page, applies each one at once on both screens, tells the browser bar, remembers the choice
 * across a reload and a language switch, and fits the phone. (The colours each theme produces are in
 * theme-colors.test.mjs; the logic behind the selector is in tests/unit/theme.test.mjs.)
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { THEME_COLORS } from '../../js/core/config.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];

let app;
let browser;
let baseUrl;

before(async () => {
    app = await startApp();
    ({ browser, baseUrl } = app);
});
after(async () => {
    await app?.stop();
});

/** Open the app on a fresh phone-sized page (reduced motion: the 0.3 s background fade ends at once), run `fn(page, context)`, fail on any script error. */
async function withPage(fn, { lang } = {}) {
    const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
    const { page, problems } = await newPage(context);
    try {
        if (lang) await context.addInitScript((value) => localStorage.setItem('mafia_lang', value), lang);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const state = (page) =>
    page.evaluate(() => ({
        body: document.body.getAttribute('data-theme'),
        selected: document.getElementById('theme-selector').value,
        bar: document.getElementById('meta-theme-color').getAttribute('content'),
        saved: localStorage.getItem('mafia_selected_theme'),
        bg: getComputedStyle(document.body).getPropertyValue('--bg-body').trim()
    }));

describe('the theme selector (production build, 360x740)', () => {
    it('starts on the default theme and has saved nothing', async () => {
        await withPage(async (page) => {
            assert.deepEqual(await state(page), { body: 'default', selected: 'default', bar: THEME_COLORS.default, saved: null, bg: '#090d16' });
        });
    });

    for (const lang of ['fa', 'en']) {
        it(`offers the eight themes, named in ${lang === 'fa' ? 'Persian' : 'English'}, in that order`, async () => {
            await withPage(
                async (page) => {
                    const options = await page.$$eval('#theme-selector option', (list) => list.map((o) => [o.value, o.textContent.trim()]));
                    const catalog = lang === 'fa' ? fa : en;
                    assert.deepEqual(options, THEMES.map((name) => [name, catalog[`theme.${name}`]]));
                    assert.equal(await page.textContent('label[for="theme-selector"]'), catalog['header.theme.label']);
                },
                { lang }
            );
        });
    }

    for (const theme of THEMES) {
        it(`${theme}: applies at once on the welcome screen and on the setup screen, and tells the browser bar`, async () => {
            await withPage(async (page) => {
                await page.selectOption('#theme-selector', theme);
                const welcome = await state(page);
                assert.equal(welcome.body, theme);
                assert.equal(welcome.selected, theme);
                assert.equal(welcome.bar, THEME_COLORS[theme]);
                assert.equal(welcome.saved, theme);
                assert.equal(welcome.bg.toLowerCase(), THEME_COLORS[theme], 'the page really computes this theme (--bg-body is the bar colour)');

                await page.click('#btn-nav-setup');
                await page.waitForSelector('#screen-setup:not(.hidden)');
                assert.deepEqual(await state(page), welcome, 'the same theme on the next screen');
                assert.equal(await page.isVisible('#theme-selector'), true, 'the selector is on the setup screen too');

                await page.click('#btn-back-welcome-2');
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                assert.deepEqual(await state(page), welcome, 'and when back');
            });
        });
    }

    it('a choice on the setup screen is kept on the welcome screen', async () => {
        await withPage(async (page) => {
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            await page.selectOption('#theme-selector', 'cyber');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal((await state(page)).body, 'cyber');
        });
    });

    it('is remembered: after a reload the same theme is applied, in the selector, on the page and in the browser bar', async () => {
        await withPage(async (page) => {
            for (const theme of ['ocean', 'noir', 'sunset']) {
                await page.selectOption('#theme-selector', theme);
                await page.reload();
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                assert.deepEqual(await state(page), { body: theme, selected: theme, bar: THEME_COLORS[theme], saved: theme, bg: THEME_COLORS[theme] });
            }
        });
    });

    it('is independent of the language: switching language keeps the theme, and switching theme keeps the language', async () => {
        await withPage(async (page) => {
            await page.selectOption('#theme-selector', 'crimson');
            await page.click('#btn-lang-en');
            assert.equal((await state(page)).body, 'crimson');
            assert.equal(await page.$eval('#theme-selector option:checked', (o) => o.textContent.trim()), en['theme.crimson'], 'the selected option is named in English now');
            await page.selectOption('#theme-selector', 'classic');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
            await page.click('#btn-lang-fa');
            assert.equal((await state(page)).body, 'classic');
            assert.equal(await page.$eval('#theme-selector option:checked', (o) => o.textContent.trim()), fa['theme.classic']);
        });
    });

    it('is easy to use on a phone: inside the screen, at least 40 px high, and does not make the page scroll sideways', async () => {
        await withPage(async (page) => {
            for (const where of ['welcome', 'setup']) {
                if (where === 'setup') {
                    await page.click('#btn-nav-setup');
                    await page.waitForSelector('#screen-setup:not(.hidden)');
                }
                const box = await page.evaluate(() => {
                    const r = document.getElementById('theme-selector').getBoundingClientRect();
                    return { left: r.left, right: r.right, top: r.top, height: r.height, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
                });
                assert.ok(box.height >= 40, `${where}: ${box.height}px high`);
                assert.ok(box.left >= 0 && box.right <= box.innerWidth && box.top >= 0, `${where}: inside the screen`);
                assert.ok(box.scrollWidth <= box.innerWidth, `${where}: no sideways scrolling`);
            }
        });
    });

    it('can be operated with the keyboard alone', async () => {
        await withPage(async (page) => {
            await page.focus('#theme-selector');
            await page.keyboard.press('ArrowDown');
            const first = await state(page);
            assert.notEqual(first.body, 'default', 'an arrow key changed the theme');
            assert.equal(first.body, first.selected);
            assert.equal(first.saved, first.body);
        });
    });
});
