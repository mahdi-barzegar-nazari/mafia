/**
 * Shared plumbing for the browser tests of the game itself (setup form, reveal, moderator's list): how a test
 * opens the app in a language and a theme, fills the form, deals, walks the reveal and reads back the saved game,
 * and the layout checks (nothing sticks out sideways, every control is a finger-sized target).
 *
 * The texts a test expects are read from the catalogs (js/i18n) and not typed again here, so a reworded text does
 * not break a test, while a text that is missing, stale or in the wrong language still does.
 */
import assert from 'node:assert/strict';
import { en } from '../../../js/i18n/en.js';
import { fa } from '../../../js/i18n/fa.js';
import { PHONE, newPage } from './app.mjs';

export const SAVE_KEY = 'mafia_full_state_master';
export const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
export const LANGS = ['fa', 'en'];
export const ROLE_IDS = ['mafia', 'godfather', 'doctor', 'detective', 'citizen'];
const MAFIA_TEAM = ['mafia', 'godfather'];
const CATALOGS = { fa, en };

/** `n` written with the digits of `lang` (Persian digits in Persian). */
export const digits = (n, lang) => (lang === 'fa' ? String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(n));

/** The catalog text of `key` in `lang`, with its `{placeholders}` filled in. */
export function say(lang, key, params = {}) {
    const text = CATALOGS[lang][key];
    assert.equal(typeof text, 'string', `${lang} has the key ${key}`);
    return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}

export const roleName = (lang, role) => say(lang, `role.${role}.name`);
export const roleDoes = (lang, role) => say(lang, `role.${role}.does`);

/**
 * Open the app on a fresh phone-sized page in `lang` (and `theme`), run `fn(page, context)`, and fail on any script
 * error. Reduced motion is on, so a screen change does not leave a fade in progress while a test measures.
 * `touch` makes it a touch phone.
 */
export async function withGame(browser, baseUrl, fn, { lang = 'fa', theme, touch = false, storage = {} } = {}) {
    const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce', hasTouch: touch, isMobile: touch });
    const { page, problems } = await newPage(context);
    try {
        const seed = { ...(lang === 'fa' ? {} : { mafia_lang: lang }), ...(theme ? { mafia_selected_theme: theme } : {}), ...storage };
        await context.addInitScript((entries) => {
            // Only the first load of this page: a reload (which the test asks for) must keep what the app saved.
            if (sessionStorage.getItem('mafia_test_seeded')) return;
            sessionStorage.setItem('mafia_test_seeded', '1');
            for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        }, seed);
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        await fn(page, context);
        assert.deepEqual(problems, []);
    } finally {
        await context.close();
    }
}

/** The ids of the screens that are showing. */
export const shown = (page) => page.evaluate(() => [...document.querySelectorAll('.screen-view')].filter((el) => !el.classList.contains('hidden')).map((el) => el.id));

/** What the app saved: `{ version, state }`, or null. */
export const savedRecord = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
export const savedState = async (page) => (await savedRecord(page))?.state ?? null;
export const savedPlayers = async (page) => (await savedState(page)).game.setup.players;

export async function goSetup(page) {
    await page.click('#btn-nav-setup');
    await page.waitForSelector('#screen-setup:not(.hidden)');
}

/** Type a players count and press Enter (the moment the browser says the person is done: `change`). */
export async function setCount(page, count) {
    await page.fill('#setup-players-count', String(count));
    await page.press('#setup-players-count', 'Enter');
}

/** The values of the name fields, in order. */
export const nameValues = (page) => page.evaluate(() => [...document.querySelectorAll('#setup-names .name-input')].map((input) => input.value));

export async function fillNames(page, names) {
    for (let i = 0; i < names.length; i++) await page.fill(`#setup-name-${i + 1}`, names[i]);
}

/**
 * `count` different names that a name field accepts whole. The first is as wide as a 24-letter name can be (a
 * line of W's: it must fit the phone without sticking out); the others are told apart by a padded number, so no
 * name is a part of another, which a test of "who sees whom" needs. Persian names in the Persian page.
 */
