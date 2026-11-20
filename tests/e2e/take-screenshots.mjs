/**
 * Takes the pictures of the screens of steps 3A and 3B that are kept in tests/e2e/screenshots/ (not shipped: the build
 * copies only index.html, manifest.json, sw.js, css, js and assets). Run it by hand after a change to the look:
 *
 *   node tests/e2e/take-screenshots.mjs
 *
 * It builds the production site, opens it in Chromium at 360x740 in the dark default theme, once in Persian and once
 * in English, and writes `<lang>-<nn>-<screen>.png`. The roles are dealt from a fixed random source, so the same
 * game is dealt every time and a new picture differs from the old one only when the look has changed. It is not a
 * test (its name does not end in `.test.mjs`, so `npm run test:e2e` does not run it); the layout is checked by
 * game-flow.test.mjs, game-screens.test.mjs and play-layout.test.mjs. The game after the roles (the night, the
 * morning, the vote, the dusk, the end) is played through the real buttons with the roles read from the saved game.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PHONE, startApp } from './helpers/app.mjs';
import { castVotes, deal, fillNames, fromDusk, goSetup, handOff, idsWithRole, makeNames, pick, playNight, savedPlayers, setCount, setGodfather, toDay } from './helpers/game.mjs';

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const app = await startApp();
try {
    for (const lang of ['fa', 'en']) {
        const context = await app.browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
        await context.clock.install(); // the hand-off guard (800 ms) is jumped over, not waited for
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
            await handOff(page);
        }
        await page.waitForSelector('#reveal-gate:not(.hidden)');
        await shot('reveal-gate');
        await page.click('#btn-reveal-show');
        await page.waitForSelector('#reveal-card:not(.hidden)');
        await shot('reveal-card-godfather');
        await page.click('#btn-reveal-hide');
        await handOff(page);
        for (let i = target + 1; i < players.length; i++) {
            await page.click('#btn-reveal-show');
            if (players[i].role === 'citizen' && i === players.findIndex((p) => p.role === 'citizen')) await shot('reveal-card-citizen');
            await page.click('#btn-reveal-hide');
            await handOff(page);
        }

        // The first night: the three steps, a name picked, the players panel with the roles and the rules.
        await page.waitForSelector('#screen-night:not(.hidden)');
        const ids = (...roles) => idsWithRole(players, ...roles);
        const [doctor] = ids('doctor');
        const [firstMafia, secondMafia] = ids('mafia', 'godfather');
        const citizens = ids('citizen');
        await shot('night-first-step');
        await pick(page, doctor);
        await shot('night-name-picked');
        await page.click('#btn-roles-toggle');
        await page.locator('#rules-details summary').click();
        await shot('night-players-roles-rules', { fullPage: true });
        await page.click('#btn-roles-toggle');
        await page.locator('#rules-details summary').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await pick(page, doctor); // the same name again takes the pick back

        // The mafia take the doctor; the doctor saves a citizen; the detective checks a mafia member: the morning.
        await playNight(page, { mafia: doctor, doctor: citizens[0], detective: firstMafia });
        await shot('morning');
        await page.click('#btn-morning-notes');
        await shot('morning-moderator-notes');
        await toDay(page);

        // The vote: one mafia member gets three votes, a citizen one; then the dusk.
        const day = '#vote-list li[data-id="' + firstMafia + '"] .stepper-plus';
        for (let i = 0; i < 3; i++) await page.click(day);
        await page.click('#vote-list li[data-id="' + citizens[1] + '"] .stepper-plus');
        await shot('day-vote');
        await page.click('#btn-vote-close');
        await page.waitForSelector('#screen-dusk:not(.hidden)');
        await shot('dusk');

        // The second night: the doctor is out, so that step says "nobody alive" and how to pause.
        await fromDusk(page);
        await shot('night-second-nobody-alive');
        await playNight(page, { mafia: citizens[2], detective: secondMafia });
        await toDay(page);
        await castVotes(page, { [secondMafia]: 3 });
        await fromDusk(page);
        await page.waitForSelector('#screen-ended:not(.hidden)');
        await shot('ended', { fullPage: true });

        // The question before a new game, asked from the last undone move.
        await page.click('#btn-undo');
        await page.waitForSelector('#screen-dusk:not(.hidden)');
        await page.click('#btn-undo');
        await page.waitForSelector('#screen-day:not(.hidden)');
        await page.locator('#btn-new-game').scrollIntoViewIfNeeded();
        await page.click('#btn-new-game');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        await shot('new-game-question');
        await context.close();
    }
} finally {
    await app.stop();
}
console.log(`pictures are in ${OUT}`);
