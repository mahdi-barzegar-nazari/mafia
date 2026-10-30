import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_PLAYERS_COUNT, RULES, THEME_COLORS, VALID_PHASES } from '../../js/core/config.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('RULES', () => {
    it('allows 3 to 20 players', () => {
        assert.deepEqual(RULES, { players: { min: 3, max: 20 } });
    });
    it('has whole-number limits with min below max', () => {
        for (const [name, range] of Object.entries(RULES)) {
            assert.ok(Number.isInteger(range.min) && Number.isInteger(range.max), name);
            assert.ok(range.min < range.max, name);
        }
    });
});

describe('DEFAULT_PLAYERS_COUNT', () => {
    it('is a legal players count', () => {
        assert.ok(Number.isInteger(DEFAULT_PLAYERS_COUNT));
        assert.ok(DEFAULT_PLAYERS_COUNT >= RULES.players.min && DEFAULT_PLAYERS_COUNT <= RULES.players.max);
    });
});

describe('configuration stays in sync with index.html', () => {
    it('every game phase has a matching screen, and vice versa', () => {
        const screens = [...html.matchAll(/<section id="screen-([a-z]+)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(screens, [...VALID_PHASES].sort());
    });
    it('the phases known so far are the welcome screen and the setup screen, nothing else', () => {
        assert.deepEqual([...VALID_PHASES], ['welcome', 'setup']);
    });
    it('the players-count field starts with the default count', () => {
        assert.match(html, new RegExp(`<input[^>]*id="setup-players-count"[^>]*value="${DEFAULT_PLAYERS_COUNT}"`));
    });
    it('every theme in the selector has colors, and vice versa', () => {
        const select = html.match(/<select id="theme-selector"[\s\S]*?<\/select>/)[0];
        const options = [...select.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(options, Object.keys(THEME_COLORS).sort());
    });
    it('theme colors are valid hex values', () => {
        for (const [theme, color] of Object.entries(THEME_COLORS)) {
            assert.match(String(color), /^#[0-9a-f]{6}$/i, theme);
        }
    });
});
