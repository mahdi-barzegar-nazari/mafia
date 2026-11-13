/**
 * ui/revealFlow.js and ui/roleTexts.js: the progress of the reveal phase as pure functions (which player's gate is
 * next, what "hide and pass on" does, what a saved or damaged index means) and the content of a role card.
 */
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { MAFIA_TEAM, ROLE_IDS } from '../../js/data/roles.js';
import { en } from '../../js/i18n/en.js';
import { fa } from '../../js/i18n/fa.js';
import { EIGHT, EIGHT_GODFATHER, eight, eightGodfather, newGame } from './helpers/gameKit.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const flow = await import('../../js/ui/revealFlow.js');
const texts = await import('../../js/ui/roleTexts.js');
const { DEFAULT_LANG, SUPPORTED_LANGS, setLang } = await import('../../js/i18n/index.js');

useGameHarness(env);
after(() => env.uninstall());
afterEach(() => setLang(DEFAULT_LANG));

describe('sanitizeRevealIndex', () => {
    it('keeps a whole number that is a player of the game', () => {
        for (let index = 0; index < 8; index++) assert.equal(flow.sanitizeRevealIndex(index, 8), index);
    });

    it('turns every damaged value into 0 (start the hand-offs again: no player is skipped)', () => {
        for (const value of [-1, 8, 9, 1000, 1.5, NaN, Infinity, -Infinity, '3', '', null, undefined, {}, [], [2], true, 2 ** 53]) {
            assert.equal(flow.sanitizeRevealIndex(value, 8), 0, String(value));
        }
    });

    it('is 0 when the count itself is not a game size', () => {
        for (const count of [0, -3, NaN, undefined, null, '8', 2.5]) assert.equal(flow.sanitizeRevealIndex(1, count), 0, String(count));
    });
});

describe('revealProgress', () => {
    it('numbers the players from 1 for the person and marks only the last one', () => {
        assert.deepEqual(flow.revealProgress(0, 3), { index: 0, number: 1, total: 3, last: false });
        assert.deepEqual(flow.revealProgress(1, 3), { index: 1, number: 2, total: 3, last: false });
        assert.deepEqual(flow.revealProgress(2, 3), { index: 2, number: 3, total: 3, last: true });
    });

    it('a damaged index counts as the first player', () => {
        assert.deepEqual(flow.revealProgress(7, 3), { index: 0, number: 1, total: 3, last: false });
        assert.deepEqual(flow.revealProgress(undefined, 3), { index: 0, number: 1, total: 3, last: false });
    });

    it('a game with no players has no last one', () => {
        assert.deepEqual(flow.revealProgress(0, 0), { index: 0, number: 1, total: 0, last: false });
    });
});

describe('advanceReveal', () => {
    it('walks through every player once, in order, and finishes after the last', () => {
        for (const count of [3, 4, 8, 12, 20]) {
            const seen = [0];
            let step = flow.advanceReveal(0, count);
            while (!step.done) {
                seen.push(step.index);
                step = flow.advanceReveal(step.index, count);
            }
            assert.deepEqual(seen, Array.from({ length: count }, (_, i) => i), `${count} players`);
            assert.deepEqual(step, { done: true, index: 0 }, 'after the last player nothing is left to count');
        }
    });

    it('from a damaged index it moves on from the first player, never past the end', () => {
        assert.deepEqual(flow.advanceReveal(99, 8), { done: false, index: 1 });
        assert.deepEqual(flow.advanceReveal(-4, 8), { done: false, index: 1 });
        assert.deepEqual(flow.advanceReveal(NaN, 3), { done: false, index: 1 });
    });

    it('a game with no players is finished at once', () => {
        assert.deepEqual(flow.advanceReveal(0, 0), { done: true, index: 0 });
    });
});