export function makeNames(count, lang = 'fa') {
    return Array.from({ length: count }, (_, i) => (i === 0 ? 'W'.repeat(24) : `${lang === 'fa' ? 'کاربر' : 'Player'} ${String(i + 1).padStart(2, '0')}`));
}

/** Switch the godfather option on or off through its visible switch. */
export async function setGodfather(page, on) {
    const box = page.locator('#setup-godfather');
    if ((await box.isChecked()) !== on) await page.locator('label.switch:has(#setup-godfather)').click();
    assert.equal(await box.isChecked(), on);
}

/** Press "deal roles" and wait for the first gate. */
export async function deal(page) {
    await page.click('#btn-deal');
    await page.waitForSelector('#screen-reveal:not(.hidden)');
    await page.waitForSelector('#reveal-gate:not(.hidden)');
}

/** The role card on screen: what each part says, and the names of the team line (null when there is none). */
export const readCard = (page) =>
    page.evaluate(() => {
        const text = (selector) => document.querySelector(`#reveal-card-body ${selector}`)?.textContent ?? null;
        return { for: text('.reveal-card-for'), role: text('.reveal-role'), does: text('.reveal-card-does'), team: text('.reveal-card-team') };
    });

/** True when no role text is anywhere in the page: not in a visible part, not in a hidden one. */
export async function assertNoRoleInPage(page, where) {
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    for (const lang of LANGS) {
        for (const role of ROLE_IDS) {
            for (const text of [roleName(lang, role), roleDoes(lang, role)]) assert.ok(!html.includes(text), `${where}: "${text}" is still in the page`);
        }
    }
}

/**
 * Take the person at the gate through their card and on: check the gate (whose turn, with the name), press "I am",
 * check the card against the saved game (role, what it does, teammates), hide it and check that nothing of it is
 * left in the page. Returns what the card said.
 */
export async function passOnePlayer(page, { lang, index, count, players }) {
    const player = players[index];
    const where = `${lang}, player ${index + 1} of ${count}`;
    assert.equal(await page.textContent('#reveal-progress'), say(lang, 'reveal.progress', { n: digits(index + 1, lang), total: digits(count, lang) }), where);
    const title = await page.textContent('#reveal-gate-title');
    assert.ok(title.includes(player.name), `${where}: the gate names ${player.name}: ${title}`);
    assert.equal(title.replace(/[⁨⁩]/g, ''), say(lang, 'reveal.gate.title', { name: player.name }), where);
    assert.equal((await page.textContent('#btn-reveal-show')).replace(/[⁨⁩]/g, ''), say(lang, 'reveal.gate.show', { name: player.name }), where);
    assert.equal(await page.locator('#reveal-card-body > *').count(), 0, `${where}: nothing of a role is in the page at the gate`);
    await assertNoRoleInPage(page, `${where} (gate)`);

    await page.click('#btn-reveal-show');
    await page.waitForSelector('#reveal-card:not(.hidden)');
    const card = await readCard(page);
    assert.ok(card.for.includes(player.name), `${where}: the card is for ${player.name}`);
    assert.equal(card.role, roleName(lang, player.role), where);
    assert.equal(card.does, roleDoes(lang, player.role), where);
    const mates = players.filter((p, i) => i !== index && MAFIA_TEAM.includes(p.role));
    if (MAFIA_TEAM.includes(player.role)) {
        assert.ok(card.team, `${where}: a mafia card has a team line`);
        if (mates.length === 0) assert.equal(card.team, say(lang, 'reveal.card.alone'), where);
        else {
            for (const mate of mates) assert.ok(card.team.includes(mate.name), `${where}: ${player.name} sees ${mate.name}`);
            for (const other of players.filter((p, i) => i !== index && !MAFIA_TEAM.includes(p.role))) assert.ok(!card.team.includes(other.name), `${where}: ${player.name} must not see ${other.name}`);
        }
    } else {
        assert.equal(card.team, null, `${where}: a ${player.role} is told nothing about the mafia`);
    }
    const last = index === count - 1;
    assert.equal(await page.textContent('#btn-reveal-hide'), say(lang, last ? 'reveal.card.hideLast' : 'reveal.card.hide'), where);

    await page.click('#btn-reveal-hide');
    if (last) await page.waitForSelector('#screen-moderator:not(.hidden)');
    else await page.waitForSelector('#reveal-gate:not(.hidden)');
    assert.equal(await page.locator('#reveal-card-body > *').count(), 0, `${where}: the card is taken out of the page, not only hidden`);
    await assertNoRoleInPage(page, `${where} (after hide)`);
    return card;
}

