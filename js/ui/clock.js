/**
 * The one clock the UI reads. It is a function that can be replaced, so a test never has to wait: a unit test
 * installs its own with `setNow`, and an end-to-end test needs nothing at all because the default reads
 * `performance.now()`, which the browser test's fake clock (`page.clock`) controls too.
 *
 * `performance.now()` is monotonic: unlike `Date.now()` it cannot jump back when the phone's clock is corrected.
 * Only the difference of two readings means anything; the number itself does not.
 */

const defaultNow = () => performance.now();

let source = defaultNow;

/** The current clock reading in milliseconds. */
export function now() {
    return source();
}

/** Replace the clock with `fn` (a function returning a number of milliseconds). Anything else restores the real one. */
export function setNow(fn) {
    source = typeof fn === 'function' ? fn : defaultNow;
}

/** Put the real clock back. */
export function resetNow() {
    source = defaultNow;
}