describe('roleCardFor', () => {
    it('gives each player the name and the role the game dealt', () => {
        const game = eight();
        EIGHT.forEach((role, index) => {
            const card = flow.roleCardFor(game, index);
            assert.equal(card.name, `P${index + 1}`);
            assert.equal(card.role, role);
        });
    });

    it('a mafia player sees the other members of the mafia team, by name, and never the town', () => {
        const game = eight();
        assert.deepEqual(flow.roleCardFor(game, 0).teammates, ['P2']);
        assert.deepEqual(flow.roleCardFor(game, 1).teammates, ['P1']);
    });

    it('with the godfather, the mafia sees the godfather and the godfather sees the mafia', () => {
        const game = eightGodfather();
        EIGHT_GODFATHER.forEach((role, index) => assert.equal(flow.roleCardFor(game, index).role, role));
        assert.deepEqual(flow.roleCardFor(game, 0).teammates, ['P2']);
        assert.deepEqual(flow.roleCardFor(game, 1).teammates, ['P1']);
    });

    it('a mafia player alone on the team has no teammates to list', () => {
        const game = newGame(3, { roles: ['mafia', 'detective', 'citizen'] });
        assert.deepEqual(flow.roleCardFor(game, 0).teammates, []);
    });

    it('the town knows nobody: doctor, detective and citizens get no teammate list', () => {
        const game = eight();
        for (let index = 2; index < 8; index++) assert.deepEqual(flow.roleCardFor(game, index).teammates, [], `P${index + 1}`);
    });

    it('is null for a player that is not in the game and for something that is not a game', () => {
        const game = eight();
        for (const index of [-1, 8, 1.5, NaN, '0', undefined, null]) assert.equal(flow.roleCardFor(game, index), null, String(index));
        for (const bad of [null, undefined, {}, 'text', { version: 1 }]) assert.equal(flow.roleCardFor(bad, 0), null);
    });
});

describe('playerCount and playerNameAt (what the gate may know: no role)', () => {
    it('count and names in the order the game was dealt', () => {
        const game = eight();
        assert.equal(flow.playerCount(game), 8);
        assert.equal(flow.playerNameAt(game, 0), 'P1');
        assert.equal(flow.playerNameAt(game, 7), 'P8');
    });

    it('0 and an empty name for what is not there', () => {
        assert.equal(flow.playerCount(null), 0);
        assert.equal(flow.playerCount({}), 0);
        for (const index of [-1, 8, 0.5, 'x', undefined]) assert.equal(flow.playerNameAt(eight(), index), '');
        assert.equal(flow.playerNameAt(null, 0), '');
    });
});

describe('the texts of the roles', () => {
    it('every role of the game has a name and a description key, and nothing else has', () => {
        assert.deepEqual(Object.keys(texts.ROLE_TEXT_KEYS).sort(), [...ROLE_IDS].sort());
        for (const role of ROLE_IDS) {
            for (const key of Object.values(texts.ROLE_TEXT_KEYS[role])) {
                assert.equal(typeof fa[key], 'string', `fa: ${key}`);
                assert.equal(typeof en[key], 'string', `en: ${key}`);
            }
        }
    });

    it('roleName and roleDoes follow the active language, and the five names differ', () => {
        for (const lang of SUPPORTED_LANGS) {
            setLang(lang);
            const catalog = lang === 'fa' ? fa : en;
            const names = ROLE_IDS.map((role) => texts.roleName(role));
            assert.equal(new Set(names).size, 5, lang);
            ROLE_IDS.forEach((role, i) => {
                assert.equal(names[i], catalog[texts.ROLE_TEXT_KEYS[role].name]);
                assert.equal(texts.roleDoes(role), catalog[texts.ROLE_TEXT_KEYS[role].does]);
                assert.ok(texts.roleDoes(role).length > 20, `${lang}/${role}`);
            });
        }
    });

    it('uses the glossary: the Persian names of the five roles', () => {
        const persian = Object.fromEntries(ROLE_IDS.map((role) => [role, texts.roleName(role)]));
        assert.match(persian.mafia, /مافیا/);
        assert.match(persian.godfather, /پدرخوانده/);
        assert.match(persian.doctor, /دکتر/);
        assert.match(persian.detective, /کارآگاه/);
        assert.match(persian.citizen, /شهروند/);
    });

    it('the godfather\'s description says the detective sees him as innocent, in both languages', () => {
        assert.match(fa['role.godfather.does'], /کارآگاه.*بی‌گناه/);
        assert.match(en['role.godfather.does'], /detective.*innocent/);
    });

    it('a value that is not a role (or an inherited property) gives nothing', () => {
        for (const value of ['', 'wizard', 'constructor', '__proto__', 'toString', undefined, null, 7]) {
            assert.equal(texts.roleName(value), '', String(value));
            assert.equal(texts.roleDoes(value), '', String(value));
        }
    });

    it('the mafia team of the cards is the engine\'s: mafia and godfather', () => {
        assert.deepEqual([...MAFIA_TEAM].sort(), ['godfather', 'mafia']);
    });
});
