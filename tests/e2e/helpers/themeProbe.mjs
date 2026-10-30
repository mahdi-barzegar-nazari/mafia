/**
 * Opens the production build on a phone-sized page in one theme and one language and reads back, from the browser,
 * the colours that are computed for the page, the card, the language switch, the play button, the title, the setup
 * field and the dialogs (the real elements of the welcome and setup screens, and small probe elements made from the
 * app's own classes and kept out of sight: buttons, toast, text field, scrim and dialog card).
 * Everything is returned as the strings `getComputedStyle` wrote; tests/unit/helpers/cssTokens.mjs parses them.
 * Step 2 adds the probes of its own screens here.
 */
import { PHONE, newPage } from './app.mjs';

/** Runs in the page. `probes` are made in a hidden box inside the card, so every rule that depends on an ancestor applies. */
function measureInPage() {
    const box = document.createElement('div');
    box.className = 'hidden';
    document.querySelector('.app-container').appendChild(box);
    const make = (tag, className, parent = box, attrs = {}) => {
        const el = document.createElement(tag);
        el.className = className;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        parent.appendChild(el);
        return el;
    };
    const read = (el, props, pseudo) => {
        const style = getComputedStyle(el, pseudo || null);
        return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
    };
    const FILL = ['background-color', 'background-image', 'color', 'border-top-color', 'box-shadow'];

    const out = {};
    const body = getComputedStyle(document.body);
    out.tokens = Object.fromEntries(['--bg-body', '--bg-gradient', '--surface-card', '--surface-input', '--border-glow', '--text-primary', '--text-secondary', '--brand-primary', '--brand-secondary', '--brand-emerald', '--brand-rose', '--brand-amber'].map((t) => [t, body.getPropertyValue(t).trim()]));
    out.theme = document.body.getAttribute('data-theme');
    out.page = read(document.body, ['background-color', 'background-image', 'color']);
    out.container = read(document.querySelector('.app-container'), FILL);

    // The real controls of the welcome screen and the setup screen.
    for (const lang of ['fa', 'en']) {
        const el = document.getElementById(`btn-lang-${lang}`);
        out[`lang-${lang}`] = { ...read(el, FILL), pressed: el.getAttribute('aria-pressed') };
    }
    out.play = read(document.querySelector('.play-button'), FILL);
    out.playIcon = read(document.querySelector('.play-button-icon'), ['border-left-color']);
    out.title = read(document.getElementById('welcome-title'), ['background-image']);
    out.credit = read(document.querySelector('p.credit-line:not(#build-info)'), ['color']);
    out.selector = read(document.getElementById('theme-selector'), FILL);
    out.back = read(document.getElementById('btn-back-welcome-2'), FILL);
    out.field = read(document.getElementById('setup-players-count'), FILL);
    out.hint = read(document.getElementById('players-limit-hint'), ['color']);

    // Probes made from the app's own classes.
    const buttons = {};
    for (const name of ['btn-primary', 'btn-rose', 'btn-ghost']) buttons[name] = read(make('button', `btn ${name}`), FILL);
    out.buttons = buttons;
    out.cards = {
        toast: read(make('div', 'toast'), FILL),
        input: read(make('input', 'input-control'), FILL),
        overlay: read(make('div', 'modal-overlay'), FILL),
        modalCard: read(make('div', 'modal-card'), FILL)
    };
    box.remove();
    return out;
}

/** Everything `measureInPage` reads, for `theme` and `lang`. Fails if the page reports a script error. */
export async function snapshotTheme(browser, baseUrl, theme, lang) {
    // Reduced motion makes every transition (the buttons fade between themes in 0.2 s) end at once.
    const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
    const { page, problems } = await newPage(context);
    try {
        await page.goto(baseUrl);
        await page.waitForSelector('#screen-welcome:not(.hidden)');
        if (lang === 'en') await page.click('#btn-lang-en');
        await page.selectOption('#theme-selector', theme);
        await page.waitForFunction((name) => document.body.getAttribute('data-theme') === name && document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState === 'finished'), theme);
        const data = await page.evaluate(measureInPage);
        if (problems.length) throw new Error(`script errors in ${theme}/${lang}: ${problems.join('; ')}`);
        return data;
    } finally {
        await context.close();
    }
}
