/**
 * Lists of names ("A, B and C"): `formatList` / `formatListHtml` in i18n/index.js, driven by the catalog keys
 * `names.pair`, `names.list.separator` and `names.list.last`. No screen uses them yet; the game screens of the
 * next steps will, so the helpers are kept working and tested here.
 *
 * Persian writes one word at every step; English gets a comma list with no comma before "and". A fake
 * language proves which template each step uses.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { CATALOGS } = await import('../../js/i18n/catalogs.js');
const { en } = await import('../../js/i18n/en.js');
const { fa } = await import('../../js/i18n/fa.js');
const { DEFAULT_LANG, LANG_DIRECTIONS, SUPPORTED_LANGS, formatList, formatListHtml, isolate, rawHtml, setLang, t, tHtml } =
    await import('../../js/i18n/index.js');

after(() => env.uninstall());
afterEach(() => setLang(DEFAULT_LANG));

/** The plain way: chain `names.pair` one name at a time. */
const oldChain = (items) => items.reduce((joined, next) => t('names.pair', { a: joined, b: next }));
const oldChainHtml = (items) => items.reduce((joined, next) => tHtml('names.pair', { a: rawHtml(joined), b: rawHtml(next) }));

const ABCDE = ['A', 'B', 'C', 'D', 'E'];

/** Run `run` with a made-up language whose three list templates all differ, then take it out again. */
function withFakeLanguage(run) {
    SUPPORTED_LANGS.push('xx');
    CATALOGS.xx = { ...en, 'names.pair': '{a} & {b}', 'names.list.separator': '{a}; {b}', 'names.list.last': '{a} + {b}' };
    LANG_DIRECTIONS.xx = 'ltr';
    try {
        setLang('xx');
        return run();
    } finally {
        setLang(DEFAULT_LANG);
        SUPPORTED_LANGS.splice(SUPPORTED_LANGS.indexOf('xx'), 1);
        delete CATALOGS.xx;
        delete LANG_DIRECTIONS.xx;
    }
}

describe('the catalog keys', () => {
    it('both catalogs have the list templates, with the {a} and {b} placeholders', () => {
        for (const catalog of [fa, en]) {
            for (const key of ['names.pair', 'names.list.separator', 'names.list.last']) {
                assert.equal(typeof catalog[key], 'string', key);
                assert.ok(catalog[key].includes('{a}') && catalog[key].includes('{b}'), key);
            }
        }
    });

    it('Persian writes the same word at every step, so a chain of names.pair and the list agree', () => {
        assert.equal(fa['names.list.separator'], fa['names.pair']);
        assert.equal(fa['names.list.last'], fa['names.pair']);
    });
});

describe('formatList in Persian', () => {
    it('writes nothing, one name, two names, three names and five names', () => {
        assert.equal(formatList([]), '');
        assert.equal(formatList(['A']), 'A');
        assert.equal(formatList(['A', 'B']), 'A و B');
        assert.equal(formatList(['A', 'B', 'C']), 'A و B و C');
        assert.equal(formatList(ABCDE), 'A و B و C و D و E');
    });

    it('is exactly what a chain of names.pair produces, for 1 to 8 names, with Persian and quoted names', () => {
        const names = ['سارا', 'Ali', '«بیتا»', 'Cyrus', '{b}', 'Dara', 'Eli', 'نیما'];
        for (let n = 1; n <= names.length; n++) {
            const items = names.slice(0, n);
            assert.equal(formatList(items), oldChain(items), `${n} names`);
        }
    });
});

describe('formatList in English', () => {
    it('writes nothing, one name, two names, three names and five names', () => {
        setLang('en');
        assert.equal(formatList([]), '');
        assert.equal(formatList(['A']), 'A');
        assert.equal(formatList(['A', 'B']), 'A and B');
        assert.equal(formatList(['A', 'B', 'C']), 'A, B and C');
        assert.equal(formatList(ABCDE), 'A, B, C, D and E');
    });

    it('never puts a comma before "and" and never chains "and and"', () => {
        setLang('en');
        for (let n = 2; n <= 6; n++) {
            const text = formatList(ABCDE.concat('F').slice(0, n));
            assert.doesNotMatch(text, /,\s*and\b/, text);
            assert.equal(text.match(/ and /g).length, 1, text);
        }
    });

    it('keeps the items as they are: quotes, isolation marks and text that looks like a placeholder', () => {
        setLang('en');
        const items = ['“Ali”', `“${isolate('سارا')}”`, '“{a}”'];
        assert.equal(formatList(items), `“Ali”, “${isolate('سارا')}” and “{a}”`);
    });
});

describe('which template each step uses', () => {
    it('two names use names.pair; from three on the separator joins all but the last, and names.list.last the last', () => {
        withFakeLanguage(() => {
            assert.equal(formatList(['A']), 'A');
            assert.equal(formatList(['A', 'B']), 'A & B');
            assert.equal(formatList(['A', 'B', 'C']), 'A; B + C');
            assert.equal(formatList(['A', 'B', 'C', 'D']), 'A; B; C + D');
            assert.equal(formatList(ABCDE), 'A; B; C; D + E');
        });
    });

    it('formatListHtml follows the same steps', () => {
        withFakeLanguage(() => {
            assert.equal(formatListHtml(['<b>A</b>', '<b>B</b>']), '<b>A</b> &amp; <b>B</b>');
            assert.equal(formatListHtml(['<b>A</b>', '<b>B</b>', '<b>C</b>']), '<b>A</b>; <b>B</b> + <b>C</b>');
        });
    });

    it('accepts any iterable and does not change its argument', () => {
        setLang('en');
        const items = ['A', 'B', 'C'];
        assert.equal(formatList(new Set(items)), 'A, B and C');
        assert.deepEqual(items, ['A', 'B', 'C']);
        assert.equal(formatList(undefined), '');
    });
});

describe('formatListHtml', () => {
    it('Persian equals the HTML chain; the items are inserted as they are', () => {
        const items = ['<bdi>سارا</bdi>', '<bdi>Ali</bdi>', '<bdi>&amp;x</bdi>', '<bdi>D</bdi>'];
        for (let n = 1; n <= items.length; n++) {
            assert.equal(formatListHtml(items.slice(0, n)), oldChainHtml(items.slice(0, n)), `${n} names`);
        }
        assert.equal(formatListHtml(items.slice(0, 3)), '<bdi>سارا</bdi> و <bdi>Ali</bdi> و <bdi>&amp;x</bdi>');
    });

    it('English: 1, 2, 3 and 5 names', () => {
        setLang('en');
        const bdi = (name) => `<bdi>${name}</bdi>`;
        assert.equal(formatListHtml([]), '');
        assert.equal(formatListHtml([bdi('A')]), '<bdi>A</bdi>');
        assert.equal(formatListHtml([bdi('A'), bdi('B')]), '<bdi>A</bdi> and <bdi>B</bdi>');
        assert.equal(formatListHtml(['A', 'B', 'C'].map(bdi)), '<bdi>A</bdi>, <bdi>B</bdi> and <bdi>C</bdi>');
        assert.equal(formatListHtml(ABCDE.map(bdi)), '<bdi>A</bdi>, <bdi>B</bdi>, <bdi>C</bdi>, <bdi>D</bdi> and <bdi>E</bdi>');
    });
});
