/**
 * End-to-end test of the language switch, against the PRODUCTION build in a real Chromium at 360x740, in the
 * style of smoke.test.mjs. The Persian screens are compared with the recording in fixtures/persian-baseline.json
 * (made by fixtures/make-persian-baseline.mjs with the recorder of helpers/record.mjs), so "Persian looks exactly
 * as it did" is checked against a recording and a round trip through English cannot leave anything behind.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { PERSIAN_LETTER, assertMatchesBaseline, persianIn, recordModal, recordScreen } from './helpers/record.mjs';

/** The Persian welcome and setup screens as they were recorded (see fixtures/make-persian-baseline.mjs). */
const baseline = JSON.parse(readFileSync(new URL('./fixtures/persian-baseline.json', import.meta.url), 'utf8'));

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

/** Open the app on a fresh phone-sized page, run `fn(page, context)`, and fail on any script error. */
async function withPage(fn, options = {}) {
    const context = await browser.newContext({ viewport: PHONE, ...options });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const htmlState = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
const pressed = (page) => page.evaluate(() => ({ fa: document.getElementById('btn-lang-fa').getAttribute('aria-pressed'), en: document.getElementById('btn-lang-en').getAttribute('aria-pressed') }));
const savedLang = (page) => page.evaluate(() => localStorage.getItem('mafia_lang'));
const toasts = (page) => page.locator('#toast-container .toast').allTextContents();

async function goSetup(page) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
}
async function goWelcome(page) {
    await page.click('#btn-back-welcome-2');
    await page.waitForSelector('#screen-welcome:not(.hidden)');
}

/** Where the two buttons are, so the test can check order, size and that nothing sticks out of the phone. */
const switchGeometry = (page) =>
    page.evaluate(() => {
        const rect = (id) => document.getElementById(id).getBoundingClientRect();
        const fa = rect('btn-lang-fa');
        const en = rect('btn-lang-en');
        return {
            faLeft: fa.left,
            enLeft: en.left,
            minHeight: Math.min(fa.height, en.height),
            minLeft: Math.min(fa.left, en.left),
            maxRight: Math.max(fa.right, en.right),
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth
        };
    });

function assertSwitchFits(geometry, where) {
    assert.ok(geometry.faLeft < geometry.enLeft, `${where}: "فارسی" is left of "English" in both languages`);
    assert.ok(geometry.minHeight >= 44, `${where}: touch targets are at least 44px high (${geometry.minHeight})`);
    assert.ok(geometry.minLeft >= 0 && geometry.maxRight <= geometry.innerWidth, `${where}: the buttons stay inside the screen`);
    assert.ok(geometry.scrollWidth <= geometry.innerWidth, `${where}: no sideways scrolling`);
}

