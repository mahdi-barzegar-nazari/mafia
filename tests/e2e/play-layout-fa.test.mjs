/**
 * The game screens (night, morning, day, dusk, ended, with the players panel, the rules, the moderator notes and the
 * vote open) for 3, 8 and 20 players in all eight themes, in Persian, at 360x740: nothing sticks out sideways, every
 * control is at least 44px, the text has the contrast it needs. The same in English is in play-layout-en.test.mjs
 * (two files, so that they run side by side). The reaching of each screen is in helpers/layoutRun.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import { after, before, describe, it } from 'node:test';
import { startApp } from './helpers/app.mjs';
import { THEMES, withGame } from './helpers/game.mjs';
import { runLayout } from './helpers/layoutRun.mjs';

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

describe('the game screens in all eight themes (fa, 360x740)', () => {
    for (const theme of THEMES) {
        it(`${theme}: 3, 8 and 20 players, every game screen fits and can be read`, async () => {
            await withGame(browser, baseUrl, (page) => runLayout(page, { lang: 'fa', theme }), { lang: 'fa', theme });
        });
    }
});
