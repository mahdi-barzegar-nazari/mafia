/**
 * ui/savedGame.js and ui/resume.js: the saved game, checked. Nothing in storage is trusted: the game must replay
 * through the engine, the phase must be one a game can be resumed in, the reveal index must be a real player, and
 * anything else is "no save". The save-and-restore round trip is through the real `persist`.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { SAVE_VERSION, gameState } from '../../js/core/state.js';
import { eight, eightGodfather, newGame } from './helpers/gameKit.mjs';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { SAVE_KEY, persist } = await import('../../js/core/storage.js');
const saved = await import('../../js/ui/savedGame.js');
const { syncResumeButton } = await import('../../js/ui/resume.js');

useGameHarness(env);
after(() => env.uninstall());

/** Write a record the way `persist` would, with `state` changed by `change`. */
function store(game, { phase = 'reveal', index = 0, version = SAVE_VERSION, change } = {}) {
    const state = { version: SAVE_VERSION, stateVersion: 1, phase, settings: { playersCount: 8 }, players: [], game, reveal: { index } };
    if (change) change(state);
    env.storage.set(SAVE_KEY, JSON.stringify({ version, state }));
}

describe('loadSavedGame: a good save', () => {
    it('is null when nothing was ever saved', () => {
        assert.equal(saved.loadSavedGame(), null);
        assert.equal(saved.hasSavedGame(), false);
    });

    it('gives back the game, the phase and the reveal index of a game saved in the reveal phase', () => {
        const game = eight();
        store(game, { phase: 'reveal', index: 5 });
        assert.deepEqual(saved.loadSavedGame(), { phase: 'reveal', game, revealIndex: 5 });
        assert.equal(saved.hasSavedGame(), true);
    });

    it('a game saved on the moderator screen comes back there, with no reveal index to speak of', () => {
        const game = eightGodfather();
        store(game, { phase: 'moderator', index: 6 });
        const loaded = saved.loadSavedGame();
        assert.equal(loaded.phase, 'moderator');
        assert.deepEqual(loaded.game, game);
        assert.equal(loaded.revealIndex, 0);
    });

    it('is exactly what persist() wrote: the real round trip, whatever the size of the game', () => {
        for (const count of [3, 8, 20]) {
            gameState.game = newGame(count);
            gameState.phase = 'reveal';
            gameState.reveal.index = count - 1;
            persist();
            assert.deepEqual(saved.loadSavedGame(), { phase: 'reveal', game: gameState.game, revealIndex: count - 1 }, `${count} players`);
        }
    });

    it('the phases a game can come back to are the reveal and the moderator screens', () => {
        assert.deepEqual([...saved.RESUMABLE_PHASES], ['reveal', 'moderator']);
    });
});

describe('loadSavedGame: a save that is not usable is no save', () => {
    it('a phase that holds no game, or no phase at all', () => {
        for (const phase of ['welcome', 'setup', 'night', '', null, 7, ['reveal'], 'constructor']) {
            store(eight(), { phase });
            assert.equal(saved.loadSavedGame(), null, String(phase));
        }
        store(eight(), { change: (state) => delete state.phase });
        assert.equal(saved.loadSavedGame(), null, 'no phase at all');
    });

    it('no game, or something that is not a game', () => {
        for (const game of [null, undefined, 'text', 7, [], {}, { version: 1 }, { version: 1, setup: {}, actions: [] }]) {
            store(game);
            assert.equal(saved.loadSavedGame(), null, JSON.stringify(game));
        }
    });

    it('a game that was tampered with: a changed role, a repeated name, a removed player, a wrong version, an extra key, a made-up action', () => {
        const tamper = (edit) => {
            const game = JSON.parse(JSON.stringify(eight()));
            edit(game);
            return game;
        };
        for (const [label, game] of [
            ['a role that is not in the deal', tamper((g) => (g.setup.players[0].role = 'wizard'))],
            ['two mafia turned citizens', tamper((g) => (g.setup.players[0].role = g.setup.players[1].role = 'citizen'))],
            ['a repeated name', tamper((g) => (g.setup.players[1].name = g.setup.players[0].name))],
            ['the first player removed', tamper((g) => g.setup.players.shift())],
            ['a wrong game version', tamper((g) => (g.version = 99))],
            ['an extra key', tamper((g) => (g.extra = true))],
            ['a made-up action', tamper((g) => g.actions.push({ type: 'MAFIA_KILL', target: 'p99' }))],
            ['rules that are not rules', tamper((g) => (g.setup.rules.godfather = 'yes'))]
        ]) {
            store(game);
            assert.equal(saved.loadSavedGame(), null, label);
        }
    });

    it('a wrong record version, damaged JSON, a value that is not a record', () => {
        store(eight(), { version: SAVE_VERSION - 1 });
        assert.equal(saved.loadSavedGame(), null, 'an older version');
        store(eight(), { version: SAVE_VERSION + 1 });
        assert.equal(saved.loadSavedGame(), null, 'a newer version');
        for (const text of ['{', 'not json', '', 'null', '[]', '"text"', '7']) {
            env.storage.set(SAVE_KEY, text);
            assert.equal(saved.loadSavedGame(), null, JSON.stringify(text));
        }
    });

    it('a storage that throws is no save either (it is read at start-up, so it must not crash it)', () => {
        store(eight());
        const real = localStorage.getItem;
        localStorage.getItem = () => {
            throw new DOMException('denied', 'SecurityError');
        };
        try {
            assert.doesNotThrow(() => saved.loadSavedGame());
            assert.equal(saved.loadSavedGame(), null);
            assert.equal(saved.hasSavedGame(), false);
        } finally {
            localStorage.getItem = real;
        }
    });
});

describe('loadSavedGame: a damaged reveal index', () => {
    it('is brought back to the first player, so nobody is skipped', () => {
        for (const index of [-1, 8, 9, 1.5, '3', null, undefined, NaN, {}, []]) {
            store(eight(), { phase: 'reveal', index: index === undefined ? 0 : index });
            assert.equal(saved.loadSavedGame().revealIndex, 0, String(index));
        }
    });

    it('a record with no reveal part, or a reveal that is not an object, also starts from the first player', () => {
        for (const reveal of [undefined, null, 'text', 7, [], {}]) {
            store(eight(), { change: (state) => (state.reveal = reveal) });
            const loaded = saved.loadSavedGame();
            assert.ok(loaded, String(reveal));
            assert.equal(loaded.revealIndex, 0, String(reveal));
        }
    });
});

describe('syncResumeButton', () => {
    it('shows the button only while a game that can be resumed is saved', () => {
        const button = env.el('btn-resume-game');
        button.classList.add('hidden');
        syncResumeButton();
        assert.equal(button.classList.contains('hidden'), true, 'no save: hidden');
        store(eight());
        syncResumeButton();
        assert.equal(button.classList.contains('hidden'), false, 'a save: shown');
        env.storage.set(SAVE_KEY, '{');
        syncResumeButton();
        assert.equal(button.classList.contains('hidden'), true, 'a damaged save: hidden again');
        store(eight(), { phase: 'setup' });
        syncResumeButton();
        assert.equal(button.classList.contains('hidden'), true, 'a save with no resumable phase: hidden');
    });

    it('does not fail on a page without the button', () => {
        assert.doesNotThrow(() => syncResumeButton());
    });
});