describe('the language switch (production build, 360x740)', () => {
    it('is Persian by default; English leaves no Persian on the welcome screen, the setup screen or the dialog; English survives a reload', async () => {
        await withPage(async (page) => {
            assert.deepEqual(await htmlState(page), { lang: 'fa', dir: 'rtl' });
            assert.deepEqual(await pressed(page), { fa: 'true', en: 'false' });
            assert.equal(await savedLang(page), null, 'nothing is saved until someone chooses');
            assertSwitchFits(await switchGeometry(page), 'Persian');

            await page.click('#btn-lang-en');

            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' });
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
            assert.equal(await savedLang(page), 'en');
            assertSwitchFits(await switchGeometry(page), 'English');
            assert.equal(await page.textContent('#btn-lang-fa'), 'فارسی', 'the labels are fixed text in their own language');
            assert.equal(await page.textContent('#btn-lang-en'), 'English');
            assert.equal(await page.getAttribute('#btn-lang-fa', 'lang'), 'fa');
            assert.equal(await page.getAttribute('#btn-lang-en', 'lang'), 'en');
            assert.equal(await page.getAttribute('.lang-switch', 'aria-label'), 'Language');

            // Only the two language labels may hold a Persian letter, and they are left out of the recording.
            const welcome = await recordScreen(page);
            assert.deepEqual(persianIn(welcome), [], 'welcome screen');
            assert.ok(welcome.text.some((line) => /Start game/.test(line)), 'and it really is English');
            assert.equal(await page.textContent('#welcome-title'), '🎭 Mafia');

            await goSetup(page);
            const setup = await recordScreen(page);
            assert.deepEqual(persianIn(setup), [], 'setup screen (text, attributes, fields, select options, title)');
            assert.equal(await page.textContent('#players-limit-hint'), '3 to 20 players');

            assert.deepEqual(persianIn(await recordModal(page, '#confirm-modal')), [], 'the confirm dialog (hidden, but its texts are English)');

            await goWelcome(page);
            await page.reload();
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.deepEqual(await htmlState(page), { lang: 'en', dir: 'ltr' }, 'English is kept after a reload');
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
            assert.ok(!PERSIAN_LETTER.test(await page.title()), 'the page title is English');
            assert.deepEqual(persianIn(await recordScreen(page)), []);
        });
    });

    it('clicking the language that is already active changes nothing', async () => {
        await withPage(async (page) => {
            await page.click('#btn-lang-fa');
            assert.deepEqual(await htmlState(page), { lang: 'fa', dir: 'rtl' });
            assert.equal(await savedLang(page), null, 'Persian was already active: nothing is saved');
            await page.click('#btn-lang-en');
            await page.click('#btn-lang-en');
            assert.deepEqual(await pressed(page), { fa: 'false', en: 'true' });
        });
    });

    it('round trip: Persian -> English -> Persian shows exactly what the first Persian recording showed, and exactly what was recorded', async () => {
        await withPage(async (page) => {
            // Welcome and setup, with the switch itself included (it is the same in both Persian recordings).
            const snap = async (options) => {
                const welcome = await recordScreen(page, options);
                await goSetup(page);
                const setup = await recordScreen(page, options);
                await goWelcome(page);
                return { welcome, setup };
            };

            const persianFirst = await snap({ includeSwitch: true });
            await page.click('#btn-lang-en');
            const english = await snap({ includeSwitch: true });
            await page.click('#btn-lang-fa');
            const persianAgain = await snap({ includeSwitch: true });

            // Not vacuous: English really was different on every part that is recorded.
            for (const screen of ['welcome', 'setup']) {
                assert.notDeepEqual(english[screen].text, persianFirst[screen].text, `${screen}: text changed`);
                assert.notDeepEqual(english[screen].attrs, persianFirst[screen].attrs, `${screen}: attributes changed`);
            }
            assert.notDeepEqual(english.welcome.selects, persianFirst.welcome.selects, 'the theme names changed');
            assert.notEqual(english.welcome.title, persianFirst.welcome.title);
            assert.notEqual(english.welcome.description, persianFirst.welcome.description);

            // Nothing stale from English is left: identical to the first recording, part by part.
            assert.deepEqual(persianAgain.welcome, persianFirst.welcome);
            assert.deepEqual(persianAgain.setup, persianFirst.setup);
            assert.deepEqual(await pressed(page), { fa: 'true', en: 'false' });

            // And identical to the recording on disk, with the switch left out (it is the one element whose labels are fixed).
            assertMatchesBaseline(await recordScreen(page), baseline.welcome, 'welcome');
            await goSetup(page);
            assertMatchesBaseline(await recordScreen(page), baseline.setup, 'setup');
        });
    });

    it('the Persian welcome and setup screens do not differ from the recording', async () => {
        await withPage(async (page) => {
            assertMatchesBaseline(await recordScreen(page), baseline.welcome, 'welcome');
            await goSetup(page);
            assertMatchesBaseline(await recordScreen(page), baseline.setup, 'setup');
        });
    });

    it('what the person typed in the players-count field is never changed by a switch', async () => {
        await withPage(async (page) => {
            await goSetup(page);
            await page.fill('#setup-players-count', '۱۲');
            await page.press('#setup-players-count', 'Enter');
            assert.equal(await page.inputValue('#setup-players-count'), '12', 'a valid count is written back in plain digits');
            await goWelcome(page);
            await page.click('#btn-lang-en');
            await goSetup(page);
            assert.equal(await page.inputValue('#setup-players-count'), '12');

            await page.fill('#setup-players-count', 'abc');
            await page.press('#setup-players-count', 'Enter');
            await goWelcome(page);
            await page.click('#btn-lang-fa');
            await goSetup(page);
            assert.equal(await page.inputValue('#setup-players-count'), 'abc', 'even an invalid text stays: the person is still correcting it');
        });
    });

    it('the limit hint and the error toast follow the language', async () => {
        await withPage(async (page) => {
            await goSetup(page);
            assert.equal(await page.textContent('#players-limit-hint'), 'بین ۳ تا ۲۰ نفر');
            await page.fill('#setup-players-count', '2');
            await page.press('#setup-players-count', 'Enter');
            assert.deepEqual(await toasts(page), ['تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!']);

            await goWelcome(page);
            await page.click('#btn-lang-en');
            await goSetup(page);
            assert.equal(await page.textContent('#players-limit-hint'), '3 to 20 players');
            await page.fill('#setup-players-count', '21');
            await page.press('#setup-players-count', 'Enter');
            assert.deepEqual(await toasts(page), ['You need 3 to 20 players!']);
        });
    });

    it('a toast that is still on screen does not outlive a switch in the old language', async () => {
        await withPage(async (page) => {
            await goSetup(page);
            await page.fill('#setup-players-count', '1');
            await page.press('#setup-players-count', 'Enter');
            await page.waitForSelector('#toast-container .toast');
            assert.ok(PERSIAN_LETTER.test(await page.textContent('#toast-container')), 'the toast is Persian');
            await goWelcome(page);
            await page.click('#btn-lang-en');
            assert.equal(await page.locator('#toast-container .toast').count(), 0, 'no Persian toast is left on an English screen');
        });
    });
});
