/**
 * Writes tests/e2e/fixtures/persian-baseline.json: what the Persian welcome and setup screens show, as the
 * recorder in helpers/record.mjs reads them, at 360x740.
 *
 *   node scripts/build.mjs --out /tmp/before
 *   node tests/e2e/fixtures/make-persian-baseline.mjs /tmp/before
 *
 * The argument is a built site (the folder with index.html and sw.js). tests/e2e/lang-switch.test.mjs compares
 * the current build with this file, so "the Persian screens look exactly as they did" is checked against a
 * recording and not against itself. The language switch is left out of the recording (see helpers/record.mjs).
 *
 * This first recording was made from this project's own first build (version 0.1.0), because the project had no
 * earlier one: it guards the Persian text from now on, it does not prove anything about the past. Do not
 * regenerate the file from a newer build to make a failing test pass: a difference there is a change to the
 * Persian screens and has to be a decision (step 2 adds its screens and records them in the same way).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../../scripts/serve.mjs';
import { PHONE } from '../helpers/app.mjs';
import { recordScreen } from '../helpers/record.mjs';

const site = process.argv[2];
if (!site) throw new Error('usage: node make-persian-baseline.mjs <built site folder>');

const server = await startServer(site, 0);
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    const welcome = await recordScreen(page);
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
    const setup = await recordScreen(page);
    const indexHtml = readFileSync(`${site}/index.html`);
    const out = {
        _source: "mafia 0.1.0 (step 1: welcome and setup), this project's own first build with scripts/build.mjs, Persian (no saved language), 360x740",
        _indexHtmlSha256: createHash('sha256').update(indexHtml).digest('hex'),
        welcome,
        setup
    };
    writeFileSync(fileURLToPath(new URL('./persian-baseline.json', import.meta.url)), JSON.stringify(out, null, 2) + '\n');
    console.log(`welcome: ${welcome.text.length} lines, ${welcome.attrs.length} attrs; setup: ${setup.text.length} lines, ${setup.attrs.length} attrs`);
} finally {
    await browser.close();
    server.close();
}
