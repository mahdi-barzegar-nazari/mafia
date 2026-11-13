/**
 * The new screens of step 3A (setup form, hand-off gate, role card, moderator's list, the two dialogs) in a real
 * Chromium at 360x740 against the PRODUCTION build:
 *
 *  - in each of the eight themes and both languages: nothing sticks out sideways, every control is finger-sized,
 *    and the text a person must read has enough contrast on the background it sits on (button labels are left out
 *    of that last check: a button's fill is a gradient, which is not a background colour; theme-colors.test.mjs
 *    measures the text of every `btn-*` class on its fill, and the new buttons use those classes);
 *  - a run with the keyboard only, from the welcome screen to the end of the game and back: every control can be
 *    reached and used, the focus goes where the next step is, and a dialog keeps the focus inside.
 * The flow and the saved game are in game-flow.test.mjs.
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startApp } from './helpers/app.mjs';
import { LANGS, THEMES, assertFitsPhone, assertTouchTargets, deal, fillNames, goSetup, makeNames, passOnePlayer, savedPlayers, savedState, say, setCount, setGodfather, shown, withGame } from './helpers/game.mjs';

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

const game = (fn, options) => withGame(browser, baseUrl, fn, options);
const activeId = (page) => page.evaluate(() => document.activeElement.id || document.activeElement.tagName);

// ---------------------------------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------------------------------

/**
 * Runs in the page: for each selector, the WCAG contrast of the text colour of every showing element that has text
 * against what is behind it (the nearest opaque background, with any translucent layers in between composed over
 * it). Returns `{ selector, text, ratio }` for the worst element of each selector.
 */
function measureContrast(selectors) {
    const parse = (value) => {
        let m = value.match(/^rgba?\(([^)]+)\)$/);
        if (m) {
            const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
            return [r, g, b, a];
        }
        m = value.match(/^color\(srgb ([^)]+)\)$/);
        if (m) {
            const [r, g, b, a = 1] = m[1].split(/[ /]+/).filter(Boolean).map(Number);
            return [r * 255, g * 255, b * 255, a];
        }
        return null;
    };
    const over = (top, bottom) => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
    };
    const luminance = ([r, g, b]) => {
        const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const backdrop = (el) => {
        const layers = [];
        for (let node = el; node; node = node.parentElement) {
            const colour = parse(getComputedStyle(node).backgroundColor);
            if (colour && colour[3] > 0) layers.push(colour);
            if (colour && colour[3] >= 1) break;
        }
        let result = [9, 13, 22, 1];
        for (const layer of layers.reverse()) result = over(layer, result);
        return result;
    };
    const out = [];
    for (const selector of selectors) {
        let worst = null;
        for (const el of document.querySelectorAll(selector)) {
            if (el.closest('.screen-view.hidden') || el.closest('.hidden') || !el.textContent.trim()) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const fg = parse(getComputedStyle(el).color);
            if (!fg) continue;
            const bg = backdrop(el);
            const text = over(fg, bg);
            const [hi, lo] = [luminance(text), luminance(bg)].sort((a, b) => b - a);
            const ratio = (hi + 0.05) / (lo + 0.05);
            if (!worst || ratio < worst.ratio) worst = { selector, text: el.textContent.trim().slice(0, 30), ratio: Math.round(ratio * 100) / 100 };
        }
        if (worst) out.push(worst);
    }
    return out;
}

async function assertReadable(page, selectors, where, { min = 4.5 } = {}) {
    const found = await page.evaluate(measureContrast, selectors);
    assert.ok(found.length > 0, `${where}: found text to measure`);
    for (const item of found) assert.ok(item.ratio >= min, `${where}: "${item.text}" (${item.selector}) has contrast ${item.ratio}, needs ${min}`);
}

const SETUP_TEXT = ['#screen-setup h2', '#screen-setup label', '#screen-setup legend', '#screen-setup .field-hint', '#screen-setup .toggle-label-wrap span', '#screen-setup .name-input', '#screen-setup select', '.info-btn'];
const GATE_TEXT = ['#reveal-progress', '#reveal-gate-title', '#reveal-gate p'];
const CARD_TEXT = ['.reveal-card-for', '.reveal-card-does', '.reveal-card-team', '#reveal-card p'];
const MODERATOR_TEXT = ['#screen-moderator h2', '#screen-moderator h3', '#screen-moderator p', '.moderator-name', '.moderator-role', '#moderator-rules li'];

