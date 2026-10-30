/**
 * Every part of the UI follows the selected theme, except the colours that carry a meaning.
 *
 * The themes are the `:root` block (default) and the seven `body[data-theme]` blocks of css/style.css. Outside
 * those blocks no rule may write a fixed colour (hex, rgb(), hsl(), a name...) unless it is on the allow-list below,
 * which names every semantic or neutral colour that stays the same in all themes, with the reason. A new fixed
 * colour in a normal rule fails here until it is either written with the tokens or added to the list on purpose.
 * (The colours as the browser computes them in every theme are checked in tests/e2e/theme-colors.test.mjs.)
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { THEME_COLORS } from '../../js/core/config.js';
import { contrastRatio, effectiveTokens, findColorLiterals, parseColor, parseRules, readProjectFile, readThemeBlocks, themeNameOfSelector } from './helpers/cssTokens.mjs';

const css = readProjectFile('css/style.css');
const html = readProjectFile('index.html');
const rules = parseRules(css);
const themes = readThemeBlocks(css);
const THEME_NAMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];

/** The tokens every theme sets for itself. */
const THEMED_TOKENS = ['--bg-body', '--bg-gradient', '--surface-card', '--surface-input', '--border-glow', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary'];
/** The meaning colours: defined once in :root and never changed by a theme. */
const SEMANTIC_TOKENS = ['--brand-emerald', '--brand-rose', '--brand-amber'];

const place = (rule) => [...rule.context, rule.selector].join(' ');
const isThemeBlock = (rule) => !rule.context.length && themeNameOfSelector(rule.selector) !== null;

describe('the eight themes', () => {
    it('are the ones the selector offers and the meta colours know', () => {
        const select = html.match(/<select id="theme-selector"[\s\S]*?<\/select>/)[0];
        const options = [...select.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]);
        assert.deepEqual(Object.keys(themes).sort(), [...THEME_NAMES].sort(), 'theme blocks in css/style.css');
        assert.deepEqual([...options].sort(), [...THEME_NAMES].sort(), 'options of #theme-selector');
        assert.deepEqual(Object.keys(THEME_COLORS).sort(), [...THEME_NAMES].sort(), 'THEME_COLORS');
    });

    for (const name of THEME_NAMES) {
        it(`${name} sets every themed token`, () => {
            for (const token of THEMED_TOKENS) assert.ok(themes[name][token], `${name} is missing ${token}`);
        });
    }

    it('no theme changes a semantic token (error red, success green, warning amber)', () => {
        for (const token of SEMANTIC_TOKENS) assert.ok(themes.default[token], `:root defines ${token}`);
        for (const name of THEME_NAMES.filter((n) => n !== 'default')) {
            for (const token of SEMANTIC_TOKENS) assert.equal(token in themes[name], false, `${name} must not set ${token}`);
        }
    });

    it('every theme looks different: the two brand colours and the page colour are never shared', () => {
        for (const token of ['--brand-primary', '--bg-body', '--text-primary']) {
            const values = THEME_NAMES.map((name) => effectiveTokens(themes, name)[token].toLowerCase());
            assert.equal(new Set(values).size, THEME_NAMES.length, `${token}: ${values.join(' ')}`);
        }
    });
});

