/**
 * core/state.js and core/storage.js, and the one rule about keys: localStorage is shared by every app of the same
 * origin (the owner hosts several, one per path), so every key this app writes starts with `mafia_` and the app
 * never reads or writes the key of another one (Spyfall's `spy_...` keys in particular).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLAYERS_COUNT } from '../../js/core/config.js';
import { SAVE_VERSION, gameState, replaceGameState, session } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { newGame } from './helpers/gameKit.mjs';
import { resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { SAVE_KEY, clearSavedGame, persist, readSavedState } = await import('../../js/core/storage.js');
const { LANG_STORAGE_KEY } = await import('../../js/i18n/index.js');
const { INSTALL_HINT_DISMISSED_KEY } = await import('../../js/platform/installHint.js');
const { THEME_STORAGE_KEY } = await import('../../js/ui/theme.js');

useGameHarness(env);
after(() => env.uninstall());

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('the state at start-up', () => {
    it('is the welcome screen, the default players count, no game, and the first player of the reveal', () => {
        assert.equal(gameState.version, SAVE_VERSION);
        assert.equal(gameState.stateVersion, 1);
        assert.equal(gameState.phase, 'welcome');
        assert.deepEqual(gameState.settings, { playersCount: DEFAULT_PLAYERS_COUNT });
        assert.equal(gameState.game, null);
        assert.deepEqual(gameState.reveal, { index: 0 });
    });

    it('SAVE_VERSION is a positive whole number, and 3A raised it past the version of the shell (a record of any other version is ignored)', () => {
        assert.ok(Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 2);
    });

    it('the session holds only what must not outlive the page: the confirm callback and the two "secret is showing" flags, all off', () => {
        assert.deepEqual(session, { pendingConfirmAction: null, revealCardOpen: false, rolesShown: false });
    });

    it('resetSingletons puts a changed state back, and gives fresh copies (no test can leak into the next)', () => {
        gameState.phase = 'setup';
        gameState.settings.playersCount = 3;
        gameState.game = newGame(3);
        gameState.reveal.index = 2;
        session.pendingConfirmAction = () => {};
        session.revealCardOpen = true;
        session.rolesShown = true;
        resetSingletons();
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.settings.playersCount, DEFAULT_PLAYERS_COUNT);
        assert.equal(gameState.game, null);
        assert.deepEqual(gameState.reveal, { index: 0 });
        assert.deepEqual(session, { pendingConfirmAction: null, revealCardOpen: false, rolesShown: false });
    });
});

describe('replaceGameState', () => {
    it('swaps the contents but keeps the object, so every module that imported gameState sees the new game', () => {
        const same = gameState;
        const game = newGame(4);
        replaceGameState({ version: SAVE_VERSION, stateVersion: 1, phase: 'reveal', settings: { playersCount: 4 }, game, reveal: { index: 1 } });
        assert.equal(gameState, same);
        assert.equal(gameState.phase, 'reveal');
        assert.equal(gameState.game, game);
        assert.deepEqual(gameState.reveal, { index: 1 });
    });

    it('leaves no key of the old game behind', () => {
        gameState.leftover = true;
        replaceGameState({ version: 1, phase: 'welcome' });
        assert.deepEqual(Object.keys(gameState).sort(), ['phase', 'version']);
    });
});

describe('persist', () => {
    it('saves nothing while there is no game: the welcome screen and the setup form hold nothing worth keeping', () => {
        for (const phase of ['welcome', 'setup', 'reveal', 'moderator']) {
            gameState.phase = phase;
            gameState.game = null;
            persist();
        }
        assert.equal(env.storage.size, 0);
    });

    it('does not replace a saved game with nothing: a visit without a game leaves the earlier save as it was', () => {
        gameState.game = newGame(3);
        gameState.phase = 'reveal';
        persist();
        const before = env.storage.get(SAVE_KEY);
        gameState.game = null;
        gameState.phase = 'setup';
        persist();
        assert.equal(env.storage.get(SAVE_KEY), before);
    });

    it('saves a game as the versioned record { version, state } under mafia_full_state_master, and nothing else', () => {
        gameState.game = newGame(4);
        gameState.phase = 'reveal';
        gameState.reveal.index = 2;
        persist();
        assert.deepEqual([...env.storage.keys()], ['mafia_full_state_master']);
        const record = JSON.parse(env.storage.get(SAVE_KEY));
        assert.deepEqual(Object.keys(record).sort(), ['state', 'version']);
        assert.equal(record.version, SAVE_VERSION);
        assert.deepEqual(record.state, JSON.parse(JSON.stringify(gameState)));
        assert.deepEqual(record.state.reveal, { index: 2 });
        assert.equal(record.state.phase, 'reveal');
    });

    it('saves the state as it is now: a second call replaces the record', () => {
        gameState.game = newGame(3);
        persist();
        gameState.game = newGame(5);
        gameState.reveal.index = 4;
        persist();
        const saved = JSON.parse(env.storage.get(SAVE_KEY)).state;
        assert.equal(saved.game.setup.players.length, 5);
        assert.equal(saved.reveal.index, 4);
        assert.equal(env.storage.size, 1);
    });

    it('does not save the session (the confirm callback and the "secret is showing" flags are not data)', () => {
        gameState.game = newGame(3);
        session.pendingConfirmAction = () => {};
        session.revealCardOpen = true;
        session.rolesShown = true;
        persist();
        const text = env.storage.get(SAVE_KEY);
        for (const name of ['pendingConfirmAction', 'revealCardOpen', 'rolesShown']) assert.ok(!text.includes(name), name);
    });

    it('never throws when the storage refuses (private mode, a full quota): it warns and carries on', () => {
        gameState.game = newGame(3);
        const realSetItem = localStorage.setItem;
        const realWarn = console.warn;
        const warnings = [];
        console.warn = (...args) => warnings.push(args);
        localStorage.setItem = () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
        try {
            assert.doesNotThrow(() => persist());
        } finally {
            localStorage.setItem = realSetItem;
            console.warn = realWarn;
        }
        assert.equal(warnings.length, 1);
        assert.match(String(warnings[0][0]), /Storage write restricted/);
        assert.equal(env.storage.size, 0);
    });

    it('never throws when the state cannot be turned into text either (a circular reference)', () => {
        gameState.game = newGame(3);
        gameState.self = gameState;
        const realWarn = console.warn;
        console.warn = () => {};
        try {
            assert.doesNotThrow(() => persist());
        } finally {
            console.warn = realWarn;
        }
        assert.equal(env.storage.size, 0);
    });
});

describe('readSavedState and clearSavedGame', () => {
    const put = (value) => env.storage.set(SAVE_KEY, typeof value === 'string' ? value : JSON.stringify(value));

    it('gives back the state of a record of this version, exactly as stored', () => {
        gameState.game = newGame(3);
        persist();
        assert.deepEqual(readSavedState(), JSON.parse(JSON.stringify(gameState)));
    });

    it('is null with nothing saved, with an empty value and with text that is not JSON', () => {
        assert.equal(readSavedState(), null);
        for (const text of ['', 'not json', '{', 'undefined']) {
            put(text);
            assert.equal(readSavedState(), null, JSON.stringify(text));
        }
    });

    it('is null for a record of another version, or one that is not { version, state }', () => {
        for (const record of [
            { version: SAVE_VERSION - 1, state: { phase: 'reveal' } },
            { version: SAVE_VERSION + 1, state: { phase: 'reveal' } },
            { state: { phase: 'reveal' } },
            { version: SAVE_VERSION },
            { version: SAVE_VERSION, state: null },
            { version: SAVE_VERSION, state: 'text' },
            { version: SAVE_VERSION, state: [] },
            [],
            null,
            7,
            'text'
        ]) {
            put(record);
            assert.equal(readSavedState(), null, JSON.stringify(record));
        }
    });

    it('is null, and does not throw, when the storage refuses to be read', () => {
        const realGetItem = localStorage.getItem;
        localStorage.getItem = () => {
            throw new DOMException('denied', 'SecurityError');
        };
        try {
            assert.doesNotThrow(() => readSavedState());
            assert.equal(readSavedState(), null);
        } finally {
            localStorage.getItem = realGetItem;
        }
    });

    it('clearSavedGame removes the record and nothing else, and does not throw when the storage refuses', () => {
        env.storage.set('mafia_lang', 'en');
        put({ version: SAVE_VERSION, state: {} });
        clearSavedGame();
        assert.deepEqual([...env.storage.keys()], ['mafia_lang']);
        const realRemoveItem = localStorage.removeItem;
        localStorage.removeItem = () => {
            throw new DOMException('denied', 'SecurityError');
        };
        try {
            assert.doesNotThrow(() => clearSavedGame());
        } finally {
            localStorage.removeItem = realRemoveItem;
        }
    });
});

describe('every key of this app belongs to this app', () => {
    const KEYS = { SAVE_KEY, LANG_STORAGE_KEY, THEME_STORAGE_KEY, INSTALL_HINT_DISMISSED_KEY };

    it('the four keys start with mafia_, and are four different keys', () => {
        for (const [name, key] of Object.entries(KEYS)) assert.match(key, /^mafia_[a-z_]+$/, name);
        assert.equal(new Set(Object.values(KEYS)).size, 4);
    });

    it('the exact names are the documented ones', () => {
        assert.deepEqual(KEYS, {
            SAVE_KEY: 'mafia_full_state_master',
            LANG_STORAGE_KEY: 'mafia_lang',
            THEME_STORAGE_KEY: 'mafia_selected_theme',
            INSTALL_HINT_DISMISSED_KEY: 'mafia_install_hint_dismissed'
        });
    });

    function listJs(dir) {
        return readdirSync(dir).flatMap((name) => {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) return listJs(full);
            return full.endsWith('.js') ? [full] : [];
        });
    }

    it('no script writes a localStorage key written in the style of another app (a quoted name ending in a key suffix must start with mafia_)', () => {
        const suffix = /['"`]([A-Za-z0-9_]*(?:_lang|_selected_theme|_install_hint_dismissed|_full_state_master))['"`]/g;
        const files = listJs(join(ROOT, 'js'));
        let seen = 0;
        for (const file of files) {
            for (const m of readFileSync(file, 'utf8').matchAll(suffix)) {
                seen++;
                assert.ok(m[1].startsWith('mafia_'), `${file.slice(ROOT.length)} uses the key ${m[1]}`);
            }
        }
        assert.ok(seen >= 4, `the scan found only ${seen} keys`);
    });

    it('every literal key given to localStorage in js/ is one of the four', () => {
        const call = /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g;
        for (const file of listJs(join(ROOT, 'js'))) {
            for (const m of readFileSync(file, 'utf8').matchAll(call)) assert.ok(Object.values(KEYS).includes(m[1]), `${file.slice(ROOT.length)}: ${m[1]}`);
        }
    });

    it('nothing of Spyfall is left in what ships: no spy_ key, no cache called spyfall-, no Spyfall in the page, manifest, styles, scripts or worker code', () => {
        const stripBlockComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
        const shipped = [
            ['index.html', readFileSync(join(ROOT, 'index.html'), 'utf8')],
            ['manifest.json', readFileSync(join(ROOT, 'manifest.json'), 'utf8')],
            ['css/style.css', readFileSync(join(ROOT, 'css/style.css'), 'utf8')],
            // The worker's header comment names its sibling app's cache on purpose, to explain why it never touches it.
            ['sw.js (code)', stripBlockComments(readFileSync(join(ROOT, 'sw.js'), 'utf8'))],
            ...listJs(join(ROOT, 'js')).map((file) => [file.slice(ROOT.length), readFileSync(file, 'utf8')])
        ];
        for (const [name, text] of shipped) assert.doesNotMatch(text, /spy_|spyfall|اسپای/i, name);
    });

    it('the worker only manages caches that start with this app\'s own prefix', () => {
        const worker = readFileSync(join(ROOT, 'sw.js'), 'utf8');
        assert.match(worker, /const CACHE_PREFIX = 'mafia-';/);
        assert.match(worker, /startsWith\(CACHE_PREFIX\)/);
    });
});
