/**
 * The token system, read as a whole: every colour the stylesheet reads, `var(--something)`, is a token that all eight
 * themes can give, so no theme can ever render a gap (a transparent card, an unstyled button) because a token is
 * missing or mistyped. tests/unit/theme-colors.test.mjs checks that no fixed colour hides outside the themes;
 * this file checks the other direction: nothing reads a token that is not there.
 *
 * The browser computes the same thing for the eight themes in tests/e2e/theme-colors.test.mjs.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { effectiveTokens, parseRules, readProjectFile, readThemeBlocks, themeNameOfSelector } from './helpers/cssTokens.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const css = readProjectFile('css/style.css');
const rules = parseRules(css);
const themes = readThemeBlocks(css);
const THEME_NAMES = ['default', 'noir', 'classic', 'emerald', 'crimson', 'sunset', 'cyber', 'ocean'];
const THEMED_TOKENS = ['--bg-body', '--bg-gradient', '--surface-card', '--surface-input', '--border-glow', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary'];
const SEMANTIC_TOKENS = ['--brand-emerald', '--brand-rose', '--brand-amber'];
/** Set once in :root, never per theme: the reading direction as a sign (see css-direction.test.mjs). */
const STRUCTURAL_TOKENS = ['--dir'];

const isThemeBlock = (rule) => !rule.context.length && themeNameOfSelector(rule.selector) !== null;

/** Every `var(--name ...)` in the declarations of the stylesheet: `{ token, fallback, line }`. */
function tokenReads() {
    const reads = [];
    for (const rule of rules) {
        for (const declaration of rule.declarations) {
            for (const match of declaration.value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
                reads.push({ token: match[1], fallback: Boolean(match[2]), line: declaration.line, where: `${rule.selector} { ${declaration.prop} }`, inThemeBlock: isThemeBlock(rule) });
            }
        }
    }
    return reads;
}

/** Tokens a rule that is not a theme block defines for itself (a component's own custom property). */
function locallyDefined() {
    const names = new Set();
    for (const rule of rules) {
        if (isThemeBlock(rule)) continue;
        for (const declaration of rule.declarations) if (declaration.prop.startsWith('--')) names.add(declaration.prop);
    }
    return names;
}

function listFiles(dir, extension) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return listFiles(full, extension);
        return full.endsWith(extension) ? [full] : [];
    });
}

describe('what the stylesheet reads', () => {
    const reads = tokenReads();
    const bare = reads.filter((r) => !r.fallback);

    it('reads the tokens (so the checks below are not empty)', () => {
        const names = new Set(bare.map((r) => r.token));
        for (const token of ['--bg-body', '--text-primary', '--brand-primary', '--surface-card']) assert.ok(names.has(token), `nothing reads ${token}`);
        assert.ok(names.size >= 8, [...names].join(' '));
    });

    for (const name of THEME_NAMES) {
        it(`${name}: every token the stylesheet reads without a fallback has a value`, () => {
            const tokens = effectiveTokens(themes, name);
            const local = locallyDefined();
            for (const read of bare) {
                const value = tokens[read.token];
                const fine = (typeof value === 'string' && value.trim() !== '') || local.has(read.token);
                assert.ok(fine, `${read.where} (line ${read.line}) reads ${read.token}, which ${name} does not define`);
            }
        });
    }

    it('a token whose value is another token points at one that exists', () => {
        for (const name of THEME_NAMES) {
            const tokens = effectiveTokens(themes, name);
            for (const [token, value] of Object.entries(tokens)) {
                for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) assert.ok(m[1] in tokens, `${name}: ${token} reads ${m[1]}, which is not defined`);
            }
        }
    });

    it('no token is given an empty value in any theme', () => {
        for (const name of THEME_NAMES) {
            for (const [token, value] of Object.entries(themes[name])) assert.notEqual(value.trim(), '', `${name}: ${token} is empty`);
        }
    });

    it('every themed token is read by some rule (a token nobody reads is a typo or leftover)', () => {
        const read = new Set(reads.map((r) => r.token));
        for (const token of THEMED_TOKENS) assert.ok(read.has(token), `${token} is defined but no rule reads it`);
    });
});

describe('what the themes define', () => {
    it('a theme other than the default sets only the themed tokens, so a mistyped name cannot hide in it', () => {
        for (const name of THEME_NAMES.filter((n) => n !== 'default')) {
            assert.deepEqual(Object.keys(themes[name]).sort(), [...THEMED_TOKENS].sort(), name);
        }
    });

    it('the default theme sets the themed tokens, the three meaning colours and the direction sign, and nothing else', () => {
        assert.deepEqual(Object.keys(themes.default).sort(), [...THEMED_TOKENS, ...SEMANTIC_TOKENS, ...STRUCTURAL_TOKENS].sort());
    });

    it('a theme block that is not one of the eight does not exist (a typo in a data-theme selector would never apply)', () => {
        const names = rules.filter(isThemeBlock).map((r) => themeNameOfSelector(r.selector));
        for (const name of names) assert.ok(THEME_NAMES.includes(name), name);
        const selectors = rules.filter((r) => /data-theme/.test(r.selector) && !isThemeBlock(r)).map((r) => r.selector);
        for (const selector of selectors) {
            for (const m of selector.matchAll(/data-theme="([^"]*)"/g)) assert.ok(THEME_NAMES.includes(m[1]), `${selector} names the theme "${m[1]}"`);
        }
    });
});

describe('what the rest of the project reads', () => {
    const defined = new Set(Object.keys(effectiveTokens(themes, 'default')));
    const sources = [join(ROOT, 'index.html'), ...listFiles(join(ROOT, 'js'), '.js')];

    it('no script or page names a token that does not exist', () => {
        for (const file of sources) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) assert.ok(defined.has(m[1]), `${file.slice(ROOT.length)} reads ${m[1]}`);
        }
    });

    it('the scan sees the files (the folders exist and are not empty)', () => {
        assert.ok(sources.length >= 20, `only ${sources.length} files`);
    });
});
