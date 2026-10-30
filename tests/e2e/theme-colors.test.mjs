/**
 * Every part of the UI follows the selected theme, checked in a real Chromium at 360x740 against the PRODUCTION
 * build: for each of the eight themes (and both languages) the colours the browser computes for the page, the card,
 * the selected language button, the play button, the title, the setup field, the toast, the scrim and the dialog
 * card are read back and compared with the theme's tokens, with the other themes, and (for the colours that carry a
 * meaning) with themselves in every theme. Text contrast is measured on the computed colours, not on the CSS.
 * A token that is missing or mistyped shows up here as a colour the browser could not compute (transparent, black).
 * Requires: npm install && npx playwright install chromium
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { contrastRatio, effectiveTokens, gradientStops, over, parseColor, parseCssColor, readProjectFile, readThemeBlocks } from '../unit/helpers/cssTokens.mjs';
import { startApp } from './helpers/app.mjs';
import { snapshotTheme } from './helpers/themeProbe.mjs';

const THEMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const LANGS = ['fa', 'en'];
const themeBlocks = readThemeBlocks(readProjectFile('css/style.css'));
const ALL_TOKENS = ['--bg-body', '--bg-gradient', '--surface-card', '--surface-input', '--border-glow', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary', '--brand-emerald', '--brand-rose', '--brand-amber'];

let app;
/** snap[theme][lang] = what snapshotTheme read. */
const snap = {};

before(async () => {
    app = await startApp();
    for (const theme of THEMES) {
        snap[theme] = {};
        for (const lang of LANGS) snap[theme][lang] = await snapshotTheme(app.browser, app.baseUrl, theme, lang);
    }
});
after(async () => {
    await app?.stop();
});

// ---------------------------------------------------------------- small helpers

