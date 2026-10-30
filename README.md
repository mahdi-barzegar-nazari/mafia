<div align="center">

# 🎭 Mafia PWA · مافیا

**An offline-first moderator assistant for the Mafia party game. One phone, in the moderator's hands.**
Persian (RTL) and English (LTR) UI · zero runtime dependencies · installable on Android and iOS

[![CI](https://github.com/mahdi-barzegar-nazari/mafia/actions/workflows/ci.yml/badge.svg)](https://github.com/mahdi-barzegar-nazari/mafia/actions/workflows/ci.yml)
[![Deploy](https://github.com/mahdi-barzegar-nazari/mafia/actions/workflows/deploy.yml/badge.svg)](https://github.com/mahdi-barzegar-nazari/mafia/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/github/license/mahdi-barzegar-nazari/mafia?style=flat-square)](./LICENSE)
[![PWA](https://img.shields.io/badge/PWA-offline--ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](#offline-first-and-safe-updates)
[![Vanilla JS](https://img.shields.io/badge/vanilla-ES_modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](#architecture)
[![Dependencies: 0](https://img.shields.io/badge/runtime_dependencies-0-brightgreen?style=flat-square)](./package.json)
[![Support](https://img.shields.io/badge/support-buy_me_a_coffee-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black)](https://www.coffeete.ir/MahdiBN)

**[▶ Play the live demo](https://mahdi-barzegar-nazari.github.io/mafia/)**

</div>

---

## Overview

Mafia (مافیا) is the classic party game in which a hidden minority tries to eliminate the town before the town finds them out. This project is the **moderator's assistant**: one phone, held by the person who runs the game, with no accounts, room codes, servers or internet connection needed once the page has loaded.

It ships as native ES modules, a service worker and plain CSS, with no framework and no bundler.

> **Status: step 1 of 4, the app shell.** The shell is complete and tested, and it has **no game logic yet**: no roles, no phases of a night or a day, no votes. It has the welcome screen and a placeholder setup screen that asks only for the number of players (3 to 20). The game itself arrives in the next steps, on top of the infrastructure described below.

## What the shell has

- **Welcome screen.** The name, a one-line tagline, the round play button, the language switch, the theme selector, the credit line and, behind a long press on the title, the version line.
- **Setup placeholder.** One validated field (the number of players, 3 to 20) with its hint, and a back button. Nothing starts.
- **Persian and English.** Persian is the default; English is one tap away on the welcome screen (see [Switch the language](#switch-the-language)). A person who chose English never sees the Persian page flash first.
- **8 themes**, one token system, dynamic viewport sizing (`100dvh`) and safe-area padding for edge-to-edge phones. Every colour comes from the theme tokens; only the colours that carry a meaning stay the same in every theme.
- **Offline-first and installable.** A versioned service worker precaches every shipped file; a one-line install hint covers the browsers that have no install button (iPhone, iPad, Firefox for Android).
- **Strict Content-Security-Policy.** No inline script and no inline style; the page is locked to its own origin.
- **A phase machine ready to grow.** `welcome` and `setup` are wired through the same `dispatch` / `setPhase` / `commitState` seams the finished Spyfall app uses, so the next step adds phases without restructuring.

## Quickstart

### Run locally

**Prerequisites:** Node.js 22 or newer. The app itself needs nothing else; ES modules only work over `http://`, not `file://`, so use the bundled dev server.

```bash
git clone https://github.com/mahdi-barzegar-nazari/mafia.git
cd mafia

npm run dev            # serves the source tree at http://localhost:8080 (service worker stays inert)
npm run build          # writes the deployable site to ./dist with a stamped service worker
npm run preview        # serves ./dist to test real offline caching
```

### Develop and test

```bash
npm install            # dev tooling only: ESLint, Prettier, Playwright (this also writes package-lock.json: commit it, CI runs `npm ci`)
npm test               # 534 unit tests (built-in node:test, no dependencies)
npx playwright install chromium
npm run test:e2e       # 199 real-browser tests of the production build: smoke test, offline first load, language switch (with the recorded Persian screens), themes, players-count field, confirm dialog, first paint, build line and its long-press reveal, install hint
npm run lint
```

Run the unit and the browser suites one after the other, not at the same time: the browser tests build the site and start servers of their own.

### Switch the language

On the welcome screen tap **English** (or **فارسی** to go back). The two buttons always sit in the same left-to-right order, each written in its own language, so you can find yours even when the page is in the other one. The choice is remembered on the device (`localStorage` key `mafia_lang`) and applies at the next visit too. Persian stays the default; the browser's language is never used to guess. Once a game exists (step 2) the language can only be changed outside a game: a running game keeps the language it was started in.

## Architecture

```text
.
├── index.html                 # semantic markup only; loads css/style.css and js/main.js
├── css/style.css              # design tokens, 8 themes, components, utility classes
├── js/
│   ├── main.js                # entry point: wires modules together in start-up order
│   ├── preinit.js             # classic <head> script: language and direction before the first paint (English users)
│   ├── app/                   # composition root: the action handler behind dispatch(), and wireApp()
│   ├── core/                  # config (rules, theme colours), state, storage, phase (setPhase, commitState), dispatch port, buildInfo (stamped version and hash)
│   ├── game/                  # (empty: the game rules arrive in step 2)
│   ├── ui/                    # rendering, setup form, event bindings, theme, language switch, toasts, focus trap, build line
│   ├── platform/              # wake lock, anti-zoom, install prompt and install hint, service worker registration
│   ├── data/                  # (empty: step 2 adds the game's data)
│   ├── i18n/                  # translation core (t, language switching) and the Persian and English catalogs
│   └── utils/                 # text and random helpers (pure)
├── sw.js                      # service worker (versioned app-shell precache)
├── manifest.json              # PWA manifest
├── assets/                    # self-hosted Vazirmatn font, 192, 512 and padded maskable icons
├── scripts/                   # build.mjs (dist + SW and build-info stamping), serve.mjs (dev server)
├── tests/                     # unit (node:test) and e2e (Playwright)
└── .github/workflows/         # CI and GitHub Pages deployment
```

State lives in one object (`core/state.js`). Every user action becomes a `dispatch({ type, payload })` call, which mutates state, re-renders, and persists it. Modules call `dispatch` through a small port in `core/dispatch.js`; `app/wire.js` connects the real handler at start-up, so there are no import cycles (a unit test enforces it). A walkthrough of the modules, the layering rules, the list of files this project shares with Spyfall, and the known trade-offs is in [`docs/architecture.md`](./docs/architecture.md).

### Offline-first and safe updates

The service worker precaches every shipped file and serves it cache-first, so the app works with no connection. The classic risk of that strategy is users being stuck on an old version forever, so:

- `scripts/build.mjs` stamps `sw.js` with a **hash of all shipped files plus the `version` of `package.json`**. Any change, a version bump alone included, produces a new worker and a new cache; unchanged sources produce the same version.
- Precaching bypasses the HTTP cache, so a cache never mixes files from two builds.
- Old caches are deleted on activate. The app shows a toast when a new version has installed; it applies the next time the app is opened, so a game in progress is never interrupted.
- In a source checkout (`npm run dev`) the worker caches nothing, so local edits appear immediately.
- Every `localStorage` key of this app starts with `mafia_` and every cache with `mafia-`, so it can live on the same origin as another app of the same owner (the finished Spyfall app uses `spy_` and `spyfall-`) without touching its data.

### Which version is running

The welcome screen has one small, faint build line, the same in Persian and English: `v0.1.0 · 8f33eec`. It is hidden, so players never see it. **To see it, press and hold the title** (the heading at the top of the welcome screen, not a button) for about half a second: the line appears under the credit and hides itself again after 6 seconds (pressing and holding again while it shows gives it another 6). A quick tap or a scroll does nothing. The line is the `version` of `package.json` and the first 7 characters of the build hash, the same hash `scripts/build.mjs` stamps into `sw.js` as `VERSION` (the cache is named `mafia-shell-<hash>`). In a source checkout (`npm run dev`, nothing stamped) the line says just `dev`.

- **Where the number comes from.** `scripts/build.mjs` reads the version from `package.json` and the hash it has just computed, and writes both into `js/core/buildInfo.js` in the built site (the file in the repository keeps its `__APP_VERSION__` and `__BUILD_HASH__` placeholders, like `sw.js`). Nothing is fetched. The build refuses a `package.json` version that is not a plain `x.y.z` and fails if either placeholder is missing.
- **After an update.** The number tells you which build the open app is running. When a new version has been downloaded the app shows the "new version ready" toast, but the running page keeps its old files, so the **old number stays until the app is closed and opened again**.
- **How to bump it.** Edit `version` in `package.json` and add the entry to `CHANGELOG.md`. Nothing else: the version is part of the hash.

## Deployment

Pushes to `main` run [`deploy.yml`](./.github/workflows/deploy.yml): unit tests, then build, then publish `dist/` to GitHub Pages. One-time setup: **Settings → Pages → Source: GitHub Actions**. The workflows do not mention the repository name, so a renamed or forked repository needs no edit. CI and the deploy use `npm ci`, which needs a `package-lock.json`: run `npm install` once and commit the file it writes.

## Roadmap

- [x] Step 1: the app shell (this version): infrastructure, welcome and setup placeholder, tests, documentation
- [ ] Steps 2 to 4: the game itself, built on the shell (not started)

## Contributing

Bug reports and pull requests are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

This is a solo, spare-time project, maintained between classes and other work. If you enjoy it and want to help keep it going, you can [buy me a coffee ☕](https://www.coffeete.ir/MahdiBN).

## License

Released under the [MIT License](./LICENSE).

Made by [Mahdi Barzegar Nazari](https://github.com/mahdi-barzegar-nazari).
