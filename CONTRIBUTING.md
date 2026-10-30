# Contributing

Thanks for your interest! This is a small, dependency-free project, and contributions of any size are welcome.

## Setup

You need Node.js 22 or newer.

```bash
git clone https://github.com/mahdi-barzegar-nazari/mafia.git
cd mafia
npm install                       # dev tooling only
npm run dev                       # http://localhost:8080
```

## Before opening a pull request

```bash
npm run lint
npm test                          # unit tests
npm run build && npm run test:e2e # needs: npx playwright install chromium
```

Run the unit and the end-to-end suites one after the other, not together.

## Guidelines

- **No runtime dependencies and no build step for the app itself.** Source files are what the browser runs.
- **Keep `index.html` free of inline styles, scripts, and event handlers.** A unit test enforces this, and the Content-Security-Policy would block them anyway. Use the utility classes at the end of `css/style.css` or add a class.
- **Every colour comes from the theme tokens** (`var(--text-primary)` and the others in `css/style.css`). A colour that carries a meaning in every theme (the red of an error) goes on the allow-list in `tests/unit/theme-colors.test.mjs`, with its reason.
- **Use logical CSS properties** (`margin-inline-start`, `text-align: start`), never `left` / `right`: the page is right to left in Persian and left to right in English.
- **Every user action goes through `dispatch()`.** Bind events in `ui/bindings.js`; put game rules in `game/`; keep DOM code out of `utils/`, `core/config.js` and the pure modules so they stay unit-testable. A new action is a new `case` in `handleAction` (`app/actions.js`).
- **Keep imports acyclic and the layers in order.** Import `dispatch` from `core/dispatch.js` and `setPhase` / `commitState` from `core/phase.js`; never import `app/` from anywhere but `main.js`, never import `game/` or `ui/` from `core/`, never import `game/`, `ui/` or `app/` from `i18n/`, and let `data/` import only `data/`. `npm test` fails on a cycle or a wrong-way import and prints the path.
- **A new phase** is an entry in `VALID_PHASES` (`core/config.js`), a `<section id="screen-<phase>" class="screen-view hidden">` in `index.html` and its drawing in `ui/render.js`. Every phase except `welcome` and `setup` counts as a game in progress (`isMatchInProgress`), which locks the language switch; `tests/unit/lang-switch.test.mjs` lists the phases of a game, so add yours there.
- **Adding a file that ships?** Nothing to register: `scripts/build.mjs` discovers files and precaches them automatically. Run `npm run build` to check that every import and HTML reference resolves.
- **Keep Spyfall and Mafia aligned.** The two projects share their infrastructure on purpose (the list is in `docs/architecture.md`). A fix to a shared file is worth making in both; do not reshape a shared file here without a reason, so the two stay easy to compare.
- **Texts:** every text a player can see comes from the translation catalogs (see [Adding or changing a text](#adding-or-changing-a-text)). Keep the Persian wording Persian, with ZWNJ where it belongs, and use Persian digits for numbers shown to players (`formatNumber`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`).

## Adding or changing a text

1. **Pick a key** in `js/i18n/fa.js`: dotted, English, grouped under the screen's comment (`setup.title`, `welcome.tagline`). Values are plain text; use `{name}` for a parameter. Never put HTML in a value. Add the same key to `js/i18n/en.js`.
2. **Text in `index.html`:** keep the Persian text in the HTML as the default and add `data-i18n="key"` to the element (leaf elements only: it replaces the whole `textContent`; if the text sits next to other children, wrap it in `<span data-i18n="key">`). For attributes use `data-i18n-attr="aria-label:key;placeholder:key"`. The HTML text and the catalog value must be equal after whitespace is collapsed; a test fails otherwise.
3. **Text in JS:** use `t('key', { name })`. There are no Persian letters, digits or comments in `js/` outside the catalogs: `npm test` fails on one (`no-hardcoded-text.test.mjs`). Which function to use:
   - plain text (`textContent`, `showToast`): `t('key', { name })`;
   - a number of things ("3 players"): `tn('key', count)` with `key.one` and `key.other` in the catalog (Persian writes the same text in both). `{count}` is written with the language's digits;
   - a number alone: `formatNumber(n)`; a time: `formatDuration(seconds)`;
   - a sentence with a bold name or a line break: one template with `{name}` / `{br}` and `setTemplate(element, 'key', { name: strongNode })`. The markup stays in the code, never in the catalog;
   - text that goes into an HTML string (`innerHTML`): `tHtml('key', { name: rawHtml(`<strong>${escapeHtml(n)}</strong>`) })`. Plain `t()` escapes nothing, so never put its result in `innerHTML` as it is.
   Write a name list as a template too (`names.pair`), not as pieces: another language may order it differently.
4. **An element JS writes:** its default text in `index.html` is a harmless placeholder (or empty). Add it to `JS_WRITTEN` in `tests/unit/i18n-html.test.mjs` with the catalog keys JS writes into it.
5. Run `npm test`. It fails on a missing key, an HTML/catalog mismatch, a Persian text in `index.html` or in the code that is not translatable, a plural text without `.other`, markup in a catalog value, and a catalog key nothing uses.
6. If the Persian welcome or setup text changed on purpose, record it again (see the header of `tests/e2e/fixtures/make-persian-baseline.mjs`) and say so in `CHANGELOG.md`. Never record it again just to make a failing test pass.

## Saved-game compatibility

A saved game carries a `SAVE_VERSION` (`js/core/state.js`). If you change the shape of `gameState`, bump it so old saves are discarded instead of crashing. (Nothing is saved before step 2: `persist()` writes only once a game has players.)

## Reporting bugs

Please include your device and browser, what you did, and what you expected. For game bugs, the game state in `localStorage['mafia_full_state_master']` helps a lot.
