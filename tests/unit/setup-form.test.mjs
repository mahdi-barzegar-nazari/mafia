/**
 * The setup form on a fake page (ui/setup.js): one name field per player and how the fields follow the count, the
 * 24-character cap, the godfather switch (disabled and switched off below 6 players), the reset to defaults, and
 * `prepareDeal`, which asks the rules engine for a game or points at the input that is wrong with a catalog text.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { DEFAULT_PLAYERS_COUNT } from '../../js/core/config.js';
import { gameState } from '../../js/core/state.js';
import { ERRORS } from '../../js/game/constants.js';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
// The name fields are made by the code under test, so the fake page has to find them by id like a browser does.
const getById = document.getElementById;
document.getElementById = (id) => getById(id) || (env.el('setup-names').children.find((child) => child.id === id) ?? null);
const form = await import('../../js/ui/setup.js');
const { DEFAULT_LANG, setLang } = await import('../../js/i18n/index.js');

useGameHarness(env, {
    setup: () => {
        env.el('toast-container');
        env.el('setup-players-count').value = String(DEFAULT_PLAYERS_COUNT);
        env.el('players-limit-hint');
        env.el('names-limit-hint');
        env.el('godfather-hint');
        env.el('setup-names');
        env.el('setup-doctor-save').value = 'once';
        env.el('setup-godfather').checked = false;
        env.el('setup-reveal-death').checked = true;
        form.resetSetupForm();
    }
});
after(() => env.uninstall());
afterEach(() => setLang(DEFAULT_LANG));

const inputs = () => env.el('setup-names').children;
const names = () => form.readNames();
const countField = () => env.el('setup-players-count');
const godfatherBox = () => env.el('setup-godfather');
const type = (count) => {
    countField().value = String(count);
    return form.applyPlayersCountChange();
};
const CODE_SHAPE = /\b[A-Z]{2,}(?:_[A-Z]+)+\b/;

describe('the name fields', () => {
    it('start as one field per player, each with its default name, a placeholder and an accessible name', () => {
        assert.equal(inputs().length, DEFAULT_PLAYERS_COUNT);
        assert.deepEqual(names().slice(0, 3), ['بازیکن ۱', 'بازیکن ۲', 'بازیکن ۳']);
        inputs().forEach((input, i) => {
            assert.equal(input.id, `setup-name-${i + 1}`);
            assert.equal(input.type, 'text');
            assert.ok(input.classList.contains('name-input'), 'the class that isolates the direction of a name');
            assert.equal(input.getAttribute('placeholder'), `نام بازیکن ${'۱۲۳۴۵۶۷۸'[i]}`);
            assert.equal(input.getAttribute('aria-label'), `نام بازیکن شماره‌ی ${'۱۲۳۴۵۶۷۸'[i]}`);
            assert.equal(input.getAttribute('autocomplete'), 'off');
        });
    });

    it('in English the defaults, placeholders and accessible names are English too', () => {
        setLang('en');
        form.resetSetupForm();
        assert.deepEqual(names().slice(0, 2), ['Player 1', 'Player 2']);
        assert.equal(inputs()[0].getAttribute('placeholder'), 'Player 1 name');
        assert.equal(inputs()[0].getAttribute('aria-label'), 'Name of player number 1');
    });

    it('follow the count: more players add fields at the end, fewer remove them from the end, typed names stay', () => {
        inputs()[0].value = 'Ali';
        inputs()[7].value = 'Roya';
        assert.equal(type(11), true);
        assert.equal(inputs().length, 11);
        assert.deepEqual([names()[0], names()[7], names()[8], names()[10]], ['Ali', 'Roya', 'بازیکن ۹', 'بازیکن ۱۱']);
        assert.equal(type(5), true);
        assert.equal(inputs().length, 5);
        assert.deepEqual(names(), ['Ali', 'بازیکن ۲', 'بازیکن ۳', 'بازیکن ۴', 'بازیکن ۵']);
        assert.equal(type(8), true);
        assert.equal(names()[7], 'بازیکن ۸', 'a slot that was removed and added again starts from its default');
    });

    it('keep the same field objects while the count changes (the caret and the focus of a field are not lost)', () => {
        const first = inputs()[0];
        type(12);
        type(4);
        assert.equal(inputs()[0], first);
    });

    it('a count outside 3 to 20, or text that is not a number, tells the person and changes no field', () => {
        const before = [...inputs()];
        for (const typed of ['2', '21', '0', '-4', '5.5', 'abc', '', '8 players']) {
            countField().value = typed;
            assert.equal(form.applyPlayersCountChange(), false, typed);
            assert.deepEqual(inputs(), before, typed);
            assert.equal(gameState.settings.playersCount, DEFAULT_PLAYERS_COUNT, typed);
        }
        assert.equal(env.toasts().length, 3, 'the toast area keeps the last three');
    });

    it('accept Persian digits in the count and rebuild for them', () => {
        assert.equal(type('۱۲'), true);
        assert.equal(inputs().length, 12);
        assert.equal(countField().value, '12');
    });

    it('syncNameInputs alone ignores a count that is not a legal one', () => {
        for (const count of [0, 2, 21, NaN, undefined, '8', 8.5]) {
            form.syncNameInputs(count);
            assert.equal(inputs().length, DEFAULT_PLAYERS_COUNT, String(count));
        }
    });

    it('cut a name that gets longer than 24 characters (typed or pasted), and never in the middle of an emoji', () => {
        const input = inputs()[1];
        for (const [typed, expected] of [['x'.repeat(30), 'x'.repeat(24)], ['😀'.repeat(26), '😀'.repeat(24)], ['Sara', 'Sara']]) {
            input.value = typed;
            input.listeners.input.forEach((fn) => fn());
            assert.equal(input.value, expected);
        }
    });

    it('a language change turns default names into the new language\'s and leaves typed names, placeholders follow', () => {
        inputs()[2].value = 'Sara';
        setLang('en');
        form.relocalizeNameInputs();
        assert.deepEqual(names().slice(0, 4), ['Player 1', 'Player 2', 'Sara', 'Player 4']);
        assert.equal(inputs()[3].getAttribute('placeholder'), 'Player 4 name');
        setLang('fa');
        form.relocalizeNameInputs();
        assert.deepEqual(names().slice(0, 4), ['بازیکن ۱', 'بازیکن ۲', 'Sara', 'بازیکن ۴']);
    });

    it('readNames gives what the fields hold, untrimmed (the engine trims)', () => {
        inputs()[0].value = '  Ali  ';
        assert.equal(names()[0], '  Ali  ');
    });
});

describe('the godfather switch', () => {
    it('is enabled from 6 players and disabled below, with a hint that says how many are needed', () => {
        for (const count of [3, 4, 5]) {
            type(count);
            assert.equal(godfatherBox().disabled, true, `${count} players`);
            assert.match(env.el('godfather-hint').textContent, /۶/, `${count} players`);
        }
        for (const count of [6, 7, 20]) {
            type(count);
            assert.equal(godfatherBox().disabled, false, `${count} players`);
            assert.equal(env.el('godfather-hint').textContent, '', `${count} players`);
        }
    });

    it('is switched off by itself when the count drops below 6, and stays off when it comes back up', () => {
        type(8);
        godfatherBox().checked = true;
        type(7);
        assert.equal(godfatherBox().checked, true, 'still allowed');
        type(5);
        assert.equal(godfatherBox().checked, false);
        assert.equal(godfatherBox().disabled, true);
        type(9);
        assert.equal(godfatherBox().checked, false, 'the person has to switch it on again');
        assert.equal(godfatherBox().disabled, false);
    });

    it('the hint follows the language', () => {
        type(4);
        setLang('en');
        form.updateSetupLimitHints();
        assert.equal(env.el('godfather-hint').textContent, 'The godfather needs at least 6 players.');
    });

    it('a count that was refused does not touch the switch', () => {
        type(8);
        godfatherBox().checked = true;
        countField().value = '2';
        form.applyPlayersCountChange();
        assert.equal(godfatherBox().checked, true);
        assert.equal(godfatherBox().disabled, false);
    });
});

describe('the rules the form shows', () => {
    it('start as the defaults: the doctor may save themselves once, no godfather, the role of the eliminated is revealed', () => {
        assert.deepEqual(form.readRulesFromForm(), { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });
    });

    it('follow the select and the switches, and the godfather only while it is allowed', () => {
        env.el('setup-doctor-save').value = 'never';
        godfatherBox().checked = true;
        env.el('setup-reveal-death').checked = false;
        assert.deepEqual(form.readRulesFromForm(), { doctorSelfSave: 'never', godfather: true, revealRoleOnDeath: false });
        gameState.settings.playersCount = 5;
        assert.equal(form.readRulesFromForm().godfather, false);
    });
});

describe('resetSetupForm: nothing is remembered from the last game', () => {
    it('puts the count, the names and the rules back to their defaults', () => {
        type(12);
        inputs()[0].value = 'Ali';
        env.el('setup-doctor-save').value = 'always';
        godfatherBox().checked = true;
        env.el('setup-reveal-death').checked = false;
        form.resetSetupForm();
        assert.equal(countField().value, String(DEFAULT_PLAYERS_COUNT));
        assert.equal(gameState.settings.playersCount, DEFAULT_PLAYERS_COUNT);
        assert.equal(inputs().length, DEFAULT_PLAYERS_COUNT);
        assert.equal(names()[0], 'بازیکن ۱');
        assert.deepEqual(form.readRulesFromForm(), { doctorSelfSave: 'once', godfather: false, revealRoleOnDeath: true });
    });

    it('writes nothing to storage', () => {
        type(12);
        form.resetSetupForm();
        assert.equal(env.storage.size, 0);
    });
});

describe('prepareDeal: success', () => {
    it('gives a game of the typed names, with the roles of the typed rules, and shows no message', () => {
        type(8);
        ['Ali', 'Sara', 'Reza', 'Nima', 'Mina', 'Omid', 'Kian', 'Roya'].forEach((name, i) => (inputs()[i].value = ` ${name} `));
        godfatherBox().checked = true;
        env.el('setup-doctor-save').value = 'always';
        const game = form.prepareDeal();
        assert.ok(game);
        assert.deepEqual(game.setup.players.map((p) => p.name), ['Ali', 'Sara', 'Reza', 'Nima', 'Mina', 'Omid', 'Kian', 'Roya']);
        assert.equal(game.setup.rules.godfather, true);
        assert.equal(game.setup.rules.doctorSelfSave, 'always');
        assert.deepEqual(env.toasts(), []);
    });

    it('deals the untouched form as it is: default names are distinct, so a fresh form can be dealt at once', () => {
        for (const count of [3, 8, 20]) {
            type(count);
            const game = form.prepareDeal();
            assert.ok(game, `${count} players`);
            assert.equal(game.setup.players.length, count);
        }
    });

    it('a count typed but not yet confirmed by "change" is still read when the button is pressed', () => {
        countField().value = '5';
        const game = form.prepareDeal();
        assert.equal(game.setup.players.length, 5);
        assert.equal(inputs().length, 5);
    });

    it('a switched-on godfather below 6 players is turned off, not refused: the form never asks the engine for it', () => {
        type(8);
        godfatherBox().checked = true;
        countField().value = '5';
        const game = form.prepareDeal();
        assert.equal(game.setup.rules.godfather, false);
        assert.equal(godfatherBox().checked, false);
    });
});

describe('prepareDeal: every refusal shows a text and points at the input at fault', () => {
    const toast = () => env.toasts().at(-1);
    const focused = () => FakeElement.lastFocused && FakeElement.lastFocused.id;

    it('an empty name: its own field is focused and marked, and the text names its number', () => {
        type(5);
        inputs()[2].value = '   ';
        assert.equal(form.prepareDeal(), null);
        assert.equal(focused(), 'setup-name-3');
        assert.equal(inputs()[2].getAttribute('aria-invalid'), 'true');
        assert.equal(toast(), 'نام بازیکن شماره‌ی ۳ را بنویسید!');
    });

    it('a repeated name: the second field of the two is the one at fault', () => {
        type(5);
        inputs()[1].value = 'Sara';
        inputs()[3].value = ' sara ';
        assert.equal(form.prepareDeal(), null);
        assert.equal(focused(), 'setup-name-4');
        assert.match(toast(), /^نام بازیکن شماره‌ی ۴ تکراری است/);
    });

    it('a name over 24 characters (set without typing, as a script or an odd keyboard could): its field, with the length in the text', () => {
        type(5);
        inputs()[4].value = 'x'.repeat(25);
        assert.equal(form.prepareDeal(), null);
        assert.equal(focused(), 'setup-name-5');
        assert.equal(toast(), 'نام بازیکن شماره‌ی ۵ بیشتر از ۲۴ حرف است!');
    });

    it('a bad count: the count field is focused and marked', () => {
        countField().value = '25';
        assert.equal(form.prepareDeal(), null);
        assert.equal(focused(), 'setup-players-count');
        assert.equal(countField().getAttribute('aria-invalid'), 'true');
        assert.equal(toast(), 'تعداد بازیکنان باید بین ۳ تا ۲۰ نفر باشد!');
    });

    it('in English the texts are English', () => {
        setLang('en');
        form.resetSetupForm();
        inputs()[0].value = '';
        assert.equal(form.prepareDeal(), null);
        assert.equal(toast(), 'Player 1 needs a name!');
        inputs()[0].value = 'Ali';
        inputs()[1].value = 'ali';
        form.prepareDeal();
        assert.equal(toast(), 'Player 2’s name is already taken. Each name can be used only once!');
    });

    it('never shows an error code, whatever the engine answers', () => {
        type(5);
        const problems = [
            () => (inputs()[0].value = ''),
            () => (inputs()[0].value = 'x'.repeat(30)),
            () => (inputs()[0].value = inputs()[1].value),
            () => (countField().value = '99'),
            () => (countField().value = 'abc')
        ];
        for (const cause of problems) {
            form.resetSetupForm();
            type(5);
            cause();
            assert.equal(form.prepareDeal(), null);
            for (const text of env.toasts()) {
                assert.doesNotMatch(text, CODE_SHAPE);
                for (const code of Object.values(ERRORS)) assert.ok(!text.includes(code), `${code} in ${text}`);
            }
        }
    });

    it('does not touch the game, the phase or the storage', () => {
        type(5);
        inputs()[0].value = '';
        form.prepareDeal();
        assert.equal(gameState.game, null);
        assert.equal(gameState.phase, 'welcome');
        assert.equal(env.storage.size, 0);
    });
});

describe('the limit hints', () => {
    it('say how long a name may be, in the language\'s digits', () => {
        form.updateSetupLimitHints();
        assert.equal(env.el('names-limit-hint').textContent, 'حداکثر ۲۴ حرف برای هر نام');
        setLang('en');
        form.updateSetupLimitHints();
        assert.equal(env.el('names-limit-hint').textContent, 'Up to 24 characters per name');
    });
});
