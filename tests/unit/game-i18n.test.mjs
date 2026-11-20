/**
 * The texts of the game screens (steps 3B): every key of the new groups is in both catalogs with the same
 * placeholders, is USED by code or by index.html outside the catalogs (the older orphan check counts the English
 * catalog's own key list as a use, so it cannot fail; this one does not), reads natively and not word for word, and
 * an engine error code never reaches a person.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';

const env = installFakeEnv();
const { errorKey, errorText } = await import('../../js/ui/errorTexts.js');
const { setLang } = await import('../../js/i18n/index.js');
const { ERRORS } = await import('../../js/game/constants.js');

const GROUPS = ['game', 'night', 'morning', 'day', 'dusk', 'ended'];
const keysOf = (catalog) => Object.keys(catalog).filter((key) => GROUPS.includes(key.split('.')[0]));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function listJs(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listJs(full) : full.endsWith('.js') ? [full] : [];
    });
}
const root = new URL('../../', import.meta.url).pathname;
const sources = [...listJs(join(root, 'js')).filter((file) => !/\/i18n\/(fa|en)\.js$/.test(file)), join(root, 'index.html')].map((file) => readFileSync(file, 'utf8'));
/** True when some source outside the two catalogs names the key, or (for a plural) its stem. */
function isUsed(key) {
    const stem = key.replace(/\.(one|other)$/, '');
    return sources.some((source) => source.includes(`'${stem}'`) || source.includes(`"${stem}"`) || source.includes(`\`${stem}\``) || source.includes(`data-i18n="${stem}"`) || source.includes(`aria-label:${stem}"`));
}

describe('the keys of the game screens', () => {
    it('both catalogs have the same ones', () => {
        assert.deepEqual(keysOf(en).sort(), keysOf(fa).sort());
        assert.ok(keysOf(fa).length > 60, 'the groups are not empty');
    });

    it('the placeholders agree, key by key', () => {
        for (const key of keysOf(fa)) assert.deepEqual(placeholders(fa[key]), placeholders(en[key]), key);
    });

    it('every one is used by the code or the page, never only listed', () => {
        const unused = keysOf(fa).filter((key) => !isUsed(key));
        assert.deepEqual(unused, []);
    });

    it('no key of the removed moderator screen is left in either catalog', () => {
        assert.deepEqual(Object.keys(fa).filter((key) => key.startsWith('moderator.')), []);
        assert.deepEqual(Object.keys(en).filter((key) => key.startsWith('moderator.')), []);
    });

    it('English has no Persian letter and Persian has no run of English words (a name or a role is the only Latin that may appear)', () => {
        for (const key of keysOf(en)) assert.doesNotMatch(en[key], /[\u0600-\u06FF]/, key);
        for (const key of keysOf(fa)) assert.doesNotMatch(fa[key].replace(/\{\w+\}/g, ''), /[A-Za-z]{3,}/, key);
    });

    it('is written for each language: no English text equals its Persian one, and the plural forms agree in Persian', () => {
        for (const key of keysOf(fa)) assert.notEqual(en[key], fa[key], key);
        assert.equal(fa['day.counter.one'], fa['day.counter.other']);
        assert.notEqual(en['day.counter.one'], en['day.counter.other']);
    });

    it('the instructions carry the words the table is told: ONE target for the mafia, godfather included', () => {
        assert.match(en['night.do.mafia.godfather'], /godfather included/);
        assert.match(en['night.do.mafia.godfather'], /ONE target/);
        assert.match(en['night.do.mafia.plain'], /ONE target/);
        assert.doesNotMatch(en['night.do.mafia.plain'], /godfather/);
        assert.match(fa['night.do.mafia.godfather'], /پدرخوانده/);
        assert.doesNotMatch(fa['night.do.mafia.plain'], /پدرخوانده/);
    });

    it('uses the glossary: eliminated (حذف‌شده) for a player out of the game, never a word for death on the player marks', () => {
        assert.equal(en['game.player.dead'], 'Eliminated');
        assert.equal(fa['game.player.dead'], 'حذف‌شده');
        assert.equal(fa['game.heading.night'].startsWith('شب'), true);
        assert.equal(fa['game.heading.day'].startsWith('روز'), true);
        assert.match(fa['day.close'], /رأی‌گیری/);
        assert.match(fa['night.do.doctor'], /دکتر/);
        assert.match(fa['night.do.detective'], /کارآگاه/);
        assert.match(fa['ended.winner.mafia'], /مافیا/);
        assert.match(fa['ended.winner.town'], /شهروندان/);
    });
});

describe('an engine error never reaches a person as a code', () => {
    it('the two refusals a screen could cause have a message of their own, any other code the general one', () => {
        assert.equal(errorKey('SELF_SAVE_NOT_ALLOWED'), 'game.error.selfSave');
        assert.equal(errorKey('CANNOT_CHECK_SELF'), 'game.error.checkSelf');
        for (const code of ['INVALID_TALLY', 'GAME_OVER', 'NOTHING_TO_UNDO', 'bogus', '', null, undefined, 7, 'constructor', '__proto__']) {
            assert.equal(errorKey(code), 'game.error.generic', String(code));
        }
    });

    it('for every error code of the engine the text is catalog text in both languages, and the code itself is nowhere in it', () => {
        for (const lang of ['fa', 'en']) {
            setLang(lang);
            for (const code of Object.values(ERRORS)) {
                const text = errorText(code);
                assert.ok(text.length > 10, `${lang} ${code}`);
                assert.ok([fa['game.error.generic'], en['game.error.generic'], fa['game.error.selfSave'], en['game.error.selfSave'], fa['game.error.checkSelf'], en['game.error.checkSelf']].includes(text), `${lang} ${code}`);
                assert.ok(!text.includes(code), `${lang}: ${code} is not shown`);
            }
        }
        setLang('fa');
        env.uninstall();
    });
});
