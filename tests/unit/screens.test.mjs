/**
 * The four screens, read from index.html: the welcome screen, the setup form, the reveal screen and the
 * moderator's screen. There are exactly these four (the night and day screens come with step 3B), each control of
 * the setup form is listed here on purpose, and the reveal screen's page holds no role at all (the role card is built
 * by JS when it is shown). A stray control, a leftover of the Spyfall template or a text of a screen that does not
 * exist yet fails here. (How the screens behave is in phase-flow.test.mjs, game-flow.test.mjs and bindings.test.mjs;
 * how the text is translated in i18n-html.test.mjs and lang-round-trip.test.mjs.)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_PLAYERS_COUNT, RULES, VALID_PHASES } from '../../js/core/config.js';
import { INFO_KEYS } from '../../js/core/config.js';
import { DEFAULT_RULES } from '../../js/game/rules.js';
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
const reveal = byId('screen-reveal');
const moderator = byId('screen-moderator');
const SCREENS = [welcome, setup, reveal, moderator];

describe('the screens', () => {
    it('there are exactly four, the phases of the machine, welcome first and visible, the others hidden', () => {
        const screens = all.filter((el) => classesOf(el).includes('screen-view'));
        assert.deepEqual(screens.map((s) => s.attrs.id), ['screen-welcome', 'screen-setup', 'screen-reveal', 'screen-moderator']);
        assert.deepEqual([...VALID_PHASES].map((phase) => `screen-${phase}`), screens.map((s) => s.attrs.id));
        assert.equal(classesOf(welcome).includes('hidden'), false);
        for (const screen of [setup, reveal, moderator]) assert.equal(classesOf(screen).includes('hidden'), true, screen.attrs.id);
    });

    it('all are inside the main element, which is what a dialog makes inert', () => {
        for (const screen of SCREENS) assert.equal(closest(screen.parent, (el) => el.attrs.id === 'main-content-root') !== null, true, screen.attrs.id);
    });

    it('each starts with the heading the focus moves to: the h1 of the welcome screen, an h2 on the others', () => {
        assert.equal(within(welcome).find((el) => /^h[1-3]$/.test(el.tag)).tag, 'h1');
        for (const screen of [setup, moderator]) assert.equal(within(screen).find((el) => /^h[1-3]$/.test(el.tag)).tag, 'h2', screen.attrs.id);
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

    it('has a "resume game" button that is hidden until JS finds a saved game, and no text of a saved game in the page', () => {
        const button = byId('btn-resume-game');
        assert.equal(button.tag, 'button');
        assert.ok(classesOf(button).includes('hidden'));
        assert.equal(button.attrs['data-i18n'], 'welcome.resume');
        assert.equal(closest(button, (el) => el === welcome) !== null, true);
    });

    it('has the install tip, hidden until the install logic shows one of its three texts, and a close button', () => {
        const hint = byId('install-hint');
        assert.ok(classesOf(hint).includes('hidden'));
        for (const id of ['install-hint-ios', 'install-hint-firefox-android', 'install-hint-ios-in-app']) assert.ok(classesOf(byId(id)).includes('hidden'), id);
        assert.equal(byId('btn-install-hint-close').tag, 'button');
        assert.ok(classesOf(byId('btn-install-app')).includes('hidden'));
    });
});

describe('the setup screen: the players, the three rules and the deal button', () => {
    const controls = within(setup).filter((el) => CONTROLS.has(el.tag));

    it('has exactly these controls, in this order (the name fields are made by JS, one per player)', () => {
        assert.deepEqual(controls.map((el) => `${el.tag}#${el.attrs.id}`), [
            'input#setup-players-count',
            'button#btn-info-doctor-save',
            'select#setup-doctor-save',
            'button#btn-info-godfather',
            'input#setup-godfather',
            'button#btn-info-reveal-death',
            'input#setup-reveal-death',
            'button#btn-deal',
            'button#btn-back-welcome-2'
        ]);
        assert.ok(byId('setup-names'), 'the container of the name fields');
        assert.equal(within(byId('setup-names')).length, 0, 'empty in the page: JS fills it from the player count');
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

    it('the doctor select offers never, once and always, and starts on the engine default', () => {
        const select = byId('setup-doctor-save');
        const options = within(select).filter((el) => el.tag === 'option');
        assert.deepEqual(options.map((o) => o.attrs.value), ['never', 'once', 'always']);
        assert.deepEqual(options.filter((o) => 'selected' in o.attrs).map((o) => o.attrs.value), [DEFAULT_RULES.doctorSelfSave]);
        const label = within(setup).find((el) => el.tag === 'label' && el.attrs.for === 'setup-doctor-save');
        assert.ok(label, 'a visible label tied to the select');
    });

    it('the godfather switch starts off and the reveal-on-death switch starts on, as the engine defaults say', () => {
        assert.equal('checked' in byId('setup-godfather').attrs, DEFAULT_RULES.godfather);
        assert.equal('checked' in byId('setup-reveal-death').attrs, DEFAULT_RULES.revealRoleOnDeath);
        assert.equal(DEFAULT_RULES.godfather, false);
        assert.equal(DEFAULT_RULES.revealRoleOnDeath, true);
    });

    it('every switch has a name (a label it is tied to) and the godfather one points at its hint', () => {
        for (const id of ['setup-godfather', 'setup-reveal-death']) {
            const box = byId(id);
            assert.equal(box.attrs.type, 'checkbox');
            assert.ok(byId(box.attrs['aria-labelledby']), `${id} has no name`);
        }
        const hint = byId(byId('setup-godfather').attrs['aria-describedby']);
        assert.equal(hint.attrs.id, 'godfather-hint');
        assert.equal(normalizeText(innerText(hint)), '', 'written by JS: only shown while the switch is disabled');
    });

    it('each option has an (i) button that names its own help text and a name a screen reader can read', () => {
        const buttons = within(setup).filter((el) => classesOf(el).includes('info-btn'));
        assert.deepEqual(buttons.map((b) => b.attrs['data-info']).sort(), [...INFO_KEYS].sort());
        for (const button of buttons) {
            assert.equal(button.attrs['aria-haspopup'], 'dialog');
            assert.ok(button.attrs['aria-label']);
            assert.ok(button.attrs['aria-labelledby'].split(/\s+/).every((id) => byId(id)), button.attrs.id);
        }
    });

    it('the deal button and the back button are plain buttons with their own texts', () => {
        assert.equal(byId('btn-deal').attrs['data-i18n'], 'setup.deal');
        const back = byId('btn-back-welcome-2');
        assert.equal(back.attrs.type, 'button');
        assert.equal(back.attrs['data-i18n'], 'setup.back');
        assert.equal(all.filter((el) => el.tag === 'form').length, 0, 'no form: nothing can submit');
    });
});

describe('the reveal screen: a gate and a card, and nothing secret in the page', () => {
    it('has the gate (progress, heading, hint, the "I am" button, back) and the card (body, note, hide button), both hidden', () => {
        for (const id of ['reveal-gate', 'reveal-card']) assert.ok(classesOf(byId(id)).includes('hidden'), id);
        assert.deepEqual(
            within(reveal).filter((el) => CONTROLS.has(el.tag)).map((el) => el.attrs.id),
            ['btn-reveal-show', 'btn-reveal-back', 'btn-reveal-hide']
        );
        assert.equal(byId('reveal-gate-title').tag, 'h2');
    });

    it('the texts that name a player or a role are written by JS: the page holds none of them (the card body is empty)', () => {
        for (const id of ['reveal-gate-title', 'reveal-progress', 'btn-reveal-show', 'btn-reveal-hide', 'reveal-card-body']) {
            assert.equal(normalizeText(innerText(byId(id))), '', id);
        }
    });

    it('has one polite live line for the step, not shown on screen', () => {
        const live = byId('reveal-live');
        assert.equal(live.attrs['aria-live'], 'polite');
        assert.equal(live.attrs.role, 'status');
        assert.ok(classesOf(live).includes('sr-only'));
        assert.equal(normalizeText(innerText(live)), '');
    });
});

describe("the moderator's screen: the list, the toggle, the rules and the new-game button", () => {
    it('has these controls, in this order', () => {
        assert.deepEqual(within(moderator).filter((el) => CONTROLS.has(el.tag)).map((el) => el.attrs.id), ['btn-roles-toggle', 'btn-new-game']);
    });

    it('the list and the rules are empty in the page: JS writes them, so no role is in the page', () => {
        for (const id of ['moderator-list', 'moderator-rules']) {
            assert.equal(byId(id).tag, 'ul', id);
            assert.equal(within(byId(id)).length, 0, id);
        }
    });

    it('the toggle starts on "show roles" (the roles are hidden when the screen opens)', () => {
        assert.equal(byId('btn-roles-toggle').attrs['data-i18n'], 'moderator.roles.show');
    });
});

describe('the help modal', () => {
    it('is a dialog with a title, a text and a close button, hidden', () => {
        const modal = byId('info-modal');
        assert.equal(modal.attrs.role, 'dialog');
        assert.equal(modal.attrs['aria-modal'], 'true');
        assert.ok(classesOf(modal).includes('hidden'));
        assert.ok(byId(modal.attrs['aria-labelledby']), 'named by its title');
        assert.equal(byId('btn-info-modal-close').attrs['data-i18n'], 'modal.info.close');
        assert.equal(closest(modal, (el) => el.attrs.id === 'main-content-root'), null, 'outside the main element, which a dialog makes inert');
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

    it('carries nothing of the game this was made from: no Spyfall, no word list, no scores, no wheel', () => {
        // Roles and votes are Mafia's own words now; what stays out is what only Spyfall has.
        const GAME = /spy|spyfall|اسپای|جاسوس|کلمه|\bword|امتیاز|\bscore|wheel|چرخ/i;
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

    it('the catalogs hold the texts of these screens and the shell, and no key of a screen that does not exist yet (the night and day screens)', () => {
        const prefixes = new Set(Object.keys(fa).map((key) => key.split('.')[0]));
        assert.deepEqual([...prefixes].sort(), ['a11y', 'confirm', 'header', 'info', 'install', 'meta', 'modal', 'moderator', 'names', 'reveal', 'role', 'setup', 'theme', 'time', 'toast', 'welcome']);
        assert.deepEqual(Object.keys(en).map((key) => key.split('.')[0]).filter((p) => !prefixes.has(p)), []);
    });
});
