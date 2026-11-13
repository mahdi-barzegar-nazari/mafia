/**
 * The "Resume game" button of the welcome screen: shown only while a game that can be resumed is saved.
 */

import { hasSavedGame } from './savedGame.js';

/** Show the button when a usable saved game exists and hide it otherwise (it carries `.hidden` in index.html). */
export function syncResumeButton() {
    const button = document.getElementById('btn-resume-game');
    if (button) button.classList.toggle('hidden', !hasSavedGame());
}
