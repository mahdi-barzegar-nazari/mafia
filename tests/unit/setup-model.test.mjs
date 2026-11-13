/**
 * ui/setupModel.js: the setup form without a page. What a name may be, the default names of each language and how
 * they follow a language change, whether the godfather is allowed for a count, the call to the rules engine that
 * deals the roles, and what each refusal of the engine means to the person (a catalog message and the input at
 * fault, never the error code).
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { ERRORS } from '../../js/game/constants.js';
import { createGame } from '../../js/game/engine.js';
import { DEFAULT_RULES, DOCTOR_SELF_SAVE_MODES, NAME_LIMITS } from '../../js/game/rules.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { namesFor, seeded } from './helpers/gameKit.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const model = await import('../../js/ui/setupModel.js');
const { DEFAULT_LANG, SUPPORTED_LANGS, setLang } = await import('../../js/i18n/index.js');
const { MAFIA_TEAM } = await import('../../js/data/roles.js');

useGameHarness(env);
after(() => env.uninstall());
afterEach(() => setLang(DEFAULT_LANG));

const CATALOGS = { fa, en };
const CREATE_CODES = ['INVALID_INPUT', 'INVALID_NAMES', 'INVALID_PLAYER_COUNT', 'INVALID_NAME', 'DUPLICATE_NAME', 'GODFATHER_NOT_ALLOWED', 'INVALID_ROLES', 'INVALID_RANDOM'];
const CODE_SHAPE = /\b[A-Z]{2,}(?:_[A-Z]+)+\b/;

describe('the numbers of the form agree with the engine', () => {
    it('a name is at most as long as the engine allows, and there is no shorter limit in the form', () => {
        assert.equal(model.MAX_NAME_LENGTH, NAME_LIMITS.max);
        assert.equal(NAME_LIMITS.min, 1);
    });

    it('the doctor select offers the engine\'s three modes, in its order', () => {
        assert.deepEqual([...model.DOCTOR_SAVE_MODES], [...DOCTOR_SELF_SAVE_MODES]);
    });

    it('the form starts from the engine defaults', () => {
        assert.deepEqual({ ...model.FORM_DEFAULT_RULES }, {
            doctorSelfSave: DEFAULT_RULES.doctorSelfSave,
            godfather: DEFAULT_RULES.godfather,
            revealRoleOnDeath: DEFAULT_RULES.revealRoleOnDeath
        });
        assert.deepEqual({ ...model.FORM_DEFAULT_RULES }, { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });
    });
});

describe('names', () => {
    it('characterCount counts what a person counts: an emoji is one character, and a missing value is none', () => {
        assert.equal(model.characterCount('Sara'), 4);
        assert.equal(model.characterCount('😀😀😀'), 3);
        assert.equal(model.characterCount('سارا'), 4);
        for (const value of [undefined, null, '']) assert.equal(model.characterCount(value), 0);
    });

    it('capName cuts to 24 characters, never in the middle of an emoji, and leaves a short name alone', () => {
        assert.equal(model.capName('x'.repeat(24)), 'x'.repeat(24));
        assert.equal(model.capName('x'.repeat(40)), 'x'.repeat(24));
        const emoji = '😀'.repeat(30);
        assert.equal(model.capName(emoji), '😀'.repeat(24));
        assert.equal(model.capName('سارا'), 'سارا');
        for (const value of [undefined, null, 7, {}]) assert.equal(model.capName(value), '');
    });

    it('a capped name is one the engine accepts', () => {
        const names = namesFor(3);
        names[0] = model.capName('y'.repeat(50));
        assert.equal(createGame({ names, random: seeded(1) }).ok, true);
    });

    it('defaultName is "Player N" in English and the Persian word with Persian digits in Persian', () => {
        assert.equal(model.defaultName(3), 'بازیکن ۳');
        setLang('en');
        assert.equal(model.defaultName(3), 'Player 3');
        assert.equal(model.defaultName(12), 'Player 12');
    });

    it('every default name fits the name limit and is distinct from the others (so a fresh form can be dealt as it is)', () => {
        for (const lang of SUPPORTED_LANGS) {
            setLang(lang);
            const names = Array.from({ length: 20 }, (_, i) => model.defaultName(i + 1));
            assert.equal(new Set(names).size, 20, lang);
            for (const name of names) assert.ok(model.characterCount(name) <= model.MAX_NAME_LENGTH, name);
            assert.equal(createGame({ names, random: seeded(2) }).ok, true, lang);
        }
    });

    it('isDefaultNameForSlot knows the default of ANY language, in any digit form, for its own slot only', () => {
        for (const text of ['بازیکن ۳', 'بازیکن 3', 'بازیکن ٣', 'Player 3', '  Player 3  ']) assert.equal(model.isDefaultNameForSlot(text, 3), true, text);
        for (const text of ['Player 4', 'بازیکن ۴', 'Player', 'player 3', 'Player 3!', 'Sara', '', '   ']) assert.equal(model.isDefaultNameForSlot(text, 3), false, JSON.stringify(text));
        for (const value of [undefined, null, 3, {}]) assert.equal(model.isDefaultNameForSlot(value, 3), false);
    });

    it('relocalizedName turns a default into the active language\'s default and leaves a typed name alone', () => {
        setLang('en');
        assert.equal(model.relocalizedName('بازیکن ۲', 2), 'Player 2');
        assert.equal(model.relocalizedName('Player 2', 2), 'Player 2');
        assert.equal(model.relocalizedName('Sara', 2), 'Sara');
        assert.equal(model.relocalizedName('Player 7', 2), 'Player 7', 'another slot\'s default is a name somebody typed');
        setLang('fa');
        assert.equal(model.relocalizedName('Player 2', 2), 'بازیکن ۲');
    });
});

describe('the godfather and the player count', () => {
    it('is allowed from 6 players to 20, and from nowhere else (asked of the engine, not copied)', () => {
        const allowed = [];
        for (let count = 0; count <= 25; count++) if (model.godfatherAvailable(count)) allowed.push(count);
        assert.deepEqual(allowed, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        assert.equal(model.godfatherMinPlayers(), 6);
    });

    it('agrees with createGame itself on both sides of the limit', () => {
        for (const count of [5, 6]) {
            const result = createGame({ names: namesFor(count), rules: { godfather: true }, random: seeded(3) });
            assert.equal(result.ok, model.godfatherAvailable(count), `${count} players`);
            if (!result.ok) assert.equal(result.error, ERRORS.GODFATHER_NOT_ALLOWED);
        }
    });

    it('is not available for a count that is not a whole number', () => {
        for (const count of [NaN, undefined, null, '8', 8.5, -1, Infinity]) assert.equal(model.godfatherAvailable(count), false, String(count));
    });
});

describe('which input is at fault', () => {
    it('findInvalidName points at the first empty, too long or invisible name', () => {
        const names = namesFor(5);
        assert.equal(model.findInvalidName(names), -1);
        for (const [index, bad] of [[2, ''], [0, '   '], [4, 'x'.repeat(25)], [1, '​‎']]) {
            const copy = [...names];
            copy[index] = bad;
            assert.equal(model.findInvalidName(copy), index, JSON.stringify(bad));
        }
        const two = [...names];
        two[1] = '';
        two[3] = '';
        assert.equal(model.findInvalidName(two), 1, 'the first one');
    });

    it('findDuplicateName points at the SECOND of two names the engine reads as the same', () => {
        const names = ['Ali', 'Sara', 'Reza', 'Nima'];
        assert.equal(model.findDuplicateName(names), -1);
        assert.equal(model.findDuplicateName(['Ali', 'Sara', 'ali', 'Nima']), 2, 'case does not matter');
        assert.equal(model.findDuplicateName(['Ali', 'Sara', 'Reza', ' Sara ']), 3, 'spaces around do not matter');
        assert.equal(model.findDuplicateName(['علی', 'سارا', 'علی']), 2);
    });
});

describe('every error code of createGame has a message', () => {
    it('the table lists exactly the codes createGame can answer with', () => {
        for (const code of CREATE_CODES) assert.ok(Object.hasOwn(ERRORS, code), code);
        assert.deepEqual(Object.keys(model.CREATE_ERROR_KEYS).sort(), [...CREATE_CODES].sort());
    });

    it('each code maps to a catalog key that both languages have, with the same placeholders', () => {
        for (const code of CREATE_CODES) {
            const key = model.CREATE_ERROR_KEYS[code];
            for (const [lang, catalog] of Object.entries(CATALOGS)) assert.equal(typeof catalog[key], 'string', `${lang}: ${key} for ${code}`);
            const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
            assert.deepEqual(holes(fa[key]), holes(en[key]), key);
        }
        const keys = new Set(Object.values(model.CREATE_ERROR_KEYS));
        for (const extra of ['setup.error.nameTooLong']) assert.ok(fa[extra] && en[extra], extra);
        assert.ok(keys.size >= 4);
    });

    it('explainCreateError gives text in the active language for every code, and never the code itself', () => {
        const names = namesFor(4);
        for (const lang of SUPPORTED_LANGS) {
            setLang(lang);
            for (const code of [...CREATE_CODES, 'SOME_NEW_CODE', undefined, null, 7, {}]) {
                const { key, message, target } = model.explainCreateError(code, names);
                assert.equal(typeof message, 'string');
                assert.ok(message.length > 5, `${lang}/${String(code)}`);
                assert.doesNotMatch(message, CODE_SHAPE, `${lang}/${String(code)}: ${message}`);
                if (typeof code === 'string') assert.ok(!message.includes(code), `${lang}/${code}`);
                assert.ok(CATALOGS[lang][key], `${lang}: ${key}`);
                assert.ok(target === null || typeof target === 'object');
            }
        }
    });

    it('a code this table does not know gets the general message, with no input at fault', () => {
        const { key, target } = model.explainCreateError('SOME_NEW_CODE', namesFor(4));
        assert.equal(key, 'setup.error.generic');
        assert.equal(target, null);
    });

    it('the messages carry the numbers of the rules in the active language\'s digits', () => {
        const count = model.explainCreateError(ERRORS.INVALID_PLAYER_COUNT);
        assert.equal(count.message, 'تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!');
        assert.deepEqual(count.target, { kind: 'count' });
        setLang('en');
        assert.equal(model.explainCreateError(ERRORS.INVALID_PLAYER_COUNT).message, 'You need 3 to 20 players!');
        assert.equal(model.explainCreateError(ERRORS.GODFATHER_NOT_ALLOWED).message, 'The godfather needs at least 6 players!');
    });
});

describe('dealGame', () => {
    it('deals a game from typed names: trimmed, in order, one role each, with the roles of the rules', () => {
        const names = ['  Ali ', 'Sara', 'Reza', 'Nima', 'Mina', 'Omid', 'Kian', 'Roya'];
        const result = model.dealGame(names, { doctorSelfSave: 'never', godfather: true, revealRoleOnDeath: false }, seeded(5));
        assert.equal(result.ok, true);
        const { players, rules } = result.game.setup;
        assert.deepEqual(players.map((p) => p.name), ['Ali', 'Sara', 'Reza', 'Nima', 'Mina', 'Omid', 'Kian', 'Roya']);
        assert.deepEqual(rules, { doctorSelfSave: 'never', godfather: true, revealRoleOnDeath: false });
        assert.equal(players.filter((p) => p.role === 'godfather').length, 1);
        assert.equal(players.filter((p) => p.role === 'doctor').length, 1);
        assert.equal(players.filter((p) => p.role === 'detective').length, 1);
        assert.ok(players.filter((p) => MAFIA_TEAM.includes(p.role)).length >= 2);
    });

    it('uses the random it is given, so a test can replay a deal, and the browser\'s secure one by default', () => {
        const names = namesFor(8);
        const a = model.dealGame(names, {}, seeded(9));
        const b = model.dealGame(names, {}, seeded(9));
        assert.deepEqual(a.game, b.game);
        env.seedRandom(4);
        const c = model.dealGame(names, {});
        assert.equal(c.ok, true);
        const sample = model.cryptoUnitRandom();
        assert.ok(sample >= 0 && sample < 1);
    });

    it('refuses with the explanation of the engine\'s error, never throws, and gives no game', () => {
        for (const [names, kind] of [[namesFor(2), 'count'], [['Ali', '', 'Reza'], 'name'], [['Ali', 'ali', 'Reza'], 'name'], [undefined, undefined], [null, undefined], ['Ali', undefined]]) {
            const result = model.dealGame(names, {}, seeded(1));
            assert.equal(result.ok, false);
            assert.equal(result.game, undefined);
            assert.equal(typeof result.problem.message, 'string');
            if (kind) assert.equal(result.problem.target.kind, kind);
        }
    });

    it('points an empty name at its own slot, a repeated name at the second one, a long name at its slot with the long-name text', () => {
        const empty = model.dealGame(['Ali', 'Sara', '', 'Nima'], {}, seeded(1)).problem;
        assert.deepEqual([empty.key, empty.target], ['setup.error.nameEmpty', { kind: 'name', index: 2 }]);
        assert.match(empty.message, /۳/);
        const duplicate = model.dealGame(['Ali', 'Sara', 'Reza', 'ali'], {}, seeded(1)).problem;
        assert.deepEqual([duplicate.key, duplicate.target], ['setup.error.nameDuplicate', { kind: 'name', index: 3 }]);
        const long = model.dealGame(['Ali', 'x'.repeat(25), 'Reza', 'Nima'], {}, seeded(1)).problem;
        assert.deepEqual([long.key, long.target], ['setup.error.nameTooLong', { kind: 'name', index: 1 }]);
        assert.match(long.message, /۲۴/);
    });

    it('a godfather for fewer than 6 players is refused and points at the godfather switch', () => {
        const problem = model.dealGame(namesFor(5), { godfather: true }, seeded(1)).problem;
        assert.deepEqual([problem.key, problem.target], ['setup.error.godfather', { kind: 'godfather' }]);
        assert.match(problem.message, /۶/);
    });
});

describe('readFormRules', () => {
    it('reads the select and the two switches', () => {
        assert.deepEqual(model.readFormRules({ doctorSelfSave: 'always', godfather: true, revealRoleOnDeath: false }, 8), { doctorSelfSave: 'always', godfather: true, revealRoleOnDeath: false });
    });

    it('a godfather switch that is on but not allowed for the count asks for nothing', () => {
        assert.equal(model.readFormRules({ doctorSelfSave: 'once', godfather: true, revealRoleOnDeath: true }, 5).godfather, false);
        assert.equal(model.readFormRules({ doctorSelfSave: 'once', godfather: true, revealRoleOnDeath: true }, 6).godfather, true);
    });

    it('a value that is not one of the three doctor modes becomes the default', () => {
        for (const value of ['sometimes', '', undefined, null, 1]) assert.equal(model.readFormRules({ doctorSelfSave: value, godfather: false, revealRoleOnDeath: true }, 8).doctorSelfSave, 'once');
    });
});