for (const lang of LANGS) {
    describe(`the new screens in all eight themes (${lang}, 360x740)`, () => {
        for (const theme of THEMES) {
            it(`${theme}: setup, gate, every card, the moderator's list and both dialogs fit the phone and can be read`, async () => {
                await game(
                    async (page) => {
                        assert.equal(await page.getAttribute('body', 'data-theme'), theme);
                        const where = `${theme}/${lang}`;
                        await goSetup(page);
                        await assertFitsPhone(page, `${where} setup`);
                        await assertTouchTargets(page, `${where} setup`);
                        await assertReadable(page, SETUP_TEXT, `${where} setup`);
                        await setCount(page, 5);
                        await assertReadable(page, ['#godfather-hint', '#screen-setup .field-hint'], `${where} setup, godfather hint`);
                        await setCount(page, 8);
                        await fillNames(page, makeNames(8, lang));
                        await setGodfather(page, true);

                        // The help dialog.
                        await page.click('#btn-info-godfather');
                        await page.waitForSelector('#info-modal:not(.hidden)');
                        await assertFitsPhone(page, `${where} info dialog`);
                        await assertReadable(page, ['#info-modal-title', '#info-modal-desc'], `${where} info dialog`);
                        await page.click('#btn-info-modal-close');

                        await deal(page);
                        await assertFitsPhone(page, `${where} gate`);
                        await assertReadable(page, GATE_TEXT, `${where} gate`);
                        const players = await savedPlayers(page);
                        for (let i = 0; i < players.length; i++) {
                            await page.click('#btn-reveal-show');
                            await assertFitsPhone(page, `${where} card ${i + 1} (${players[i].role})`);
                            await assertReadable(page, CARD_TEXT, `${where} card ${i + 1} (${players[i].role})`);
                            await assertReadable(page, ['.reveal-role'], `${where} card ${i + 1} title`, { min: 3 });
                            await page.click('#btn-reveal-hide');
                            if (i < players.length - 1) await page.waitForSelector('#reveal-gate:not(.hidden)');
                        }
                        await page.waitForSelector('#screen-moderator:not(.hidden)');
                        await assertFitsPhone(page, `${where} moderator`);
                        await page.click('#btn-roles-toggle');
                        await assertFitsPhone(page, `${where} moderator, roles shown`);
                        await assertTouchTargets(page, `${where} moderator`);
                        await assertReadable(page, MODERATOR_TEXT, `${where} moderator, roles shown`);

                        // The confirm dialog.
                        await page.click('#btn-new-game');
                        await page.waitForSelector('#confirm-modal:not(.hidden)');
                        await assertFitsPhone(page, `${where} confirm dialog`);
                        await assertReadable(page, ['#confirm-modal-title', '#confirm-modal-text'], `${where} confirm dialog`);
                    },
                    { lang, theme }
                );
            });
        }
    });
}

// ---------------------------------------------------------------------------------------------------
// Keyboard only
// ---------------------------------------------------------------------------------------------------

/** Press Tab until the focus is on `#id`; fails when it is not reached in `limit` presses. */
async function tabTo(page, id, limit = 40) {
    for (let i = 0; i < limit; i++) {
        if ((await activeId(page)) === id) return;
        await page.keyboard.press('Tab');
    }
    assert.equal(await activeId(page), id, `Tab reaches #${id}`);
}

