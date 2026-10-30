/**
 * The setup screen of this step: the players-count field. Its text is turned into a number by
 * `parsePlayersCount`, judged by `isValidPlayersCount` against `RULES.players`, and `validateAndSaveSettings`
 * saves a good count in `gameState.settings` or tells the person what is wrong (a toast, and the field is
 * pulsed and focused). The hint under the field (`updateSetupLimitHints`) states the same limits.
 * The form is faked: the field is an element with a `value`, as the browser would give.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { DEFAULT_PLAYERS_COUNT, RULES } from '../../js/core/config.js';
import { gameState } from '../../js/core/state.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { isValidPlayersCount, parsePlayersCount, updateSetupLimitHints, validateAndSaveSettings } = await import('../../js/ui/setup.js');
const { DEFAULT_LANG, setLang, t } = await import('../../js/i18n/index.js');

useGameHarness(env, {
    setup: () => {
        env.el('toast-container');
        env.el('setup-players-count').value = String(DEFAULT_PLAYERS_COUNT);
        env.el('players-limit-hint');
    }
});
after(() => env.uninstall());
afterEach(() => setLang(DEFAULT_LANG));

const field = () => env.el('setup-players-count');
const hint = () => env.el('players-limit-hint').textContent;

describe('parsePlayersCount', () => {
    it('reads whole numbers written with Latin, Persian or Arabic-Indic digits', () => {
        const accepted = [['8', 8], ['3', 3], ['20', 20], ['۸', 8], ['٨', 8], ['۱۲', 12], ['١٥', 15], ['08', 8], ['007', 7], ['0', 0]];
        for (const [text, count] of accepted) assert.equal(parsePlayersCount(text), count, JSON.stringify(text));
    });

    it('ignores spaces and invisible direction marks around the digits (a Persian keyboard or a paste can leave them)', () => {
        const accepted = [[' 8 ', 8], ['\t8\n', 8], ['\u200f8', 8], ['8\u200e', 8], ['\u200f۱۲\u200e', 12], ['\u202b12\u202c', 12], ['\u200c12', 12], ['\ufeff12', 12]];
        for (const [text, count] of accepted) assert.equal(parsePlayersCount(text), count, JSON.stringify(text));
    });

    it('rejects everything that is not just digits: it is a typo to point out, not a number to guess at', () => {
        const rejected = ['', ' ', '   ', 'abc', '8 players', '8abc', 'a8', '4.5', '4,5', '۴٫۵', '-3', '+5', '1e1', '0x10', '1 2', '８', '٫', '.', 'NaN', 'Infinity', '٣٤٥a'];
        for (const text of rejected) assert.ok(Number.isNaN(parsePlayersCount(text)), JSON.stringify(text));
    });

    it('turns a missing or odd value into NaN and never throws', () => {
        for (const value of [undefined, null, {}, [], [8, 9], true, false]) {
            assert.doesNotThrow(() => parsePlayersCount(value));
            assert.ok(Number.isNaN(parsePlayersCount(value)), String(value));
        }
        assert.equal(parsePlayersCount(12), 12, 'a number is read as its digits');
    });
});

describe('isValidPlayersCount', () => {
    it('accepts every whole number from the minimum to the maximum of RULES, and only those', () => {
        assert.deepEqual([RULES.players.min, RULES.players.max], [3, 20]);
        for (let n = RULES.players.min; n <= RULES.players.max; n++) assert.equal(isValidPlayersCount(n), true, String(n));
        for (const n of [-1, 0, 1, 2, 21, 22, 100, 1e9]) assert.equal(isValidPlayersCount(n), false, String(n));
    });

    it('rejects NaN, infinity, fractions and anything that is not a number', () => {
        for (const value of [NaN, Infinity, -Infinity, 4.5, 3.0000001, '8', null, undefined, {}, [], true]) {
            assert.equal(isValidPlayersCount(value), false, String(value));
        }
    });

    it('rejects a huge digit string that parses to infinity', () => {
        assert.equal(isValidPlayersCount(parsePlayersCount('9'.repeat(400))), false);
    });
});

describe('validateAndSaveSettings', () => {
    it('starts from the default count', () => {
        assert.equal(gameState.settings.playersCount, DEFAULT_PLAYERS_COUNT);
    });

    it('saves every legal count, writes it back in plain digits and shows no message', () => {
        for (let n = RULES.players.min; n <= RULES.players.max; n++) {
            field().value = String(n);
            assert.equal(validateAndSaveSettings(), true, String(n));
            assert.equal(gameState.settings.playersCount, n);
            assert.equal(field().value, String(n));
        }
        assert.deepEqual(env.toasts(), []);
        assert.equal(field().getAttribute('aria-invalid'), null);
        assert.equal(FakeElement.lastFocused, null, 'a good value does not pull the focus');
    });

    it('reads Persian digits, spaces and direction marks, and writes the plain number back', () => {
        field().value = ' ‏۱۲ ';
        assert.equal(validateAndSaveSettings(), true);
        assert.equal(gameState.settings.playersCount, 12);
        assert.equal(field().value, '12');
    });

    it('refuses a count outside 3 to 20 and anything that is not a number, and keeps the count that was saved', () => {
        field().value = '6';
        assert.equal(validateAndSaveSettings(), true);
        for (const text of ['2', '21', '0', '-4', '100', '', '  ', 'abc', '4.5', '8 players', '1e1']) {
            field().value = text;
            assert.equal(validateAndSaveSettings(), false, JSON.stringify(text));
            assert.equal(gameState.settings.playersCount, 6, `${JSON.stringify(text)} must not change the saved count`);
            assert.equal(field().value, text, 'the typed text stays, so the person can correct it');
        }
    });

    it('says what is wrong in the active language, with the limits of RULES in that language\'s digits', () => {
        field().value = '2';
        validateAndSaveSettings();
        assert.deepEqual(env.toasts(), ['تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!']);

        env.reset();
        env.installTimers();
        env.el('toast-container');
        setLang('en');
        field().value = '21';
        validateAndSaveSettings();
        assert.deepEqual(env.toasts(), ['You need 3 to 20 players!']);
        assert.equal(env.toasts()[0], t('setup.error.players', { min: '3', max: '20' }));
    });

    it('points at the field: it is marked invalid, pulsed and focused, and the mark goes away by itself', () => {
        field().value = 'abc';
        validateAndSaveSettings();
        assert.equal(field().getAttribute('aria-invalid'), 'true');
        assert.ok(field().classList.contains('field-error-pulse'));
        assert.equal(FakeElement.lastFocused, field());

        env.clock.tick(1299);
        assert.equal(field().getAttribute('aria-invalid'), 'true', 'still marked just before the end of the pulse');
        env.clock.tick(2);
        assert.equal(field().getAttribute('aria-invalid'), null);
        assert.equal(field().classList.contains('field-error-pulse'), false);
    });

    it('a second bad value restarts the pulse and shows a second toast; a good one afterwards fixes everything', () => {
        field().value = '1';
        validateAndSaveSettings();
        env.clock.tick(600);
        field().value = '99';
        validateAndSaveSettings();
        assert.equal(env.toasts().length, 2);
        env.clock.tick(700);
        assert.equal(field().getAttribute('aria-invalid'), 'true', 'the first timer was replaced, so the second pulse is still running');

        field().value = '10';
        assert.equal(validateAndSaveSettings(), true);
        assert.equal(gameState.settings.playersCount, 10);
    });

    it('touches nothing else: not the phase, not the players, not the storage', () => {
        gameState.phase = 'setup';
        field().value = '9';
        validateAndSaveSettings();
        field().value = 'x';
        validateAndSaveSettings();
        assert.equal(gameState.phase, 'setup');
        assert.deepEqual(gameState.players, []);
        assert.equal(env.storage.size, 0);
    });
});

describe('updateSetupLimitHints', () => {
    it('writes the limits of RULES under the field, in the active language and its digits', () => {
        updateSetupLimitHints();
        assert.equal(hint(), 'بین ۳ تا ۲۰ نفر');
        setLang('en');
        updateSetupLimitHints();
        assert.equal(hint(), '3 to 20 players');
        setLang('fa');
        updateSetupLimitHints();
        assert.equal(hint(), 'بین ۳ تا ۲۰ نفر');
    });

    it('does nothing (and does not throw) when the page has no hint element', () => {
        env.reset();
        assert.doesNotThrow(() => updateSetupLimitHints());
    });
});
