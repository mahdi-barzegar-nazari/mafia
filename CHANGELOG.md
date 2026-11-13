# Changelog

## Unreleased

Step 3A of 4: the setup form, the hand-off of the roles, the moderator's list, and save and resume. The night and day screens (step 3B) are **not** in this version. Step 2's engine (below) is now wired into the app.

### Step 3A of 4: the game screens

#### Added

- **Four phases** (`welcome`, `setup`, `reveal`, `moderator`): `VALID_PHASES`, a `<section>` each in `index.html`, bindings, actions (`DEAL_GAME`, `RESUME_GAME`, `REVEAL_SHOW`, `REVEAL_HIDE`, `CONFIRM_LEAVE_REVEAL`, `CONFIRM_NEW_GAME`, `TOGGLE_ROLES`, `HIDE_SECRETS`) and renderers. `reveal` and `moderator` count as a game in progress, so the language switch is locked there.
- **The setup form.** One name field per player (default «بازیکن N» / "Player N", at most 24 letters, default names follow a language change), the doctor's self-save select (never, once, always; default once), the godfather switch (off by default, disabled with a hint below the player count the engine allows, turns itself off if the count drops), the "announce the role of the eliminated" switch (default on), a short help (i) for each option, "Deal roles" and back. Names and options are not remembered between games. The game is made by `createGame` with a `crypto`-based random; every engine error code is shown as a sentence (catalog key) on the field that caused it, and never as a code.
- **The reveal.** One player at a time: a hand-off gate ("Hand the phone to {name}", "I am {name}"), then the role card (the role, a line on what it does, the other members of the team for the mafia and the godfather, and for the godfather the line that the detective sees him as innocent), then "Hide and pass on". The card is built only after "I am" and **removed from the page** (not hidden) when it is hidden, when the page goes out of sight, and whenever any other screen is drawn. Progress is saved at every hand-off; a reload returns to the next player's gate, never to a card. Focus moves to each step's heading and one polite live line announces the step (never the role).
- **The moderator's screen (temporary).** The players with roles hidden until "Show roles" (hidden again on every open and when the page goes out of sight), the rules in force one line each, and "New game" after a question.
- **Save and resume.** `gameState.game` and `gameState.reveal`; `persist()` writes whenever a game exists. "Resume game" on the welcome screen only when a valid save exists. A save is accepted only if the game replays through `deserializeGame`; a damaged, tampered or other-version save is ignored without a message. Dealing over a save asks first (`confirm.discard.*`).
- **The help dialog** (`#info-modal`, `showInfoModal` in `core/dispatch.js`, `INFO_KEYS` in `core/config.js`), the same pattern as Spyfall's, with Mafia's three option texts.
- **66 new catalog keys** (44 to 110) in `fa.js` and `en.js` (the setup form, `reveal.*`, `role.<id>.name/does`, `moderator.*`, `info.*`, `confirm.discard.*`, `welcome.resume`), with the same keys and placeholders in both languages.
- **New files:** `ui/setupModel.js`, `ui/revealFlow.js`, `ui/roleTexts.js`, `ui/savedGame.js` (pure), `ui/reveal.js`, `ui/moderator.js`, `ui/resume.js`; tests `setup-model`, `setup-form`, `reveal-flow`, `saved-game`, `game-flow` (unit), `game-flow` and `game-screens` (end to end), `tests/e2e/helpers/game.mjs`, and `tests/e2e/take-screenshots.mjs` with its pictures in `tests/e2e/screenshots/` (360x740, Persian and English, the dark default theme; not shipped).
- **Tests.** Unit: 837 to 1000. End to end: 199 to 275 (the whole flow for 3, 8 and 20 players in both languages; every card against the saved game; the role text absent from the page after "hide"; the moderator's list hidden by default and on `pagehide` and `visibilitychange`; reload mid-reveal, on a card and on the moderator's screen; the resume button; eight kinds of damaged save; the godfather switch; each error on its own field; the language lock; fa to en to fa; the new screens in all 8 themes and both languages with overflow, finger-size and contrast checks; a run with the keyboard only; a whole game with no network). Ten mutations were each run against their own tests and each made one fail.