const rgb255 = (hex) => parseColor(hex);
const tokensOf = (theme) => effectiveTokens(themeBlocks, theme);
const color = (text) => {
    const parsed = parseCssColor(text);
    assert.ok(parsed, `cannot read the colour "${text}"`);
    return parsed;
};
/** `mix` of two [r, g, b] colours: `share` (0-1) of `a`. */
const mix = (a, b, share) => a.map((v, i) => v * share + b[i] * (1 - share));
const near = (actual, expected, tolerance, what) => {
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${what}: got ${actual.map((x) => x.toFixed(1))}, expected ${expected.map((x) => x.toFixed(1))}`));
};
const key = (value) => JSON.stringify(value);
const everyTheme = (read) => THEMES.map((theme) => read(snap[theme].fa, theme));

/** The colours a check collects in every theme must all be different (themed) or all be the same (semantic). */
function assertDifferentInEveryTheme(name, read) {
    const values = everyTheme((s, theme) => key(read(s, theme)));
    assert.equal(new Set(values).size, THEMES.length, `${name} must differ from theme to theme: ${values.join(' | ')}`);
}
function assertSameInEveryTheme(name, read) {
    const values = everyTheme((s, theme) => key(read(s, theme)));
    assert.equal(new Set(values).size, 1, `${name} must not change with the theme: ${[...new Set(values)].join(' | ')}`);
}
const round = (rgb) => rgb.map((v) => Math.round(v));
const stopsOf = (css) => gradientStops(css).map((c) => round(c.rgb));
const inputOf = (theme) => /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/.exec(tokensOf(theme)['--surface-input']).slice(1).map(Number);

/** The gradient of the main and the play button: 45% of each brand colour in the page colour of the theme. */
const deepStops = (theme) => {
    const t = tokensOf(theme);
    const bg = rgb255(t['--bg-body']);
    return [mix(rgb255(t['--brand-primary']), bg, 0.45), mix(rgb255(t['--brand-secondary']), bg, 0.45)];
};

// ---------------------------------------------------------------- the theme really is applied

describe('the page reads each theme from css/style.css', () => {
    for (const theme of THEMES) {
        it(`${theme}: every token the browser computes is the one written in the theme block, and none is empty`, () => {
            const s = snap[theme].fa;
            assert.equal(s.theme, theme);
            const written = tokensOf(theme);
            for (const token of ALL_TOKENS) {
                assert.notEqual(s.tokens[token], '', `${theme}: ${token} is empty in the browser`);
                assert.equal(s.tokens[token].toLowerCase(), written[token].toLowerCase(), `${theme} ${token}`);
            }
        });

        it(`${theme}: nothing renders without its colour (no transparent page, card, button, field or dialog, no black text on black)`, () => {
            const s = snap[theme].fa;
            const t = tokensOf(theme);
            assert.ok(s.page['background-image'].includes('gradient'), `${theme}: the page background is the --bg-gradient gradient: ${s.page['background-image']}`);
            for (const [name, got] of [['card', s.container], ['setup field', s.field], ['text field', s.cards.input], ['toast', s.cards.toast], ['dialog card', s.cards.modalCard], ['dialog scrim', s.cards.overlay], ['theme selector', s.selector]]) {
                assert.ok(color(got['background-color']).a > 0, `${theme}: the ${name} has a fill`);
                assert.notEqual(got['background-color'], 'rgba(0, 0, 0, 0)', `${theme}: the ${name} fill is not the unset one`);
            }
            for (const [name, got] of [['title', s.title], ['play button', s.play], ['main button probe', s.buttons['btn-primary']]]) {
                assert.ok(got['background-image'].includes('gradient'), `${theme}: the ${name} has its gradient`);
            }
            // Text is never left at the browser's default black: it is the theme's text colour or its quieter one.
            for (const [name, got, wanted] of [['typed text', s.cards.input.color, '--text-primary'], ['setup field text', s.field.color, '--text-primary'], ['hint', s.hint.color, '--text-secondary']]) {
                assert.deepEqual(round(color(got).rgb), rgb255(t[wanted]), `${theme}: ${name} follows ${wanted}`);
            }
        });
    }

    it('the eight themes give eight different pages (the gradient, the card, the text and the brand colours)', () => {
        assertDifferentInEveryTheme('page gradient', (s) => s.page['background-image']);
        assertDifferentInEveryTheme('card', (s) => round(color(s.container['background-color']).rgb));
        assertDifferentInEveryTheme('text', (s) => round(color(s.cards.input.color).rgb));
        assertDifferentInEveryTheme('brand colours', (s) => [s.tokens['--brand-primary'], s.tokens['--brand-secondary']]);
    });
});

// ---------------------------------------------------------------- the language switch

describe('the selected language button', () => {
    for (const theme of THEMES) {
        for (const lang of LANGS) {
            it(`${theme}/${lang}: border, glow and fill are the theme's, the label is its text colour`, () => {
                const s = snap[theme][lang];
                const selected = s[`lang-${lang}`];
                const other = s[`lang-${lang === 'fa' ? 'en' : 'fa'}`];
                assert.equal(selected.pressed, 'true');
                assert.equal(other.pressed, 'false');
                const t = tokensOf(theme);
                assert.deepEqual(round(color(selected['border-top-color']).rgb), rgb255(t['--brand-primary']), 'border = --brand-primary');
                assert.deepEqual(round(color(selected.color).rgb), rgb255(t['--text-primary']), 'label = --text-primary');
                assert.ok(selected['box-shadow'].includes(`rgb(${rgb255(t['--brand-primary']).join(', ')})`), `glow is --brand-primary: ${selected['box-shadow']}`);
                // color-mix(in srgb, --brand-primary 28%, --surface-input), in premultiplied alpha.
                const input = inputOf(theme);
                const alpha = 0.28 + 0.72 * input[3];
                const expected = rgb255(t['--brand-primary']).map((v, i) => (0.28 * v + 0.72 * input[3] * input[i]) / alpha);
                const bg = color(selected['background-color']);
                near(bg.rgb, expected, 3, `${theme} selected fill`);
                assert.ok(Math.abs(bg.a - alpha) < 0.01, `fill alpha ${bg.a} vs ${alpha}`);
                // And it is not the old fixed gradient, nor the quiet look of the other button.
                assert.equal(selected['background-image'], 'none');
                assert.notEqual(selected['background-color'], other['background-color']);
                assert.equal(other['box-shadow'], 'none');
            });
        }
    }

    it('differs from theme to theme: border, glow and fill', () => {
        for (const lang of LANGS) {
            const read = (name) => THEMES.map((theme) => snap[theme][lang][`lang-${lang}`][name]);
            for (const name of ['border-top-color', 'background-color', 'box-shadow']) assert.equal(new Set(read(name)).size, THEMES.length, `${lang} ${name}: ${read(name).join(' | ')}`);
        }
    });

    it('the selected button changes sides with the language and keeps its look', () => {
        for (const theme of THEMES) {
            const fa = snap[theme].fa;
            const en = snap[theme].en;
            assert.equal(fa['lang-fa']['background-color'], en['lang-en']['background-color'], `${theme}: same selected fill in both languages`);
            assert.equal(fa['lang-en']['background-color'], en['lang-fa']['background-color'], `${theme}: same quiet fill in both languages`);
        }
    });
});

