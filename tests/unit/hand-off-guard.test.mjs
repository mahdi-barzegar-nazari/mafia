/**
 * ui/clock.js and ui/handOffGuard.js: the 800 ms after a role card was hidden (the buttons of the game) and the 800 ms
 * after a role card was shown ("Hide and pass on"), measured on a clock the test owns, so nothing waits. Half open:
 * 799 ms is still guarded, 800 ms is not. (That the guard is applied to the right presses is in game-play.test.mjs.)
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { HAND_OFF_GUARD_MS } from '../../js/core/config.js';
import { session } from '../../js/core/state.js';
import { now, resetNow, setNow } from '../../js/ui/clock.js';
import { isGuarded, isHideGuarded, markCardHidden, markCardShown } from '../../js/ui/handOffGuard.js';

let t = 0;
afterEach(() => {
    resetNow();
    session.cardHiddenAt = null;
    session.cardShownAt = null;
});

describe('the clock', () => {
    it('reads performance.now() by default, and a test can replace it and put it back', () => {
        const real = now();
        assert.ok(Math.abs(real - performance.now()) < 50);
        setNow(() => 42);
        assert.equal(now(), 42);
        resetNow();
        assert.ok(now() >= real);
        setNow('not a function');
        assert.ok(Math.abs(now() - performance.now()) < 50, 'anything that is not a function restores the real clock');
    });
});

describe('the hand-off guard', () => {
    it('is 800 ms', () => {
        assert.equal(HAND_OFF_GUARD_MS, 800);
    });

    it('guards nothing while no card was ever hidden', () => {
        setNow(() => 0);
        assert.equal(session.cardHiddenAt, null);
        assert.equal(isGuarded(), false);
    });

    it('guards at 0 ms and at 799 ms, and not at 800 ms or later', () => {
        t = 5000;
        setNow(() => t);
        markCardHidden();
        assert.equal(session.cardHiddenAt, 5000);
        for (const elapsed of [0, 1, 400, 798, 799]) {
            t = 5000 + elapsed;
            assert.equal(isGuarded(), true, `${elapsed} ms`);
        }
        for (const elapsed of [800, 801, 5000, 1e9]) {
            t = 5000 + elapsed;
            assert.equal(isGuarded(), false, `${elapsed} ms`);
        }
    });

    it('is measured from the last card that was hidden', () => {
        t = 0;
        setNow(() => t);
        markCardHidden();
        t = 700;
        markCardHidden();
        t = 1499;
        assert.equal(isGuarded(), true);
        t = 1500;
        assert.equal(isGuarded(), false);
    });

    it('fails open: a clock that went backwards, or a stored value that is no time, guards nothing', () => {
        t = 10_000;
        setNow(() => t);
        markCardHidden();
        t = 4000;
        assert.equal(isGuarded(), false, 'a reading older than the stored one');
        for (const bad of [null, undefined, 'soon', NaN, Infinity, {}]) {
            session.cardHiddenAt = bad;
            assert.equal(isGuarded(), false, String(bad));
        }
    });
});

describe('the guard on "Hide and pass on"', () => {
    it('guards nothing while no card was ever shown', () => {
        setNow(() => 0);
        assert.equal(session.cardShownAt, null);
        assert.equal(isHideGuarded(), false);
    });

    it('guards at 0 ms and at 799 ms after a card was shown, and not at 800 ms or later', () => {
        t = 5000;
        setNow(() => t);
        markCardShown();
        assert.equal(session.cardShownAt, 5000);
        for (const elapsed of [0, 1, 400, 798, 799]) {
            t = 5000 + elapsed;
            assert.equal(isHideGuarded(), true, `${elapsed} ms`);
        }
        for (const elapsed of [800, 801, 5000, 1e9]) {
            t = 5000 + elapsed;
            assert.equal(isHideGuarded(), false, `${elapsed} ms`);
        }
    });

    it('is measured from the last card that was shown: the card of the next player starts a new window', () => {
        t = 0;
        setNow(() => t);
        markCardShown();
        t = 1600;
        assert.equal(isHideGuarded(), false, 'the first card is long past its window');
        markCardShown();
        t = 1600 + 799;
        assert.equal(isHideGuarded(), true, 'the next card has a window of its own');
        t = 1600 + 800;
        assert.equal(isHideGuarded(), false);
    });

    it('fails open: a clock that went backwards, or a stored value that is no time, guards nothing', () => {
        t = 10_000;
        setNow(() => t);
        markCardShown();
        t = 4000;
        assert.equal(isHideGuarded(), false, 'a reading older than the stored one');
        for (const bad of [null, undefined, 'soon', NaN, Infinity, {}]) {
            session.cardShownAt = bad;
            assert.equal(isHideGuarded(), false, String(bad));
        }
    });

    it('is a window of its own: a card that was shown does not guard the buttons of the game, and a card that was hidden does not guard "Hide and pass on"', () => {
        t = 0;
        setNow(() => t);
        markCardShown();
        assert.equal(isHideGuarded(), true);
        assert.equal(isGuarded(), false);
        session.cardShownAt = null;
        markCardHidden();
        assert.equal(isGuarded(), true);
        assert.equal(isHideGuarded(), false);
    });
});