#### Changed

- `SAVE_VERSION` is 2 (the state holds `game` and `reveal`). A version-1 record is ignored; none was ever written.
- `core/storage.js` stays below `game/`: it returns the raw record (`readSavedState`) and `ui/savedGame.js` validates the game. `persist()` writes only when a game exists.
- The setup placeholder (one field, "nothing starts") is replaced by the form. `tests/unit/game-layering.test.mjs` no longer says "nothing outside `game/` imports it" but "only `ui/` and `app/` import its public files (`constants`, `engine`, `persistence`, `view`)".
- `tests/e2e/fixtures/persian-baseline.json`: the `setup` part regenerated with `tests/e2e/fixtures/make-persian-baseline.mjs`; the `welcome` part is identical. `tests/e2e/helpers/record.mjs` leaves out the resume button and what lies in a hidden screen (name fields, help buttons, the doctor select).
- Tests updated for the new screens: `bindings`, `lang-round-trip`, `phase`, `phase-flow`, `lang-switch`, `screens`, `storage-state`, `config` (unit); `smoke`, `players-count` (the finger test now waits for the page to stand still and taps a visible control), `offline` (a whole game offline) (end to end); stale comments in `modal.test.mjs` and `confirm-modal.test.mjs`.
- `README.md` and `docs/architecture.md`: status, features, phases, state model, storage keys, layering and test counts for step 3A. `docs/game-rules.md` is untouched.

#### Removed

- The placeholder setup screen and its wording; the "dormant confirm dialog" note (it is used now).

#### Known

- A quick double tap on "Hide and pass on" can press the next gate's "I am" button, which sits in the same place, and show the next card to the person still holding the phone. Left alone on purpose; see `docs/architecture.md`.
- The `_source` line the Persian baseline script writes still says "step 1".

### Step 2 of 4: the pure rules engine

The pure rules engine and its tests. **No screens, no visible text, no catalog key:** the engine is not wired into the app, so what a person sees is unchanged.

#### Added

- **The rules engine** in `js/game/` (`constants`, `json`, `rules`, `roles`, `engine`, `view`, `persistence`) and `js/data/roles.js`: five roles (mafia, godfather, doctor, detective, citizen), the role table for 3 to 20 players, the night (mafia team, doctor, detective), the vote, the win rule, exact undo and save/load. It is event-sourced (a game is its setup plus its actions; the state is derived by replay), pure (no DOM, storage, timers, `Date` or `Math.random`; randomness is an injected function) and plain JSON.
- **Rule options:** `doctorSelfSave` (`never`, `once`, `always`; default `once`), `godfather` (default off; needs 6 or more players) and `revealRoleOnDeath` (default on).
- **`docs/game-rules.md`:** the rules exactly as implemented (roles, the table, options, the night, the vote, winning, undo, the save format, every error code). `docs/architecture.md` describes `game/` and `data/`, the purity and layering rules and why event sourcing makes undo exact.
- **Tests.** 303 new unit tests, 837 in all (534 before): one `game-*.test.mjs` file per module, a seeded fuzz of 396 whole playthroughs (3 to 20 players, every option) checked against an independent model, and a layering and purity test (what `game/` may import, a source scan for the DOM, storage, timers, `Date` and `Math.random`, and no empty directory or `.gitkeep`). The 199 end-to-end tests are unchanged.

#### Changed

- `js/i18n/en.js`: the glossary comment lists the engine's terms (mafia, godfather, doctor, detective, citizen, night, day, vote, eliminated) with the Persian term to use later, written in Latin letters because `tests/unit/i18n-en.test.mjs` allows no Persian character in that file; the same terms in Persian script are in `docs/game-rules.md`. Comment only; no catalog key.
- `tests/unit/import-cycles.test.mjs`: the title of the throwaway-tree describe no longer says the real `game/` and `data/` are empty (wording only).
- `README.md` and `docs/architecture.md`: status, roadmap, file list, layering and test counts for step 2.

#### Removed

- The "empty on purpose" wording for `game/` and `data/` (they hold real files now, so no `.gitkeep` is needed).

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
