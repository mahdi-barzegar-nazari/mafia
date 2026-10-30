/**
 * Offline first load, against the PRODUCTION build in a real Chromium: once the service worker has installed, a person
 * who opens the app with no network at all (a new tab, not a reload) gets the whole app from the precache. The
 * precache is built by scripts/build.mjs from the files it ships, so the test also walks the real import graph of
 * js/main.js and demands that every module of it is in the cache: a module the worker did not list would work
 * online and break only offline, which is the failure nobody sees while developing.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PHONE, newPage, startApp } from './helpers/app.mjs';
import { persianIn, recordScreen } from './helpers/record.mjs';

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

/** Every module reachable from `entry` by static `import`/`export ... from` or `import('...')` with a string. */
async function importGraph(entry) {
    const seen = new Set();
    const queue = [new URL(entry, baseUrl).href];
    const IMPORT = /(?:\bimport\s*(?:[\w*{}\s,$]*?\s*from\s*)?|\bexport\s*(?:\*|\{[^}]*\})\s*from\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
    while (queue.length) {
        const url = queue.pop();
        if (seen.has(url)) continue;
        seen.add(url);
        const response = await fetch(url);
        assert.equal(response.status, 200, `${url} can be fetched`);
        const source = await response.text();
        for (const match of source.matchAll(IMPORT)) {
            if (match[1].startsWith('.')) queue.push(new URL(match[1], url).href);
        }
    }
    return [...seen].sort();
}

/** The paths the built sw.js lists in its PRECACHE array. */
async function precacheList() {
    const source = await (await fetch(`${baseUrl}sw.js`)).text();
    const list = source.match(/^const PRECACHE = (\[[\s\S]*?\]);$/m);
    assert.ok(list, 'sw.js has a PRECACHE array');
    return JSON.parse(list[1]);
}

/** A context whose service worker has installed and controls the page; returns it, still online. */
async function installedContext() {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.close();
    return context;
}

describe('the precache (production build)', () => {
    it('the build has a real file list, in the sw.js that is served', async () => {
        const list = await precacheList();
        assert.ok(list.length >= 30, `only ${list.length} files in the precache`);
        assert.ok(list.includes('./index.html') || list.includes('./'), 'the page itself');
        for (const file of ['./manifest.json', './css/style.css', './js/main.js', './js/preinit.js', './assets/fonts/Vazirmatn-Variable.woff2', './assets/icons/icon-192.png']) {
            assert.ok(list.includes(file), `${file} is listed`);
        }
        assert.ok(!list.some((file) => file.endsWith('sw.js')), 'the worker does not cache itself');
    });

    it('lists every module that main.js (and preinit.js) can load', async () => {
        const list = new Set((await precacheList()).map((file) => new URL(file, baseUrl).href));
        const modules = await importGraph('js/main.js');
        assert.ok(modules.length >= 25, `the walk found only ${modules.length} modules`);
        for (const module of [...modules, new URL('js/preinit.js', baseUrl).href]) assert.ok(list.has(module), `${module} is not in the precache`);
    });

    it('the cache the worker filled holds exactly that list, every entry a real answer', async () => {
        const context = await installedContext();
        try {
            const page = await context.newPage();
            await page.goto(baseUrl);
            const cached = await page.evaluate(async () => {
                const names = (await caches.keys()).filter((name) => name.startsWith('mafia-shell-'));
                const cache = await caches.open(names[0]);
                const entries = [];
                for (const request of await cache.keys()) {
                    const response = await cache.match(request);
                    entries.push({ url: request.url, status: response.status, bytes: (await response.arrayBuffer()).byteLength });
                }
                return { names, entries };
            });
            assert.equal(cached.names.length, 1, 'one shell cache');
            const list = (await precacheList()).map((file) => new URL(file, baseUrl).href);
            assert.deepEqual(cached.entries.map((e) => e.url).sort(), [...new Set(list)].sort());
            for (const entry of cached.entries) {
                assert.equal(entry.status, 200, entry.url);
                assert.ok(entry.bytes > 0, `${entry.url} is not empty`);
            }
        } finally {
            await context.close();
        }
    });
});

describe('a first load with no network', () => {
    it('shows the whole app from the cache: welcome, setup, back, and no request goes to the network', async () => {
        const context = await installedContext();
        try {
            await context.setOffline(true);
            const { page, problems } = await newPage(context);
            const answered = [];
            page.on('response', (response) => answered.push({ url: response.url(), fromWorker: response.fromServiceWorker() }));
            await page.goto(baseUrl);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.equal(await page.textContent('#welcome-title'), '🎭 مافیا');
            await page.click('#btn-nav-setup');
            await page.waitForSelector('#screen-setup:not(.hidden)');
            assert.equal(await page.inputValue('#setup-players-count'), '8');
            await page.click('#btn-back-welcome-2');
            await page.waitForSelector('#screen-welcome:not(.hidden)');

            const sameOrigin = answered.filter((r) => r.url.startsWith(baseUrl));
            assert.ok(sameOrigin.length >= 25, `only ${sameOrigin.length} responses seen`);
            assert.deepEqual(sameOrigin.filter((r) => !r.fromWorker).map((r) => r.url), [], 'everything came from the service worker');
            assert.deepEqual(problems, []);
        } finally {
            await context.close();
        }
    });

    it('is a working app, not a picture: the language and the theme can be changed, and the fixed font is there', async () => {
        const context = await installedContext();
        try {
            await context.setOffline(true);
            const { page, problems } = await newPage(context);
            await page.goto(baseUrl);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            await page.click('#btn-lang-en');
            assert.deepEqual(persianIn(await recordScreen(page)), []);
            await page.selectOption('#theme-selector', 'ocean');
            assert.equal(await page.getAttribute('body', 'data-theme'), 'ocean');
            const font = await page.evaluate(async () => {
                await document.fonts.ready;
                return [...document.fonts].map((face) => [face.family, face.status]);
            });
            assert.ok(font.some(([family, status]) => /Vazirmatn/i.test(family) && status === 'loaded'), JSON.stringify(font));
            assert.deepEqual(problems, []);
        } finally {
            await context.close();
        }
    });

    it('a saved English choice is honoured on that first offline load, with no flash of the Persian page', async () => {
        const context = await installedContext();
        try {
            await context.addInitScript(() => localStorage.setItem('mafia_lang', 'en'));
            await context.setOffline(true);
            const { page, problems } = await newPage(context);
            await page.goto(baseUrl);
            await page.waitForSelector('#screen-welcome:not(.hidden)');
            assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ['en', 'ltr']);
            assert.equal(await page.textContent('#welcome-title'), '🎭 Mafia');
            assert.deepEqual(problems, []);
        } finally {
            await context.close();
        }
    });
});