// ---------------------------------------------------------------- the main button and the play button

describe('the main button and the play button', () => {
    for (const theme of THEMES) {
        it(`${theme}: both gradients are the theme's two colours mixed into its page colour; the label and the triangle are its text colour`, () => {
            const s = snap[theme].fa;
            const expected = deepStops(theme).map(round);
            for (const [name, element] of [['probe button', s.buttons['btn-primary']], ['play button', s.play]]) {
                const stops = stopsOf(element['background-image']);
                assert.equal(stops.length, 2, `${name}: two colour stops in ${element['background-image']}`);
                near(stops[0], expected[0], 2, `${theme} ${name} start`);
                near(stops[1], expected[1], 2, `${theme} ${name} end`);
            }
            const text = rgb255(tokensOf(theme)['--text-primary']);
            assert.deepEqual(round(color(s.buttons['btn-primary'].color).rgb), text);
            assert.deepEqual(round(color(s.playIcon['border-left-color']).rgb), text);
        });
    }

    it('both differ from theme to theme (and so does the page title gradient)', () => {
        assertDifferentInEveryTheme('main button', (s) => stopsOf(s.buttons['btn-primary']['background-image']));
        assertDifferentInEveryTheme('play button', (s) => stopsOf(s.play['background-image']));
        assertDifferentInEveryTheme('play triangle', (s) => round(color(s.playIcon['border-left-color']).rgb));
        assertDifferentInEveryTheme('title', (s) => stopsOf(s.title['background-image']));
    });
});

// ---------------------------------------------------------------- the other themed items

describe('the other items that follow the theme', () => {
    for (const theme of THEMES) {
        it(`${theme}: the card, the field, the toast, the scrim and the dialog are made from the theme's tokens`, () => {
            const s = snap[theme].fa;
            const t = tokensOf(theme);
            const bodyBg = rgb255(t['--bg-body']);
            const surface = parseCssColor(t['--surface-card']);
            const text = rgb255(t['--text-primary']);
            const input = inputOf(theme);

            // The card is --surface-card (a translucent panel, so the page gradient shows through its blur).
            const container = color(s.container['background-color']);
            near(container.rgb, surface.rgb, 3, `${theme} the card is --surface-card`);
            assert.ok(Math.abs(container.a - surface.a) < 0.02, `card alpha ${container.a} vs ${surface.a}`);
            assert.deepEqual(round(color(s.container['border-top-color']).rgb).slice(0, 3).length, 3);
            assert.deepEqual(round(color(s.cards.input.color).rgb), text, 'typed text = --text-primary');

            const field = color(s.field['background-color']);
            near(field.rgb, input.slice(0, 3), 3, `${theme} setup field fill is --surface-input`);
            assert.ok(Math.abs(field.a - input[3]) < 0.02, `setup field alpha ${field.a}`);

            const toast = color(s.cards.toast['background-color']);
            near(toast.rgb, input.slice(0, 3), 3, `${theme} toast panel is --surface-input`);
            assert.ok(Math.abs(toast.a - 0.95 * input[3]) < 0.02, `toast alpha ${toast.a}`);
            assert.deepEqual(round(color(s.cards.toast.color).rgb), text, 'toast text = --text-primary');

            const overlay = color(s.cards.overlay['background-color']);
            near(overlay.rgb, bodyBg, 3, `${theme} scrim is the page colour`);
            assert.ok(Math.abs(overlay.a - 0.88) < 0.01);

            const card = color(s.cards.modalCard['background-color']);
            near(card.rgb, surface.rgb, 3, `${theme} dialog card is --surface-card`);
            assert.ok(Math.abs(card.a - surface.a) < 0.02, `dialog card alpha ${card.a}`);
        });
    }

    it('every one of them differs from theme to theme', () => {
        const items = {
            'card': (s) => round(color(s.container['background-color']).rgb),
            'typed text': (s) => round(color(s.cards.input.color).rgb),
            'setup field': (s) => round(color(s.field['background-color']).rgb),
            'toast': (s) => round(color(s.cards.toast['background-color']).rgb),
            'modal scrim': (s) => round(color(s.cards.overlay['background-color']).rgb),
            'dialog card': (s) => round(color(s.cards.modalCard['background-color']).rgb),
            'ghost button': (s) => round(color(s.buttons['btn-ghost']['background-color']).rgb),
            'ghost button label': (s) => round(color(s.buttons['btn-ghost'].color).rgb),
            'credit line': (s) => round(color(s.credit.color).rgb)
        };
        for (const [name, read] of Object.entries(items)) assertDifferentInEveryTheme(name, read);
    });
});