for (const lang of LANGS) {
    describe(`a run with the keyboard only (${lang})`, () => {
        it('welcome -> form -> six cards -> moderator\'s list -> new game -> welcome, with no mouse', async () => {
            await game(
                async (page) => {
                    // Welcome: the start button is reachable, Enter opens the form, and the focus is on the form's heading.
                    await tabTo(page, 'btn-nav-setup');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#screen-setup:not(.hidden)');
                    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H2');

                    // The form: the count, the names, the three rules and their help buttons, deal.
                    await tabTo(page, 'setup-players-count');
                    await page.keyboard.press('ControlOrMeta+A');
                    await page.keyboard.type('6');
                    await page.keyboard.press('Tab'); // leaves the field: the names are rebuilt for six
                    assert.equal(await page.locator('#setup-names .name-input').count(), 6);
                    assert.equal(await activeId(page), 'setup-name-1', 'the next control is the first name');
                    await page.keyboard.type('Ada');
                    await tabTo(page, 'setup-doctor-save');
                    await page.keyboard.press('ArrowDown'); // once -> always
                    assert.equal(await page.inputValue('#setup-doctor-save'), 'always');
                    await tabTo(page, 'btn-info-godfather');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#info-modal:not(.hidden)');
                    assert.equal(await activeId(page), 'btn-info-modal-close', 'a dialog takes the focus');
                    await page.keyboard.press('Tab');
                    assert.equal(await activeId(page), 'btn-info-modal-close', 'and keeps it inside (one control: Tab stays on it)');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#info-modal.hidden', { state: 'attached' });
                    assert.equal(await activeId(page), 'btn-info-godfather', 'closing returns the focus to the button that opened it');
                    await tabTo(page, 'setup-godfather');
                    await page.keyboard.press('Space');
                    assert.equal(await page.isChecked('#setup-godfather'), true, 'Space flips a switch');
                    await tabTo(page, 'btn-deal');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#screen-reveal:not(.hidden)');

                    // The reveal: each gate has the focus on its title, "I am" and "hide" are the next stops.
                    const players = await savedPlayers(page);
                    assert.equal(players[0].name, 'Ada');
                    assert.equal((await savedState(page)).game.setup.rules.doctorSelfSave, 'always');
                    assert.equal(players.filter((p) => p.role === 'godfather').length, 1);
                    for (let i = 0; i < 6; i++) {
                        assert.equal(await activeId(page), 'reveal-gate-title', `gate ${i + 1}: the focus is on the title`);
                        assert.ok((await page.textContent('#reveal-live')).length > 0, 'one live line says the step');
                        await page.keyboard.press('Tab');
                        assert.equal(await activeId(page), 'btn-reveal-show', 'the first stop is "I am"');
                        await page.keyboard.press('Enter');
                        await page.waitForSelector('#reveal-card:not(.hidden)');
                        assert.equal(await page.evaluate(() => document.activeElement.className), 'reveal-role', `card ${i + 1}: the focus is on the role`);
                        assert.equal(await page.textContent('#reveal-live'), say(lang, 'reveal.live.card'), 'the live line never says the role');
                        await page.keyboard.press('Tab');
                        assert.equal(await activeId(page), 'btn-reveal-hide');
                        await page.keyboard.press('Enter');
                    }

                    // The moderator's list.
                    await page.waitForSelector('#screen-moderator:not(.hidden)');
                    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H2');
                    await tabTo(page, 'btn-roles-toggle');
                    await page.keyboard.press('Space');
                    assert.equal(await page.locator('#moderator-list .moderator-role').count(), 6);
                    await page.keyboard.press('Space');
                    assert.equal(await page.locator('#moderator-list .moderator-role').count(), 0);

                    // New game: the question keeps the focus inside, "yes" goes back to the start.
                    await tabTo(page, 'btn-new-game');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#confirm-modal:not(.hidden)');
                    const inside = () => page.evaluate(() => document.getElementById('confirm-modal').contains(document.activeElement));
                    for (let i = 0; i < 5; i++) {
                        assert.equal(await inside(), true, `Tab ${i}: the focus is inside the dialog`);
                        await page.keyboard.press('Tab');
                    }
                    await page.keyboard.press('Shift+Tab');
                    assert.equal(await inside(), true);
                    await tabTo(page, 'btn-confirm-yes', 4);
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#screen-welcome:not(.hidden)');
                    assert.deepEqual(await shown(page), ['screen-welcome']);
                    assert.equal(await page.isVisible('#btn-resume-game'), false);
                },
                { lang }
            );
        });

        it('every card of a 6-player game can be passed by keyboard, and Back from a gate asks first', async () => {
            await game(
                async (page) => {
                    await goSetup(page);
                    await setCount(page, 6);
                    await deal(page);
                    const players = await savedPlayers(page);
                    await passOnePlayer(page, { lang, index: 0, count: 6, players });
                    await tabTo(page, 'btn-reveal-back');
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#confirm-modal:not(.hidden)');
                    await tabTo(page, 'btn-confirm-no', 4);
                    await page.keyboard.press('Enter');
                    await page.waitForSelector('#confirm-modal.hidden', { state: 'attached' });
                    assert.deepEqual(await shown(page), ['screen-reveal'], '"cancel" stays in the game');
                },
                { lang }
            );
        });
    });
}
