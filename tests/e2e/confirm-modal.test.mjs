/**
 * The generic confirm dialog and the machinery around it (focus trap, inert page, focus given back), in a real
 * Chromium at 360x740 against the PRODUCTION build. Nothing in the shell opens the dialog yet (step 2's "are you sure?"
 * questions will), so the test opens it the way the app will, through the real `dispatch` of the running page, and
 * checks what a keyboard or screen-reader user gets. The unit tests of the same machinery are tests/unit/modal.test.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordModal } from './helpers/record.mjs';

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

async function withPage(fn, { lang } = {}) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        if (lang) await context.addInitScript((value) => localStorage.setItem('mafia_lang', value), lang);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

/** Dispatch an action through the module instance the page itself is using. */
const act = (page, type, payload) =>
    page.evaluate(
        async ({ type, payload }) => {
            const { dispatch } = await import('./js/core/dispatch.js');
            dispatch({ type, payload });
        },
        { type, payload }
    );
const focusedId = (page) => page.evaluate(() => document.activeElement.id);
const open = async (page) => {
    await act(page, 'OPEN_MODAL', 'confirm-modal');
    await page.waitForSelector('#confirm-modal:not(.hidden)');
};

describe('the confirm dialog (production build, 360x740)', () => {
    it('is closed at start, and is a labelled modal dialog', async () => {
        await withPage(async (page) => {
            assert.equal(await page.isVisible('#confirm-modal'), false);
            assert.equal(await page.getAttribute('#confirm-modal', 'role'), 'dialog');
            assert.equal(await page.getAttribute('#confirm-modal', 'aria-modal'), 'true');
            assert.equal(await page.getAttribute('#confirm-modal', 'aria-labelledby'), 'confirm-modal-title');
        });
    });

    it('opening it shows the question in Persian, puts the focus on the first button, blocks the page behind it and stops it scrolling', async () => {
        await withPage(async (page) => {
            await open(page);
            assert.deepEqual((await recordModal(page, '#confirm-modal')).text, [fa['confirm.title'], fa['confirm.text'], fa['confirm.yes'], fa['confirm.no']]);
            assert.equal(await focusedId(page), 'btn-confirm-yes');
            assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), true);
            assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
            assert.equal(await page.isVisible('#btn-nav-setup'), true, 'still drawn behind the scrim');
            await page.click('#btn-nav-setup', { trial: true, timeout: 500 }).then(
                () => assert.fail('the page behind the dialog must not take clicks'),
                () => {}
            );
        });
    });

    it('is English in the English page, with no Persian letter', async () => {
        await withPage(
            async (page) => {
                await open(page);
                const modal = await recordModal(page, '#confirm-modal');
                assert.deepEqual(modal.text, [en['confirm.title'], en['confirm.text'], en['confirm.yes'], en['confirm.no']]);
                assert.deepEqual(persianIn(modal), []);
            },
            { lang: 'en' }
        );
    });

    it('Tab and Shift+Tab stay inside the dialog: from the last button to the first and back', async () => {
        await withPage(async (page) => {
            await open(page);
            const seen = [await focusedId(page)];
            for (let i = 0; i < 5; i++) {
                await page.keyboard.press('Tab');
                seen.push(await focusedId(page));
            }
            assert.deepEqual(seen, ['btn-confirm-yes', 'btn-confirm-no', 'btn-confirm-yes', 'btn-confirm-no', 'btn-confirm-yes', 'btn-confirm-no']);
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('Shift+Tab');
                seen.push(await focusedId(page));
            }
            assert.deepEqual(seen.slice(6), ['btn-confirm-yes', 'btn-confirm-no', 'btn-confirm-yes']);
        });
    });

    it('"Cancel" closes it, gives the page back and returns the focus to the control that had it before', async () => {
        await withPage(async (page) => {
            await page.focus('#btn-nav-setup');
            await open(page);
            await page.click('#btn-confirm-no');
            await page.waitForSelector('#confirm-modal.hidden', { state: 'attached' });
            assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), false);
            assert.equal(await page.evaluate(() => document.body.style.overflow), '');
            assert.equal(await focusedId(page), 'btn-nav-setup');
            // And the page works again.
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
        });
    });

    it('"Yes" closes it the same way, and with nothing waiting it does nothing else', async () => {
        await withPage(async (page) => {
            await page.focus('#btn-lang-en');
            await open(page);
            await page.keyboard.press('Enter');
            await page.waitForSelector('#confirm-modal.hidden', { state: 'attached' });
            assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), false);
            assert.equal(await focusedId(page), 'btn-lang-en');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa', 'nothing was confirmed, so nothing changed');
        });
    });

    it('can be opened and closed again and again without leaving the page blocked or the trap doubled', async () => {
        await withPage(async (page) => {
            for (let round = 0; round < 4; round++) {
                await open(page);
                await page.keyboard.press('Tab');
                assert.equal(await focusedId(page), 'btn-confirm-no', `round ${round}`);
                await page.click('#btn-confirm-no');
                await page.waitForSelector('#confirm-modal.hidden', { state: 'attached' });
                assert.equal(await page.evaluate(() => document.getElementById('main-content-root').inert), false, `round ${round}`);
            }
        });
    });

    it('fits the phone: the card is inside the screen and both buttons can be tapped', async () => {
        await withPage(async (page) => {
            await open(page);
            const g = await page.evaluate(() => {
                const r = (sel) => document.querySelector(sel).getBoundingClientRect();
                const card = r('#confirm-modal .modal-card');
                return { card: { l: card.left, r: card.right, t: card.top, b: card.bottom }, yes: r('#btn-confirm-yes').height, no: r('#btn-confirm-no').height, w: window.innerWidth, h: window.innerHeight };
            });
            assert.ok(g.card.l >= 0 && g.card.r <= g.w && g.card.t >= 0 && g.card.b <= g.h);
            assert.ok(g.yes >= 44 && g.no >= 44, `buttons ${g.yes}px and ${g.no}px high`);
        });
    });
});