// ---------------------------------------------------------------- the colours that carry a meaning

describe('the semantic colours do not change with the theme', () => {
    it('the rose (destructive) button keeps its fill and label in every theme', () => {
        assertSameInEveryTheme('rose button', (s) => [stopsOf(s.buttons['btn-rose']['background-image']), s.buttons['btn-rose'].color]);
        assert.deepEqual(stopsOf(snap.default.fa.buttons['btn-rose']['background-image']), [[225, 29, 72], [159, 18, 57]]);
    });

    it('the three meaning tokens (emerald, rose, amber) are the same in every theme, as the browser computes them', () => {
        for (const token of ['--brand-emerald', '--brand-rose', '--brand-amber']) assertSameInEveryTheme(token, (s) => s.tokens[token]);
    });
});

// ---------------------------------------------------------------- readable text

describe('text contrast (WCAG AA, 4.5:1) in every theme and both languages', () => {
    const gradientSamples = (css) => {
        const [a, b] = gradientStops(css).map((c) => c.rgb);
        return Array.from({ length: 11 }, (_, k) => mix(a, b, 1 - k / 10));
    };
    for (const theme of THEMES) {
        for (const lang of LANGS) {
            it(`${theme}/${lang}: main button label, play triangle, selected and quiet language button, typed text`, () => {
                const s = snap[theme][lang];
                // The main button: the label on both ends of the gradient and between.
                const label = color(s.buttons['btn-primary'].color).rgb;
                for (const point of gradientSamples(s.buttons['btn-primary']['background-image'])) {
                    const ratio = contrastRatio(point, label);
                    assert.ok(ratio >= 4.5, `${theme} main button label ${ratio.toFixed(2)}:1`);
                }
                // The play triangle on the gradient (a symbol: 3:1 would do, it has 4.5).
                const triangle = color(s.playIcon['border-left-color']).rgb;
                for (const point of gradientSamples(s.play['background-image'])) {
                    const ratio = contrastRatio(point, triangle);
                    assert.ok(ratio >= 4.5, `${theme} play triangle ${ratio.toFixed(2)}:1`);
                }
                // The language buttons sit on the card, which sits on the page colour.
                const page = rgb255(tokensOf(theme)['--bg-body']);
                const card = over(color(s.container['background-color']), page);
                const selected = s[`lang-${lang}`];
                const quiet = s[`lang-${lang === 'fa' ? 'en' : 'fa'}`];
                const selectedRatio = contrastRatio(over(color(selected['background-color']), card), color(selected.color).rgb);
                assert.ok(selectedRatio >= 4.5, `${theme}/${lang} selected language button ${selectedRatio.toFixed(2)}:1`);
                const quietRatio = contrastRatio(over(color(quiet['background-color']), card), color(quiet.color).rgb);
                assert.ok(quietRatio >= 4.5, `${theme}/${lang} other language button ${quietRatio.toFixed(2)}:1`);
                // The text of the setup field on its fill, on the card.
                const fieldRatio = contrastRatio(over(color(s.field['background-color']), card), color(s.field.color).rgb);
                assert.ok(fieldRatio >= 4.5, `${theme}/${lang} setup field text ${fieldRatio.toFixed(2)}:1`);
            });
        }
    }
});