// ---------------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------------

/** Elements of the screen that is showing (and the header) that stick out of the phone sideways, and the page's own overflow. */
export const sidewaysOverflow = (page) =>
    page.evaluate(() => {
        const width = window.innerWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('#main-content-root *')) {
            if (el.closest('.screen-view.hidden') || el.closest('.sr-only') || el.closest('.hidden') || el.closest('.switch')) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (rect.left < -0.5 || rect.right > width + 0.5) offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className} [${Math.round(rect.left)}..${Math.round(rect.right)}]`);
        }
        return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
    });

export async function assertFitsPhone(page, where) {
    const g = await sidewaysOverflow(page);
    assert.ok(g.scrollWidth <= g.width, `${where}: sideways scrolling (${g.scrollWidth} > ${g.width})`);
    assert.deepEqual(g.offenders, [], `${where}: parts stick out of the phone`);
}

/** The buttons, fields, selects and switches that are showing, with their size, and whether each is inside the phone sideways. */
export const touchTargets = (page) =>
    page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('#main-content-root button, #main-content-root select, #main-content-root input[type="text"], #main-content-root label.switch')) {
            if (el.closest('.screen-view.hidden') || el.closest('.hidden') || el.id === 'theme-selector' || el.closest('.lang-switch')) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            out.push({ id: el.id || el.className, width: rect.width, height: rect.height, left: rect.left, right: rect.right });
        }
        return out;
    });

export async function assertTouchTargets(page, where) {
    const targets = await touchTargets(page);
    assert.ok(targets.length > 0, `${where}: found something to press`);
    for (const t of targets) {
        assert.ok(t.height >= 43.5, `${where}: ${t.id} is ${t.height}px high (a finger needs 44)`);
        assert.ok(t.width >= 43.5, `${where}: ${t.id} is ${t.width}px wide`);
        assert.ok(t.left >= -0.5 && t.right <= PHONE.width + 0.5, `${where}: ${t.id} is inside the phone sideways`);
    }
}

/**
 * Wait until the page has stopped scrolling. The setup screen is taller than the phone, and the browser scrolls a
 * focused field or an element it was asked to reach with an animation; a finger that lands during it only stops the
 * scroll (no click). A person waits for the page to stand still too.
 */
export const stoodStill = (page) =>
    page.evaluate(
        () =>
            new Promise((resolve) => {
                let last = -1;
                let same = 0;
                const tick = () => {
                    same = window.scrollY === last ? same + 1 : 0;
                    last = window.scrollY;
                    if (same >= 8) resolve();
                    else requestAnimationFrame(tick);
                };
                tick();
            })
    );

/**
 * Tap like a person: bring the element into view, wait for the page to stand still, then touch it. A person also
 * takes more than a third of a second between two taps; the browser reads two touches closer than that as one
 * double tap and sends no click for them, so the pause is part of tapping.
 */
export async function tapWhenStill(page, selector) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await stoodStill(page);
    await page.waitForTimeout(350);
    await page.tap(selector);
}

/** Press and release the page's `pagehide`, then `visibilitychange` with a hidden page: what a phone does when the screen locks or the app is left. */
export function pageGoesAway(page, how) {
    return page.evaluate((kind) => {
        if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'));
        else {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
        }
    }, how);
}
