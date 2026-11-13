/**
 * Application entry point: wires every module together in the original start-up order.
 */

import { wireApp } from './app/wire.js';
import { initI18n, onLangChange } from './i18n/index.js';
import { initAntiZoom } from './platform/antiZoom.js';
import { initInstallPrompt } from './platform/install.js';
import { registerServiceWorker } from './platform/serviceWorker.js';
import { bindEvents } from './ui/bindings.js';
import { initBuildInfoReveal, renderBuildInfo } from './ui/buildInfo.js';
import { clearToasts } from './ui/feedback.js';
import { syncLangSwitch } from './ui/langSwitch.js';
import { relocalizeNameInputs, resetSetupForm, updateSetupLimitHints } from './ui/setup.js';
import { syncResumeButton } from './ui/resume.js';
import { initTheme } from './ui/theme.js';

/** Initial render. */
function start() {
    syncLangSwitch();

    renderBuildInfo();

    initBuildInfoReveal();

    // The setup form starts from its defaults, with one default-named field per player.
    resetSetupForm();

    updateSetupLimitHints();

    // A game saved by an earlier visit can be resumed from the welcome screen.
    syncResumeButton();
}

/**
 * What JS writes into the page once, and so does not follow the static translator by itself: the pressed
 * state of the language switch, the limit hints, the default names of the setup form (and the labels of its name
 * fields) and any toast still on screen. Redo them when the language changes: after a click on the switch. The
 * language cannot change while a game is in progress, so the texts of the reveal and moderator screens, which are
 * built when they are drawn, need nothing here.
 */
function refreshLanguageDependentUi() {
    syncLangSwitch();
    clearToasts();
    updateSetupLimitHints();
    relocalizeNameInputs();
}

initI18n();
onLangChange(refreshLanguageDependentUi);
wireApp();
initAntiZoom();
initTheme();
bindEvents();
initInstallPrompt();
start();
registerServiceWorker();
