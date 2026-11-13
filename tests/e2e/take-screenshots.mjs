/**
 * Takes the pictures of the screens of step 3A that are kept in tests/e2e/screenshots/ (not shipped: the build
 * copies only index.html, manifest.json, sw.js, css, js and assets). Run it by hand after a change to the look:
 *
 *   node tests/e2e/take-screenshots.mjs
 *
 * It builds the production site, opens it in Chromium at 360x740 in the dark default theme, once in Persian and once
 * in English, and writes `<lang>-<nn>-<screen>.png`. The roles are dealt from a fixed random source, so the same
 * game is dealt every time and a new picture differs from the old one only when the look has changed. It is not a
 * test (its name does not end in `.test.mjs`, so `npm run test:e2e` does not run it); the layout is checked by
 * game-flow.test.mjs and game-screens.test.mjs.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PHONE, startApp } from './helpers/app.mjs';
import { deal, fillNames, goSetup, makeNames, savedPlayers, setCount, setGodfather } from './helpers/game.mjs';

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const app = await startApp();
try {
    for (const lang of ['fa', 'en']) {
        const context = await app.browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
        await context.addInitScript((language) => {
            if (!sessionStorage.getItem('shot_seeded')) {
                sessionStorage.setItem('shot_seeded', '1');
                localStorage.setItem('mafia_lang', language);
                localStorage.setItem('mafia_selected_theme', 'default');
            }
            let seed = 20260101;
            crypto.getRandomValues = (array) => {
                for (let i = 0; i < array.length; i++) {
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                    array[i] = seed;
                }
                return array;
            };
        }, lang);
        const page = await context.newPage();
        let n = 0;
        const shot = async (name, options = {}) => {
            await page.waitForTimeout(250);
            await page.screenshot({ path: `${OUT}${lang}-${String(++n).padStart(2, '0')}-${name}.png`, ...options });
        };

        await page.goto(app.baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');

        // A saved game makes the welcome screen offer "resume": deal one, reload, shoot, then start over.
        await goSetup(page);
        await deal(page);
        await page.reload();
        await page.waitForSelector('#btn-resume-game:not(.hidden)');
        await shot('welcome-with-resume');
        await page.click('#btn-resume-game');
        await page.waitForSelector('#reveal-gate:not(.hidden)');
        await page.click('#btn-reveal-back');
        await page.click('#btn-confirm-yes');
        await page.waitForSelector('#screen-setup:not(.hidden)');

        // The form: the top of it, the whole of it, a problem, the help dialog.
        await setCount(page, 8);
        await shot('setup');
        await shot('setup-whole-page', { fullPage: true });
        await setCount(page, 5);
        await page.locator('#godfather-hint').scrollIntoViewIfNeeded();
        await shot('setup-godfather-disabled');
        await setCount(page, 8);
        await page.fill('#setup-name-3', '');
        await page.click('#btn-deal');
        await page.waitForSelector('#toast-container .toast');
        await shot('setup-error');
        await page.fill('#setup-name-3', lang === 'fa' ? 'سارا' : 'Sara');
        await page.click('#btn-info-godfather');
        await page.waitForSelector('#info-modal:not(.hidden)');
        await shot('setup-help-dialog');
        await page.click('#btn-info-modal-close');

        // The reveal: the gate, then the card of the first member of the mafia (the godfather's, when there is one).
        await fillNames(page, makeNames(8, lang).map((name, i) => (i === 0 ? (lang === 'fa' ? 'علی' : 'Ali') : name)));
        await setGodfather(page, true);
        await deal(page);
        const players = await savedPlayers(page);
        const target = Math.max(0, players.findIndex((p) => p.role === 'godfather'));
        for (let i = 0; i < target; i++) {
            await page.click('#btn-reveal-show');
            await page.click('#btn-reveal-hide');
        }
        await page.waitForSelector('#reveal-gate:not(.hidden)');
        await shot('reveal-gate');
        await page.click('#btn-reveal-show');
        await page.waitForSelector('#reveal-card:not(.hidden)');
        await shot('reveal-card-godfather');
        await page.click('#btn-reveal-hide');
        for (let i = target + 1; i < players.length; i++) {
            await page.click('#btn-reveal-show');
            if (players[i].role === 'citizen' && i === players.findIndex((p) => p.role === 'citizen')) await shot('reveal-card-citizen');
            await page.click('#btn-reveal-hide');
        }

        // The moderator's list, hidden and shown, and the question before a new game.
        await page.waitForSelector('#screen-moderator:not(.hidden)');
        await shot('moderator-roles-hidden');
        await page.click('#btn-roles-toggle');
        await shot('moderator-roles-shown');
        await page.click('#btn-new-game');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        await shot('moderator-new-game-question');
        await context.close();
    }
} finally {
    await app.stop();
}
console.log(`pictures are in ${OUT}`);