describe('the colours kept beside the CSS follow it', () => {
    it('<meta name="theme-color"> per theme (THEME_COLORS) is the --bg-body of the theme', () => {
        for (const name of THEME_NAMES) assert.equal(THEME_COLORS[name].toLowerCase(), effectiveTokens(themes, name)['--bg-body'].toLowerCase(), name);
    });

    it('index.html and manifest.json start with the default theme colour (they cannot change at run time)', () => {
        const bg = themes.default['--bg-body'].toLowerCase();
        assert.equal(html.match(/<meta name="theme-color"[^>]*content="([^"]+)"/)[1].toLowerCase(), bg, 'meta theme-color');
        const manifest = JSON.parse(readProjectFile('manifest.json'));
        assert.equal(manifest.background_color.toLowerCase(), bg, 'manifest background_color');
        assert.equal(manifest.theme_color.toLowerCase(), bg, 'manifest theme_color');
    });

    it('index.html carries no inline style and no colour of its own', () => {
        assert.equal(/<style[\s>]/i.test(html), false, 'no <style> element');
        assert.equal(/\sstyle\s*=/i.test(html), false, 'no style attribute');
        const withoutThemeMeta = html.replace(/<meta name="theme-color"[^>]*>/, '');
        assert.deepEqual(withoutThemeMeta.match(/#[0-9a-f]{6}\b|rgba?\(/gi) || [], []);
    });
});

/**
 * Fixed colours that stay as they are, by place. `[place, property, literals, reason]`: the place is the selector
 * (with its at-rule context), the literals are the fixed colour values the declaration writes, in order. A
 * declaration passes only when it matches an entry exactly; a themed part of the same value (a color-mix of
 * tokens) is not a literal and is not listed.
 */
const SHADOW = 'black depth shadow: the elevation has to stay dark in every theme (a tinted one would read as a glow)';
const FILL_RED = 'danger button: the red is the meaning, so the fill is the same in every theme';
const ALLOWED = [
    ['.app-container', 'box-shadow', ['rgba(0, 0, 0, 0.85)'], SHADOW],
    ['.btn', 'color', ['#ffffff'], 'white label of the rose button, whose fill is fixed (.btn-primary and .btn-ghost set their own)'],
    ['.btn', 'box-shadow', ['rgba(0, 0, 0, 0.35)'], SHADOW],
    ['.btn-rose', 'background', ['#e11d48', '#9f1239'], FILL_RED],
    ['.btn-rose', 'color', ['#ffffff'], 'white label on the fixed red fill'],
    ['.modal-card', 'box-shadow', ['rgba(0, 0, 0, 0.9)'], SHADOW],
    ['@keyframes fieldErrorPulse 0%, 100%', 'box-shadow', ['rgba(244, 63, 94, 0.5)'], 'red pulse around a field with an error: error red, the same in every theme'],
    ['@keyframes fieldErrorPulse 50%', 'box-shadow', ['rgba(244, 63, 94, 0)'], 'the transparent end of that error pulse'],
    ['.install-btn-floating', 'box-shadow', ['rgba(0, 0, 0, 0.5)'], SHADOW],
    ['.toast', 'box-shadow', ['rgba(0,0,0,0.6)'], SHADOW],
    ['.play-button', 'box-shadow', ['rgba(0, 0, 0, 0.75)'], SHADOW],
    ['@keyframes playPulse 0%, 100%', 'box-shadow', ['rgba(0, 0, 0, 0.75)'], SHADOW],
    ['@keyframes playPulse 50%', 'box-shadow', ['rgba(0, 0, 0, 0.8)'], SHADOW],
    ['.play-button-icon', 'filter', ['rgba(0, 0, 0, 0.35)'], SHADOW],
    ['.lang-btn[aria-pressed="true"], .lang-btn[aria-pressed="true"]:hover', 'background', ['rgba(255, 255, 255, 0.16)'], 'fallback for a browser without color-mix: the themed background written right after it replaces it', { fallback: true }]
].map(([where, prop, literals, reason, options = {}]) => ({ where, prop, literals, reason, ...options }));

/**
 * The closed list of colours the allow-list may name: a colour is only allowed for the job and the properties
 * written here. Widening the allow-list to hide a decorative colour (a white veil, a slate panel, a blue gradient)
 * fails the next test, because no row below covers it; a new meaning colour needs a row, with its reason.
 * `rgb` is the red, green, blue of the colour (the alpha is free); `props` and `places` narrow where it may be.
 */
const MEANING_COLORS = [
    { why: 'danger / error red', rgb: ['244,63,94', '225,29,72', '159,18,57'] },
    { why: 'black depth shadow', rgb: ['0,0,0'], props: ['box-shadow', 'filter'] },
    { why: 'white label on a fixed red fill', rgb: ['255,255,255'], props: ['color'] }
];

/** The rules that follow the theme and are checked in a browser in every theme: a fixed colour is never allowed in them. */
const COLOR_PROPS = new Set(['background', 'background-color', 'background-image', 'color', 'border', 'border-color', 'fill', 'stroke', 'outline']);
const THEMED_SELECTORS = [/^\.btn-primary$/, /^\.play-button$/, /^\.play-button-icon$/, /^h1$/, /^\.lang-btn/, /^\.input-control/, /^\.btn-ghost/];
/** The rules that must keep their meaning colour in every theme: they may not read the brand colours of the theme. */
const SEMANTIC_SELECTORS = [/^\.btn-rose$/, /^\.field-error-pulse$/];

describe('css/style.css: no fixed colour outside the themes and the allow-list', () => {
    const sameLiterals = (a, b) => a.length === b.length && a.every((literal, i) => literal === b[i]);

    it('every fixed colour is on the allow-list, in exactly that place', () => {
        const unlisted = [];
        for (const rule of rules) {
            if (isThemeBlock(rule)) continue;
            for (const d of rule.declarations) {
                const literals = findColorLiterals(d.prop, d.value);
                if (!literals.length) continue;
                const entry = ALLOWED.find((e) => e.where === place(rule) && e.prop === d.prop && sameLiterals(e.literals, literals));
                if (!entry) unlisted.push(`css/style.css:${d.line}  ${place(rule)} { ${d.prop}: ${d.value} }  fixed: ${literals.join(' ')}`);
            }
        }
        assert.deepEqual(unlisted, [], `a fixed colour must be written with the theme tokens (var(--brand-primary), color-mix(...)) or, if it carries a meaning, listed in ALLOWED with the reason:\n${unlisted.join('\n')}`);
    });

    it('every allow-list entry has a real reason, is unique and is still in use', () => {
        const used = new Set();
        for (const rule of rules) {
            if (isThemeBlock(rule)) continue;
            for (const d of rule.declarations) {
                const literals = findColorLiterals(d.prop, d.value);
                ALLOWED.forEach((e, i) => {
                    if (e.where === place(rule) && e.prop === d.prop && sameLiterals(e.literals, literals)) used.add(i);
                });
            }
        }
        const keys = new Set();
        ALLOWED.forEach((e, i) => {
            assert.ok(e.reason.length >= 25, `entry ${i} (${e.where} ${e.prop}) needs a one-line reason`);
            assert.ok(e.literals.length > 0, `entry ${i} lists no colour`);
            const key = `${e.where}|${e.prop}`;
            assert.equal(keys.has(key), false, `duplicate entry ${key}`);
            keys.add(key);
            assert.ok(used.has(i), `entry ${i} (${e.where} ${e.prop} ${e.literals.join(' ')}) matches nothing in css/style.css: delete it`);
        });
    });

    it('the allow-list cannot hide a fixed colour in a rule that has to follow the theme', () => {
        for (const e of ALLOWED) {
            if (e.fallback) continue;
            const themed = THEMED_SELECTORS.some((re) => re.test(e.where));
            assert.equal(themed && COLOR_PROPS.has(e.prop), false, `${e.where} { ${e.prop} } follows the theme: write it with the tokens`);
        }
    });

    it('the allow-list only names meaning colours, each for its own job (it cannot be widened to hide a decorative colour)', () => {
        const rgbOf = (literal) => {
            const rgb = parseColor(literal);
            assert.ok(rgb, `${literal} is not a colour the test can read`);
            return rgb.join(',');
        };
        for (const e of ALLOWED) {
            for (const literal of e.literals) {
                if (e.fallback) {
                    assert.equal(e.prop, 'background', `${e.where}: a fallback is a background`);
                    continue;
                }
                const row = MEANING_COLORS.find((m) => m.rgb.includes(rgbOf(literal)) && (!m.props || m.props.includes(e.prop)) && (!m.places || m.places.includes(e.where)));
                assert.ok(row, `${e.where} { ${e.prop}: ${literal} } is not a meaning colour: write it with the theme tokens`);
            }
        }
    });

    it('a fallback colour is only allowed when the very next declaration of that property is themed', () => {
        for (const e of ALLOWED.filter((x) => x.fallback)) {
            const rule = rules.find((r) => place(r) === e.where);
            assert.ok(rule, e.where);
            const at = rule.declarations.findIndex((d) => d.prop === e.prop && sameLiterals(findColorLiterals(d.prop, d.value), e.literals));
            assert.ok(at >= 0, `${e.where} has no ${e.prop} fallback`);
            const next = rule.declarations[at + 1];
            assert.ok(next && next.prop === e.prop && /color-mix\(/.test(next.value) && findColorLiterals(next.prop, next.value).length === 0, `${e.where}: the fallback ${e.prop} must be followed by a ${e.prop} made of tokens`);
        }
    });

    it('the semantic rules do not read the brand colours (they must not change with the theme)', () => {
        let checked = 0;
        for (const rule of rules) {
            if (!SEMANTIC_SELECTORS.some((re) => re.test(rule.selector))) continue;
            for (const d of rule.declarations) {
                if (!COLOR_PROPS.has(d.prop) && d.prop !== 'box-shadow') continue;
                checked++;
                assert.equal(/var\(--(brand-primary|brand-secondary|bg-|surface-|text-|border-glow)/.test(d.value), false, `${place(rule)} { ${d.prop}: ${d.value} } is semantic but reads a themed token`);
            }
        }
        assert.ok(checked >= 3, `only ${checked} semantic declarations were found: did a selector change?`);
    });

    it('the main button, the play button, the title and the selected language button are made of the theme tokens', () => {
        const value = (selector, prop, last = true) => {
            const matches = rules.filter((r) => r.selector === selector).flatMap((r) => r.declarations.filter((d) => d.prop === prop));
            assert.ok(matches.length, `${selector} { ${prop} } not found`);
            return last ? matches[matches.length - 1].value : matches.map((m) => m.value);
        };
        assert.match(value('.btn-primary', 'background'), /^linear-gradient\(135deg, color-mix\(in srgb, var\(--brand-primary\) \d+%, var\(--bg-body\)\), color-mix\(in srgb, var\(--brand-secondary\) \d+%, var\(--bg-body\)\)\)$/);
        assert.equal(value('.btn-primary', 'color'), 'var(--text-primary)');
        assert.match(value('.play-button', 'background'), /var\(--brand-primary\) \d+%, var\(--bg-body\).*var\(--brand-secondary\) \d+%, var\(--bg-body\)/);
        assert.equal(value('.play-button-icon', 'border-left'), '30px solid var(--text-primary)');
        assert.equal(value('h1', 'background'), 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))');
    });

    it('the selected language button is exactly the agreed block', () => {
        const selected = rules.find((r) => r.selector === '.lang-btn[aria-pressed="true"], .lang-btn[aria-pressed="true"]:hover');
        assert.ok(selected, 'the .lang-btn[aria-pressed="true"] rule exists');
        assert.deepEqual(
            selected.declarations.map((d) => `${d.prop}: ${d.value}`),
            [
                'background: rgba(255, 255, 255, 0.16)',
                'background: color-mix(in srgb, var(--brand-primary) 28%, var(--surface-input))',
                'border-color: var(--brand-primary)',
                'box-shadow: 0 0 14px -4px var(--brand-primary)',
                'color: var(--text-primary)',
                'cursor: default'
            ]
        );
    });
});

describe('the rest of the project writes no theme colour of its own', () => {
    function jsFiles(dir) {
        const out = [];
        for (const name of readdirSync(dir)) {
            const path = `${dir}/${name}`;
            if (statSync(path).isDirectory()) out.push(...jsFiles(path));
            else if (name.endsWith('.js')) out.push(path);
        }
        return out;
    }
    const jsRoot = fileURLToPath(new URL('../../js', import.meta.url));
    // The only place that holds colours in JS: the meta theme colours.
    const COLOR_FILES = new Set(['core/config.js']);

    it('colours in js/ live only in config.js (the catalogs hold words, not colours)', () => {
        const offenders = [];
        for (const file of jsFiles(jsRoot)) {
            const rel = file.slice(jsRoot.length + 1);
            if (rel.startsWith('i18n/') || COLOR_FILES.has(rel)) continue;
            const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            const hits = text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])|rgba?\(|hsla?\(/gi);
            if (hits) offenders.push(`js/${rel}: ${hits.join(' ')}`);
        }
        assert.deepEqual(offenders, []);
    });

    it('the JS that sets a colour on an element only uses the semantic tokens', () => {
        for (const file of jsFiles(jsRoot)) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/\.style\.(color|background\w*|borderColor|fill|stroke)\s*=\s*([^;]+);/g)) {
                assert.match(m[2], /^(color|''|var\(--brand-(rose|emerald|amber)\))$/, `${file}: style.${m[1]} = ${m[2]}`);
            }
        }
    });
});

