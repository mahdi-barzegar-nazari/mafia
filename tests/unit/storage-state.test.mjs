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
import { makePlayers, resetSingletons, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { SAVE_KEY, persist } = await import('../../js/core/storage.js');
const { LANG_STORAGE_KEY } = await import('../../js/i18n/index.js');
const { INSTALL_HINT_DISMISSED_KEY } = await import('../../js/platform/installHint.js');
const { THEME_STORAGE_KEY } = await import('../../js/ui/theme.js');

useGameHarness(env);
after(() => env.uninstall());

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('the state at start-up', () => {
    it('is the welcome screen, the default players count, nobody at the table', () => {
        assert.equal(gameState.version, SAVE_VERSION);
        assert.equal(gameState.stateVersion, 1);
        assert.equal(gameState.phase, 'welcome');
        assert.deepEqual(gameState.settings, { playersCount: DEFAULT_PLAYERS_COUNT });
        assert.deepEqual(gameState.players, []);
    });

    it('SAVE_VERSION is a positive whole number (a reader ignores a record of any other version)', () => {
        assert.ok(Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 1);
    });

    it('the session holds only what must not outlive the page: the callback of the confirm modal', () => {
        assert.deepEqual(session, { pendingConfirmAction: null });
    });

    it('resetSingletons puts a changed state back, and gives fresh copies (no test can leak into the next)', () => {
        gameState.phase = 'setup';
        gameState.settings.playersCount = 3;
        gameState.players.push({ id: 'x' });
        session.pendingConfirmAction = () => {};
        resetSingletons();
        assert.equal(gameState.phase, 'welcome');
        assert.equal(gameState.settings.playersCount, DEFAULT_PLAYERS_COUNT);
        assert.deepEqual(gameState.players, []);
        assert.equal(session.pendingConfirmAction, null);
    });
});

describe('replaceGameState', () => {
    it('swaps the contents but keeps the object, so every module that imported gameState sees the new game', () => {
        const same = gameState;
        replaceGameState({ version: 1, stateVersion: 1, phase: 'setup', settings: { playersCount: 5 }, players: makePlayers(2) });
        assert.equal(gameState, same);
        assert.equal(gameState.phase, 'setup');
        assert.equal(gameState.players.length, 2);
    });

    it('leaves no key of the old game behind', () => {
        gameState.leftover = true;
        replaceGameState({ version: 1, phase: 'welcome' });
        assert.deepEqual(Object.keys(gameState).sort(), ['phase', 'version']);
    });
});

describe('persist', () => {
    it('saves nothing while there is no match: the welcome screen and the setup form hold nothing worth keeping', () => {
        for (const phase of ['welcome', 'setup']) {
            gameState.phase = phase;
            persist();
        }
        assert.equal(env.storage.size, 0);
    });

    it('saves a match as the versioned record { version, state } under mafia_full_state_master, and nothing else', () => {
        gameState.players = makePlayers(4);
        gameState.settings.playersCount = 4;
        persist();
        assert.deepEqual([...env.storage.keys()], ['mafia_full_state_master']);
        const record = JSON.parse(env.storage.get(SAVE_KEY));
        assert.deepEqual(Object.keys(record).sort(), ['state', 'version']);
        assert.equal(record.version, SAVE_VERSION);
        assert.deepEqual(record.state, JSON.parse(JSON.stringify(gameState)));
    });

    it('saves the state as it is now: a second call replaces the record', () => {
        gameState.players = makePlayers(3);
        persist();
        gameState.players = makePlayers(5);
        persist();
        assert.equal(JSON.parse(env.storage.get(SAVE_KEY)).state.players.length, 5);
        assert.equal(env.storage.size, 1);
    });

    it('does not save the session (the confirm callback is not data)', () => {
        gameState.players = makePlayers(3);
        session.pendingConfirmAction = () => {};
        persist();
        assert.ok(!env.storage.get(SAVE_KEY).includes('pendingConfirmAction'));
    });

    it('never throws when the storage refuses (private mode, a full quota): it warns and carries on', () => {
        gameState.players = makePlayers(3);
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
        gameState.players = makePlayers(3);
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
