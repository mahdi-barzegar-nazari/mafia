/**
 * The players-count field of the setup placeholder, in a real Chromium at 360x740 against the PRODUCTION build: the
 * limits come from RULES (3 to 20) and are stated in the hint under the field; a legal count is accepted and written
 * back in plain digits (Persian and Arabic-Indic digits are read), an illegal one is pointed out in the language of
 * the page (a toast, and the field is marked, pulsed and focused) and never changes the saved count.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { RULES } from '../../js/core/config.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';

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

/** Open the app on the setup screen (optionally in English), run `fn(page)`, fail on any script error. */
async function onSetup(fn, { lang, touch = false } = {}) {
    const context = await browser.newContext({ viewport: PHONE, hasTouch: touch, isMobile: touch });
    const { page, problems } = await newPage(context);
    try {
        if (lang) await context.addInitScript((value) => localStorage.setItem('mafia_lang', value), lang);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await page.click('#btn-nav-setup');
        await page.waitForSelector('#screen-setup:not(.hidden)');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const FIELD = '#setup-players-count';
const toasts = (page) => page.locator('#toast-container .toast').allTextContents();
const marked = (page) => page.getAttribute(FIELD, 'aria-invalid');
/** Type `text` into the field and press Enter, which is the moment the browser says the person is done (`change`). */
async function enter(page, text) {
    await page.fill(FIELD, text);
    await page.press(FIELD, 'Enter');
}

describe('the players-count field (production build, 360x740)', () => {
    it('is named by its label, described by the hint, and starts at 8 with a numeric keyboard', async () => {
        await onSetup(async (page) => {
            assert.equal(await page.inputValue(FIELD), '8');
            assert.equal(await page.getAttribute(FIELD, 'inputmode'), 'numeric');
            assert.equal(await page.getAttribute(FIELD, 'aria-describedby'), 'players-limit-hint');
            const snapshot = await page.locator('#screen-setup').ariaSnapshot();
            assert.match(snapshot, /textbox "تعداد بازیکنان:"/);
            assert.equal(await page.textContent('#players-limit-hint'), `بین ${'۳'} تا ${'۲۰'} نفر`);
            assert.deepEqual([RULES.players.min, RULES.players.max], [3, 20], 'the hint states these limits');
        });
    });

    it('accepts every legal count, from 3 to 20, with no message, and keeps it', async () => {
        await onSetup(async (page) => {
            for (let n = RULES.players.min; n <= RULES.players.max; n++) {
                await enter(page, String(n));
                assert.equal(await page.inputValue(FIELD), String(n));
                assert.equal(await marked(page), null, `${n}: not marked`);
            }
            assert.deepEqual(await toasts(page), []);
        });
    });

    it('reads Persian and Arabic-Indic digits and writes the count back in plain digits', async () => {
        await onSetup(async (page) => {
            await enter(page, '۱۲');
            assert.equal(await page.inputValue(FIELD), '12');
            await enter(page, '١٥');
            assert.equal(await page.inputValue(FIELD), '15');
            await enter(page, ' ۴ ');
            assert.equal(await page.inputValue(FIELD), '4');
            assert.deepEqual(await toasts(page), []);
        });
    });

    for (const bad of ['2', '1', '0', '21', '100', '-4', '4.5', 'abc', '8 players', '']) {
        it(`refuses ${JSON.stringify(bad)}: says so in Persian, marks, pulses and focuses the field, and keeps what was typed`, async () => {
            await onSetup(async (page) => {
                await enter(page, bad);
                assert.deepEqual(await toasts(page), ['تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!']);
                assert.equal(await marked(page), 'true');
                assert.equal(await page.evaluate(() => document.getElementById('setup-players-count').classList.contains('field-error-pulse')), true);
                assert.equal(await page.evaluate(() => document.activeElement.id), 'setup-players-count');
                assert.equal(await page.inputValue(FIELD), bad, 'the text stays so it can be corrected');
            });
        });
    }

    it('brings the focus back to the field when it refuses a value that was settled while the focus was somewhere else', async () => {
        // After typing and pressing Enter the field already has the focus, so that case cannot tell whether the refusal
        // moves it. Here the focus is on the back button when the browser reports the change (an autofill, a
        // keyboard that sends its text and moves on): only the refusal can put the focus on the field.
        await onSetup(async (page) => {
            await page.focus('#btn-back-welcome-2');
            assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-back-welcome-2');
            await page.evaluate(() => {
                const field = document.getElementById('setup-players-count');
                field.value = '50';
                field.dispatchEvent(new Event('change', { bubbles: true }));
            });
            assert.deepEqual(await toasts(page), ['تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!']);
            assert.equal(await marked(page), 'true');
            assert.equal(await page.evaluate(() => document.activeElement.id), 'setup-players-count');
            assert.equal(await page.inputValue(FIELD), '50');
        });
    });

    it('the mark goes away by itself, the toast goes away, and a good value after a bad one is accepted', async () => {
        await onSetup(async (page) => {
            await enter(page, '99');
            assert.equal(await marked(page), 'true');
            await page.waitForFunction(() => !document.getElementById('setup-players-count').hasAttribute('aria-invalid'), null, { timeout: 3000 });
            await page.waitForFunction(() => document.querySelectorAll('#toast-container .toast').length === 0, null, { timeout: 6000 });
            await enter(page, '10');
            assert.equal(await page.inputValue(FIELD), '10');
            assert.deepEqual(await toasts(page), []);
        });
    });

    it('is judged when the person leaves the field too (Tab or a tap elsewhere), not only on Enter', async () => {
        await onSetup(async (page) => {
            await page.fill(FIELD, '50');
            await page.keyboard.press('Tab');
            assert.equal((await toasts(page)).length, 1);
            await page.fill(FIELD, '9');
            await page.click('#screen-setup h2');
            assert.equal(await page.inputValue(FIELD), '9');
            assert.equal((await toasts(page)).length, 1, 'a good value adds no message');
        });
    });

    it('says it in English in the English page, with the limits in plain digits', async () => {
        await onSetup(
            async (page) => {
                assert.equal(await page.textContent('#players-limit-hint'), '3 to 20 players');
                await enter(page, '21');
                assert.deepEqual(await toasts(page), ['You need 3 to 20 players!']);
                assert.equal(await page.getAttribute(FIELD, 'aria-invalid'), 'true');
            },
            { lang: 'en' }
        );
    });

    it('a wrong value does not trap the person: back works, and the field still shows what was typed when they return', async () => {
        await onSetup(async (page) => {
            await enter(page, 'abc');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await page.inputValue(FIELD), 'abc');
        });
    });

    it('a good value is still there after going back and forward', async () => {
        await onSetup(async (page) => {
            await enter(page, '14');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await page.inputValue(FIELD), '14');
        });
    });

    it('works with a finger: tap the field, type, tap away', async () => {
        await onSetup(
            async (page) => {
                await page.tap(FIELD);
                await page.keyboard.press('ControlOrMeta+A');
                await page.keyboard.type('30');
                await page.tap('#screen-setup h2');
                assert.equal((await toasts(page)).length, 1);
                assert.equal(await page.inputValue(FIELD), '30');
            },
            { touch: true }
        );
    });

    it('fits the phone: the field and the hint are inside the screen, the field is at least 44 px high, no sideways scrolling', async () => {
        await onSetup(async (page) => {
            await enter(page, 'abc');
            const g = await page.evaluate(() => {
                const rect = (id) => document.getElementById(id).getBoundingClientRect();
                const f = rect('setup-players-count');
                const h = rect('players-limit-hint');
                return { f: { l: f.left, r: f.right, h: f.height }, h: { l: h.left, r: h.right }, w: window.innerWidth, sw: document.documentElement.scrollWidth };
            });
            assert.ok(g.f.l >= 0 && g.f.r <= g.w && g.h.l >= 0 && g.h.r <= g.w);
            assert.ok(g.f.h >= 44, `field height ${g.f.h}`);
            assert.ok(g.sw <= g.w);
        });
    });

    it('no game starts and nothing is saved, whatever is typed', async () => {
        await onSetup(async (page) => {
            for (const text of ['5', 'abc', '20']) await enter(page, text);
            assert.equal(await page.evaluate(() => localStorage.getItem('mafia_full_state_master')), null);
            assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.screen-view')].filter((el) => !el.classList.contains('hidden')).map((el) => el.id)), ['screen-setup']);
        });
    });
});
