/**
 * The hand-off guard: for 800 ms around a role card, a quick second tap is ignored. It works both ways.
 *
 * Why it exists. "I am {name}" (the gate), "Hide and pass on" (the card) and the screen that comes after the last
 * card are drawn in the same place on the phone. A quick second tap (a double tap, a nervous finger) lands on
 * whatever the next screen has under it:
 *   - after a card was hidden, while the person who hid it still holds the phone: on the next gate's "I am {name}"
 *     button, which would show the NEXT role to that person, or, after the last card, on the first night screen,
 *     where a tap could open the players panel with every role in it;
 *   - after a card was shown, while its player has barely seen it: on that card's "Hide and pass on" button, which
 *     would hide the role at once, move on to the next player, and leave this one with no way back to their card.
 * Nothing else in the app has such a risk, so the guard is only about this one moment. `cardHiddenAt` is set when a
 * card is hidden (`markCardHidden`) and any press that would reveal or change something is dropped while
 * `isGuarded()` is true; `cardShownAt` is set when a card is shown (`markCardShown`) and "Hide and pass on" is
 * dropped while `isHideGuarded()` is true. Each press that is dropped changes nothing at all.
 *
 * Both windows are the same and half open: a press 799 ms after the stamp is ignored, a press at 800 ms is
 * accepted. A clock that went backwards (a reading older than the one stored) never blocks anything: the guard
 * fails open rather than keep the buttons dead for an hour.
 */

import { HAND_OFF_GUARD_MS } from '../core/config.js';
import { session } from '../core/state.js';
import { now } from './clock.js';

/** True when `stamp` is a clock reading and less than HAND_OFF_GUARD_MS (and not a negative time) has passed since it. */
function withinWindow(stamp) {
    if (typeof stamp !== 'number' || !Number.isFinite(stamp)) return false;
    const elapsed = now() - stamp;
    return elapsed >= 0 && elapsed < HAND_OFF_GUARD_MS;
}

/** Remember that a role card was hidden just now. */
export function markCardHidden() {
    session.cardHiddenAt = now();
}

/** True while presses must be ignored: less than HAND_OFF_GUARD_MS (and not a negative time) since a card was hidden. */
export function isGuarded() {
    return withinWindow(session.cardHiddenAt);
}

/** Remember that a role card was shown just now. The next card, for the next player, starts a window of its own. */
export function markCardShown() {
    session.cardShownAt = now();
}

/** True while "Hide and pass on" must be ignored: less than HAND_OFF_GUARD_MS (and not a negative time) since a card was shown. */
export function isHideGuarded() {
    return withinWindow(session.cardShownAt);
}
