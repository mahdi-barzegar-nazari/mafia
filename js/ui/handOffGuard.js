/**
 * The hand-off guard: for 800 ms after a role card was hidden, the buttons of the game ignore presses.
 *
 * Why it exists. "Hide and pass on" and the screen that comes after it are drawn in the same place on the phone.
 * A quick second tap (a double tap, a nervous finger) lands on whatever the next screen has under it, while the
 * person who hid the card still holds the phone:
 *   - between two players: the next gate's "I am {name}" button, which would show the NEXT role to the person
 *     still holding the phone;
 *   - after the last card: the first night screen, where a tap could open the players panel with every role in it.
 * Nothing else in the app has such a risk, so the guard is only about this one moment: `cardHiddenAt` is set when
 * a card is hidden (`markCardHidden`), and any press that would reveal or change something is dropped while
 * `isGuarded()` is true.
 *
 * The window is half open: a press 799 ms after the card was hidden is ignored, a press at 800 ms is accepted. A
 * clock that went backwards (a reading older than the one stored) never blocks anything: the guard fails open
 * rather than keep the buttons dead for an hour.
 */

import { HAND_OFF_GUARD_MS } from '../core/config.js';
import { session } from '../core/state.js';
import { now } from './clock.js';

/** Remember that a role card was hidden just now. */
export function markCardHidden() {
    session.cardHiddenAt = now();
}

/** True while presses must be ignored: less than HAND_OFF_GUARD_MS (and not a negative time) since a card was hidden. */
export function isGuarded() {
    const hiddenAt = session.cardHiddenAt;
    if (typeof hiddenAt !== 'number' || !Number.isFinite(hiddenAt)) return false;
    const elapsed = now() - hiddenAt;
    return elapsed >= 0 && elapsed < HAND_OFF_GUARD_MS;
}
