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
import { updateSetupLimitHints } from './ui/setup.js';
import { initTheme } from './ui/theme.js';

/** Initial render. */
function start() {
    syncLangSwitch();

    renderBuildInfo();

    initBuildInfoReveal();

    updateSetupLimitHints();
}

/**
 * What JS writes into the page once, and so does not follow the static translator by itself: the pressed
 * state of the language switch, the limit hints and any toast still on screen. Redo them when the language
 * changes: after a click on the switch (and, later, when a saved match is restored in the language it was
 * started in). Texts built when something opens need nothing here.
 */
function refreshLanguageDependentUi() {
    syncLangSwitch();
    clearToasts();
    updateSetupLimitHints();
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
