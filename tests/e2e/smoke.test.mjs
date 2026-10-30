/**
 * End-to-end smoke test against the PRODUCTION build (dist), in a real Chromium.
 * Requires: npm install && npx playwright install chromium
 *
 * The shell has two screens: this checks that the app loads without a script error, that "start" leads to the
 * setup placeholder and "back" returns, that the app installs as a PWA (manifest, icons) and that, once the service
 * worker has precached the shell, a first load with no network at all shows the app.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
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

/** Open the app on a fresh phone-sized page, run `fn(page)`, and fail on any script error. */
async function withPage(fn) {
    const context = await browser.newContext({ viewport: PHONE });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

const shown = (page) => page.evaluate(() => [...document.querySelectorAll('.screen-view')].filter((el) => !el.classList.contains('hidden')).map((el) => el.id));

describe('mafia (production build)', () => {
    it('loads the welcome screen with no script errors: the name, the tagline, the round start button', async () => {
        await withPage(async (page) => {
            assert.match(await page.title(), /مافیا/);
            assert.deepEqual(await shown(page), ['screen-welcome']);
            assert.equal(await page.textContent('#welcome-title'), '🎭 مافیا');
            assert.match(await page.textContent('#screen-welcome p'), /دستیار راوی/);
            assert.equal(await page.isVisible('#btn-nav-setup'), true);
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
        });
    });

    it('start leads to the setup placeholder and back returns to the welcome screen, as often as asked', async () => {
        await withPage(async (page) => {
            for (let round = 0; round < 3; round++) {
                await page.click('#btn-nav-setup');
                await page.waitForSelector('#screen-setup:not(.hidden)');
                assert.deepEqual(await shown(page), ['screen-setup'], `round ${round}`);
                assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H2', 'the focus moved to the new screen\'s heading');
                await page.click('#btn-back-welcome-2');
                await page.waitForSelector('#screen-welcome:not(.hidden)');
                assert.deepEqual(await shown(page), ['screen-welcome'], `round ${round}`);
                assert.equal(await page.evaluate(() => document.activeElement.id), 'welcome-title');
            }
        });
    });

    it('the setup placeholder shows only the players-count field (3 to 20, with its hint) and a back button; no game starts', async () => {
        await withPage(async (page) => {
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            const controls = await page.evaluate(() => [...document.querySelectorAll('#screen-setup input, #screen-setup select, #screen-setup textarea, #screen-setup button, #screen-setup a')].filter((el) => el.offsetParent !== null).map((el) => el.id));
            assert.deepEqual(controls, ['setup-players-count', 'btn-back-welcome-2']);
            assert.equal(await page.inputValue('#setup-players-count'), '8');
            assert.equal(await page.textContent('#players-limit-hint'), 'بین ۳ تا ۲۰ نفر');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mafia_full_state_master'))), null, 'nothing is saved: there is no match');
        });
    });

    it('is a PWA: the manifest is valid and every icon it names exists with the size it declares', async () => {
        const manifest = await (await fetch(`${baseUrl}manifest.json`)).json();
        assert.equal(manifest.name, 'مافیا');
        assert.equal(manifest.lang, 'fa');
        assert.equal(manifest.dir, 'rtl');
        assert.equal(manifest.display, 'standalone');
        assert.ok(manifest.icons.length >= 3);
        for (const icon of manifest.icons) {
            const response = await fetch(new URL(icon.src, baseUrl));
            assert.equal(response.status, 200, icon.src);
            const bytes = new Uint8Array(await response.arrayBuffer());
            assert.deepEqual([...bytes.slice(1, 4)], [0x50, 0x4e, 0x47], `${icon.src} is a PNG`);
            const view = new DataView(bytes.buffer);
            assert.equal(`${view.getUint32(16)}x${view.getUint32(20)}`, icon.sizes, `${icon.src} is ${icon.sizes}`);
        }
    });

    it('installs the service worker, precaches the shell, and works offline', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(baseUrl);
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

        const cacheNames = await page.evaluate(() => caches.keys());
        assert.ok(cacheNames.some((name) => name.startsWith('mafia-shell-')), cacheNames.join());

        await context.setOffline(true);
        await page.reload();
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await page.click('#btn-nav-setup');
        await page.waitForSelector('#screen-setup:not(.hidden)');
        await context.close();
    });
});