describe('the label of the main button and the play button is readable in every theme', () => {
    // The two gradients are written with a fixed share of each brand colour mixed into the page colour of the theme
    // (45%). This reads that share from the stylesheet and measures the light label on both ends and in between.
    const MIX = /color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, var\((--[\w-]+)\)\)/g;
    const mixOf = (tokens, name, share, other) => {
        const a = parseColor(tokens[name]);
        const b = parseColor(tokens[other]);
        return a.map((v, i) => v * (share / 100) + b[i] * (1 - share / 100));
    };
    for (const selector of ['.btn-primary', '.play-button']) {
        const decl = rules.filter((r) => r.selector === selector).flatMap((r) => r.declarations).filter((d) => d.prop === 'background' && /color-mix/.test(d.value)).pop();
        for (const name of THEME_NAMES) {
            it(`${selector} in ${name}: at least 4.5:1 for the label`, () => {
                const tokens = effectiveTokens(themes, name);
                const stops = [...decl.value.matchAll(MIX)].map((m) => mixOf(tokens, m[1], Number(m[2]), m[3]));
                assert.equal(stops.length, 2, 'two colour stops made of tokens');
                const label = parseColor(tokens['--text-primary']);
                for (let k = 0; k <= 10; k++) {
                    const point = stops[0].map((v, i) => v * (1 - k / 10) + stops[1][i] * (k / 10));
                    const ratio = contrastRatio(point, label);
                    assert.ok(ratio >= 4.5, `${selector} ${name}: ${ratio.toFixed(2)}:1 at ${k * 10}% of the gradient`);
                }
            });
        }
    }
});
