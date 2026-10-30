/**
 * The two screens of this step, read from index.html: the welcome screen and the setup placeholder. The shell has
 * exactly these two, and the setup screen holds ONLY the players-count field and a back button. Step 2 adds its
 * own controls on purpose; until then a stray control, a game word or a leftover of the Spyfall template fails here.
 * (How the screens behave is in phase-flow.test.mjs and bindings.test.mjs; how the text is translated in
 * i18n-html.test.mjs and lang-round-trip.test.mjs.)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_PLAYERS_COUNT, RULES, VALID_PHASES } from '../../js/core/config.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { closest, elements, innerText, normalizeText, parseHtml } from './helpers/htmlScan.mjs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const all = [...elements(parseHtml(html))];
const byId = (id) => all.find((el) => el.attrs.id === id);
const classesOf = (el) => (el.attrs.class || '').split(/\s+/).filter(Boolean);
const within = (root) => [...elements(root)];
const CONTROLS = new Set(['button', 'input', 'select', 'textarea', 'a', 'details', 'summary']);

const welcome = byId('screen-welcome');
const setup = byId('screen-setup');

describe('the screens', () => {
    it('there are exactly two, the phases of the machine, welcome first and visible, setup hidden', () => {
        const screens = all.filter((el) => classesOf(el).includes('screen-view'));
        assert.deepEqual(screens.map((s) => s.attrs.id), ['screen-welcome', 'screen-setup']);
        assert.deepEqual([...VALID_PHASES].map((phase) => `screen-${phase}`), screens.map((s) => s.attrs.id));
        assert.equal(classesOf(welcome).includes('hidden'), false);
        assert.equal(classesOf(setup).includes('hidden'), true);
    });

    it('both are inside the main element, which is what a dialog makes inert', () => {
        for (const screen of [welcome, setup]) assert.equal(closest(screen.parent, (el) => el.attrs.id === 'main-content-root') !== null, true, screen.attrs.id);
    });

    it('each starts with the heading the focus moves to: the h1 of the welcome screen, an h2 on setup', () => {
        assert.equal(within(welcome).find((el) => /^h[1-3]$/.test(el.tag)).tag, 'h1');
        assert.equal(within(setup).find((el) => /^h[1-3]$/.test(el.tag)).tag, 'h2');
        assert.equal(all.filter((el) => el.tag === 'h1').length, 1, 'one h1 on the page');
    });
});

describe('the welcome screen', () => {
    it('shows the name of the app and a one-line tagline, both translated', () => {
        const title = byId('welcome-title');
        assert.equal(title.attrs['data-i18n'], 'welcome.title');
        assert.match(normalizeText(innerText(title)), /مافیا/);
        const tagline = within(welcome).find((el) => el.attrs['data-i18n'] === 'welcome.tagline');
        assert.equal(tagline.tag, 'p');
    });

    it('has the round play button that leads to the setup screen, named for screen readers, with its label and caption', () => {
        const button = byId('btn-nav-setup');
        assert.equal(button.tag, 'button');
        assert.ok(classesOf(button).includes('play-button'));
        assert.equal(button.attrs['data-i18n-attr'], 'aria-label:welcome.start.aria');
        assert.ok(button.attrs['aria-label']);
        const keys = within(welcome).map((el) => el.attrs['data-i18n']);
        assert.ok(keys.includes('welcome.start.label') && keys.includes('welcome.start.caption'));
    });

    it('has the language switch, left to right whatever the language: Persian first and pressed, English second', () => {
        const buttons = within(welcome).filter((el) => classesOf(el).includes('lang-btn'));
        assert.deepEqual(buttons.map((b) => [b.attrs['data-lang'], b.attrs.lang, b.attrs['aria-pressed']]), [['fa', 'fa', 'true'], ['en', 'en', 'false']]);
        assert.equal(closest(buttons[0], (el) => el.attrs.dir === 'ltr') !== null, true);
        assert.deepEqual(buttons.map((b) => normalizeText(innerText(b))), ['فارسی', 'English']);
    });

    it('has the credit line with the two links, opened safely in a new tab', () => {
        const links = within(welcome).filter((el) => el.tag === 'a');
        assert.equal(links.length, 2);
        for (const link of links) {
            assert.match(link.attrs.href, /^https:\/\//);
            assert.equal(link.attrs.target, '_blank');
            assert.match(link.attrs.rel, /noopener/);
            assert.ok(link.attrs['aria-label'], 'a link with no text of its own needs a label');
        }
    });

    it('has the version line, hidden until a long press reveals it, left to right and never machine-translated', () => {
        const line = byId('build-info');
        assert.ok(classesOf(line).includes('hidden'));
        assert.equal(line.attrs.dir, 'ltr');
        assert.equal(line.attrs.translate, 'no');
        assert.equal(closest(line, (el) => el === welcome) !== null, true);
    });

    it('has the install tip, hidden until the install logic shows one of its three texts, and a close button', () => {
        const hint = byId('install-hint');
        assert.ok(classesOf(hint).includes('hidden'));
        for (const id of ['install-hint-ios', 'install-hint-firefox-android', 'install-hint-ios-in-app']) assert.ok(classesOf(byId(id)).includes('hidden'), id);
        assert.equal(byId('btn-install-hint-close').tag, 'button');
        assert.ok(classesOf(byId('btn-install-app')).includes('hidden'));
    });
});

describe('the setup screen: the players-count field and a back button, nothing else', () => {
    const controls = within(setup).filter((el) => CONTROLS.has(el.tag));

    it('has one field and one button', () => {
        assert.deepEqual(controls.map((el) => `${el.tag}#${el.attrs.id}`), ['input#setup-players-count', 'button#btn-back-welcome-2']);
    });

    it('the field is a text box for a number: digits keyboard, no autofill, and it keeps what the person types (Persian digits too)', () => {
        const field = byId('setup-players-count');
        assert.equal(field.attrs.type, 'text', 'not type=number: that would refuse Persian digits and show browser spinners');
        assert.equal(field.attrs.inputmode, 'numeric');
        assert.equal(field.attrs.autocomplete, 'off');
    });

    it('starts at the default count, which is itself a legal count', () => {
        assert.equal(Number(byId('setup-players-count').attrs.value), DEFAULT_PLAYERS_COUNT);
        assert.ok(DEFAULT_PLAYERS_COUNT >= RULES.players.min && DEFAULT_PLAYERS_COUNT <= RULES.players.max);
    });

    it('has a visible label tied to the field, and a hint under it that the field points at', () => {
        const label = within(setup).find((el) => el.tag === 'label');
        assert.equal(label.attrs.for, 'setup-players-count');
        assert.equal(label.attrs['data-i18n'], 'setup.players.label');
        const field = byId('setup-players-count');
        const hint = byId(field.attrs['aria-describedby']);
        assert.equal(hint.attrs.id, 'players-limit-hint');
        assert.equal(normalizeText(innerText(hint)), '', 'written by JS from RULES, so the numbers cannot differ from the rule');
    });

    it('the back button is a plain button that says "back"', () => {
        const back = byId('btn-back-welcome-2');
        assert.equal(back.attrs.type, 'button');
        assert.equal(back.attrs['data-i18n'], 'setup.back');
    });

    it('nothing on it starts a game: no start button, no form', () => {
        assert.equal(all.filter((el) => el.tag === 'form').length, 0);
        assert.equal(within(setup).filter((el) => el.tag === 'button').length, 1);
    });
});

describe('the page as a whole', () => {
    it('every button is type="button" (nothing can submit anything)', () => {
        for (const button of all.filter((el) => el.tag === 'button')) assert.equal(button.attrs.type, 'button', button.attrs.id);
    });

    it('every id is unique, and every label, description and name points at an element that exists', () => {
        const ids = all.map((el) => el.attrs.id).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length);
        for (const el of all) {
            for (const [attr, many] of [['for', false], ['aria-describedby', true], ['aria-labelledby', true]]) {
                if (!el.attrs[attr]) continue;
                for (const id of many ? el.attrs[attr].split(/\s+/) : [el.attrs[attr]]) assert.ok(ids.includes(id), `${attr}="${id}" on ${el.tag}`);
            }
        }
    });

    it('is Persian and right to left before any script runs', () => {
        const root = all.find((el) => el.tag === 'html');
        assert.equal(root.attrs.lang, 'fa');
        assert.equal(root.attrs.dir, 'rtl');
    });

    it('carries nothing of the game this was made from: no Spyfall, no word list, no roles, no votes', () => {
        // The Persian words are matched as whole words: "رای" (a vote) must not match inside "برای" (for).
        const GAME = /spy|spyfall|اسپای|جاسوس|کلمه|\bword|(?<![؀-ۿ])(?:نقش|رای|رأی)|\brole\b|\bvote|امتیاز|\bscore|wheel|چرخ/i;
        const written = [];
        for (const el of all) {
            if (el.attrs.id) written.push(['id', el.attrs.id]);
            for (const attr of ['aria-label', 'title', 'placeholder', 'alt', 'content']) if (el.attrs[attr]) written.push([attr, el.attrs[attr]]);
            for (const child of el.children) if (child.type === 'text') written.push([el.tag, child.value]);
        }
        assert.ok(written.length > 60, 'the scan sees the page');
        for (const [where, text] of written) assert.doesNotMatch(text, GAME, where);
        for (const [lang, catalog] of [['fa', fa], ['en', en]]) {
            for (const [key, value] of Object.entries(catalog)) assert.doesNotMatch(value, GAME, `${lang}: ${key}`);
        }
    });

    it('the catalogs hold the texts of these screens and the shell, and no key of a screen that does not exist yet', () => {
        const prefixes = new Set(Object.keys(fa).map((key) => key.split('.')[0]));
        assert.deepEqual([...prefixes].sort(), ['confirm', 'header', 'install', 'meta', 'names', 'setup', 'theme', 'time', 'toast', 'welcome']);
    });
});
