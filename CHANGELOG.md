# Changelog

## 0.1.0

First version: the app shell of step 1 of 4. It has the infrastructure of the finished Spyfall app and **no game logic**.

### Added

- **The shell.** A welcome screen (the name «مافیا», a one-line tagline, the round play button, the language switch, the theme selector, the credit line, the version line behind a long press on the title, the install hint) and a placeholder setup screen with one field, the number of players (3 to 20, validated against `RULES.players` in `core/config.js`, with a hint under it), and a back button. Nothing starts: the phase machine knows `welcome` and `setup` only.
- **Phase machine and seams** as in Spyfall: `core/dispatch.js` (the port), `core/phase.js` (`setPhase`, `commitState`, `isMatchInProgress`, the renderer and before-phase-change hook), `app/wire.js` (installs them), `app/actions.js` (the action switch: `CHANGE_THEME`, `SET_LANG`, `NAVIGATE`, `SET_PLAYERS_COUNT`, `OPEN_MODAL`, `CLOSE_MODAL`). A new phase is one entry in `VALID_PHASES` and one `<section id="screen-<phase>" class="screen-view">`; every phase except `welcome` and `setup` counts as a game in progress, which locks the language switch, so nothing else changes.
- **Persian and English** with identical catalog keys (`js/i18n/fa.js`, `en.js`), the language switch on the welcome screen, `js/preinit.js` (no wrong-language first paint) and the number, plural, duration and list helpers.
- **8 themes** and the token system, a self-hosted Vazirmatn font, original placeholder icons (192, 512 and maskable 512) that say "MAFIA".
- **Offline-first service worker** with a hash-stamped precache (`mafia-shell-<hash>`), the build line (`v0.1.0 · <hash>`, or `dev`) and its long-press reveal, the install hint for iOS (also inside in-app browsers) and Firefox for Android.
- **Strict Content-Security-Policy** (no inline script, no inline style) and a stylesheet in logical properties.
- **Storage keys of its own**: `mafia_lang`, `mafia_selected_theme`, `mafia_install_hint_dismissed`, `mafia_full_state_master` (written only once a game with players exists, so never in this version). The service worker only touches caches that start with `mafia-`.
- `scripts/build.mjs`, `scripts/serve.mjs`, GitHub Actions (CI, GitHub Pages deployment, Dependabot), ESLint and Prettier configuration, MIT `LICENSE`, `CONTRIBUTING.md`, `docs/architecture.md` (with the list of files shared with Spyfall).
- **Tests.** 534 unit tests (the infrastructure tests of Spyfall, ported, and new ones for the welcome and setup screens, the players-count validation, the phase flow, the bindings, the language round trip, storage keys and state, the theme tokens and the eight themes, the confirm dialog and focus trap) and 199 end-to-end tests in a real Chromium (smoke, offline first load with every module precached, language switch against a recorded Persian baseline of the welcome and setup screens, theme selector and computed colours in all 8 themes and both languages, players-count validation, confirm dialog, first paint, build line and its reveal, install hint).

### Left out on purpose (Spyfall content)

Word banks and packs, side quests, question ideas, spy hints, roles, votes, scoring, the wheel, the scorecard, custom words, the Spyfall "how to play" text, difficulty levels, the setup groups, cover mode, audio, the saved setup, and the per-match language and recovery machinery. Step 2 adds what Mafia needs of them.

### Known

- No `package-lock.json` is included: it could not be generated without network access. Run `npm install` once and commit it before relying on `npm ci` (CI and the deploy workflow use it).
- `tests/e2e/fixtures/persian-baseline.json` was recorded from this project's own first build, because there was no earlier one. It guards the Persian text of the welcome and setup screens from now on; it is not evidence about the past.
