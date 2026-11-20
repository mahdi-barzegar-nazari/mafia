/**
 * The fake page of the tests that drive the whole app through the real seams (`wireApp` installs the real action
 * handler and renderer): the eight screens, the parts of each that the code writes, the shared game chrome and the
 * dialogs, all as `FakeElement`s of the fake environment. `index.html` itself is checked in screens.test.mjs; here
 * only the ids the code looks up have to exist.
 */
import { FakeElement } from './fakeEnv.mjs';

export const PHASES = ['welcome', 'setup', 'reveal', 'night', 'morning', 'day', 'dusk', 'ended'];

/** Every element of the game screens and their chrome that the renderer reads or writes by id. */
export const GAME_IDS = [
    'game-live',
    ...['night', 'morning', 'day', 'dusk', 'ended'].map((phase) => `title-${phase}`),
    'night-steps',
    'night-current',
    'night-instruction',
    'night-doctor-note',
    'night-targets',
    'btn-night-confirm',
    'morning-announcement',
    'btn-morning-continue',
    'btn-morning-notes',
    'morning-notes',
    'morning-notes-list',
    'day-counter',
    'vote-list',
    'btn-vote-close',
    'dusk-result',
    'btn-dusk-continue',
    'ended-winner',
    'btn-ended-new-game',
    'game-chrome',
    'players-list',
    'rules-list',
    'rules-details',
    'btn-roles-toggle',
    'btn-undo',
    'btn-new-game'
];

/**
 * Build the page: the screens (only welcome showing), the parts the code writes, the dialogs. Call it after
 * `env.reset()`; the elements are created in `env`.
 */
export function buildPage(env) {
    const byId = (id) => env.el(id);
    const screens = PHASES.map((name) => {
        const el = env.el(`screen-${name}`);
        el.classList.add('screen-view');
        if (name !== 'welcome') el.classList.add('hidden');
        el.queries['h1, h2, h3'] = new FakeElement(`${name}-heading`, 'h2');
        return el;
    });
    env.stubQuery('.screen-view', screens);
    for (const id of ['reveal-gate', 'reveal-card', 'game-chrome', 'night-current', 'morning-notes']) byId(id).classList.add('hidden');
    byId('btn-resume-game').classList.add('hidden');
    for (const id of ['confirm-modal', 'info-modal']) {
        const modal = byId(id);
        modal.classList.add('modal-overlay', 'hidden');
        modal.querySelectorAll = () => [];
    }
    for (const id of ['confirm-modal-title', 'confirm-modal-text', 'main-content-root', 'toast-container', 'reveal-progress', 'reveal-gate-title', 'btn-reveal-show', 'btn-reveal-hide', 'reveal-card-body', 'reveal-live', 'players-limit-hint', 'names-limit-hint', 'godfather-hint', 'setup-names', ...GAME_IDS]) byId(id);
    byId('btn-undo').disabled = true;
    byId('btn-night-confirm').disabled = true;
    byId('setup-players-count').value = '8';
    byId('setup-doctor-save').value = 'once';
    byId('setup-godfather').checked = false;
    byId('setup-reveal-death').checked = true;
    document.body = new FakeElement('body', 'body');
    document.documentElement = { lang: 'fa', dir: 'rtl', classList: { remove() {} } };
}
