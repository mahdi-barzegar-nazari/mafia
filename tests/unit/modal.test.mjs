/**
 * The dialog machinery that every later screen will lean on: the keyboard focus trap (ui/focusTrap.js) and the
 * OPEN_MODAL / CLOSE_MODAL actions (app/actions.js) that hide the page behind a dialog and give the focus back
 * when it closes. The shell has one dialog, the generic confirm modal, which nothing opens yet; it is kept so
 * that this machinery stays working and tested. Everything runs on the fake page of helpers/fakeEnv.mjs.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { FakeElement, installFakeEnv } from './helpers/fakeEnv.mjs';
import { useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { handleAction } = await import('../../js/app/actions.js');
const { trapFocus } = await import('../../js/ui/focusTrap.js');

let focusCalls;
/** A modal with `count` focusable controls. Their focus() calls are recorded with the options they were given. */
function makeModal(count = 3, id = 'confirm-modal') {
    const modal = env.el(id);
    modal.classList.add('modal-overlay');
    const controls = Array.from({ length: count }, (_, i) => {
        const control = new FakeElement(`${id}-control-${i}`, 'button');
        control.focus = (options) => {
            focusCalls.push({ id: control.id, options });
            FakeElement.lastFocused = control;
        };
        return control;
    });
    modal.querySelectorAll = () => controls;
    return { modal, controls };
}

const tab = (shiftKey = false) => {
    let prevented = false;
    return { key: 'Tab', shiftKey, preventDefault: () => (prevented = true), get prevented() { return prevented; } };
};

useGameHarness(env, {
    setup: () => {
        focusCalls = [];
        document.body = new FakeElement('body', 'body');
        env.el('main-content-root');
    },
    teardown: () => {
        delete document.body;
    }
});
after(() => env.uninstall());

describe('trapFocus', () => {
    it('puts the focus on the first control, without scrolling the page to it', () => {
        const { modal, controls } = makeModal();
        trapFocus(modal);
        assert.equal(FakeElement.lastFocused, controls[0]);
        assert.deepEqual(focusCalls, [{ id: controls[0].id, options: { preventScroll: true } }]);
    });

    it('Tab on the last control goes back to the first, and the browser is told not to move on by itself', () => {
        const { modal, controls } = makeModal();
        trapFocus(modal);
        FakeElement.lastFocused = controls[2];
        const event = tab();
        modal.onkeydown(event);
        assert.equal(FakeElement.lastFocused, controls[0]);
        assert.equal(event.prevented, true);
    });

    it('Shift+Tab on the first control goes to the last', () => {
        const { modal, controls } = makeModal();
        trapFocus(modal);
        FakeElement.lastFocused = controls[0];
        const event = tab(true);
        modal.onkeydown(event);
        assert.equal(FakeElement.lastFocused, controls[2]);
        assert.equal(event.prevented, true);
    });

    it('leaves Tab alone in the middle of the dialog, and every other key everywhere', () => {
        const { modal, controls } = makeModal();
        trapFocus(modal);
        FakeElement.lastFocused = controls[1];
        for (const shiftKey of [false, true]) {
            const event = tab(shiftKey);
            modal.onkeydown(event);
            assert.equal(event.prevented, false);
            assert.equal(FakeElement.lastFocused, controls[1]);
        }
        FakeElement.lastFocused = controls[2];
        const enter = { key: 'Enter', shiftKey: false, preventDefault: () => assert.fail('Enter must not be intercepted') };
        modal.onkeydown(enter);
        assert.equal(FakeElement.lastFocused, controls[2]);
    });

    it('Shift+Tab on the last control and Tab on the first are the browser\'s own business', () => {
        const { modal, controls } = makeModal();
        trapFocus(modal);
        FakeElement.lastFocused = controls[2];
        const back = tab(true);
        modal.onkeydown(back);
        assert.equal(back.prevented, false);
        FakeElement.lastFocused = controls[0];
        const forward = tab(false);
        modal.onkeydown(forward);
        assert.equal(forward.prevented, false);
    });

    it('a dialog with one control keeps the focus on it from both directions', () => {
        const { modal, controls } = makeModal(1);
        trapFocus(modal);
        for (const shiftKey of [false, true]) {
            FakeElement.lastFocused = controls[0];
            const event = tab(shiftKey);
            modal.onkeydown(event);
            assert.equal(event.prevented, true);
            assert.equal(FakeElement.lastFocused, controls[0]);
        }
    });

    it('does nothing for a dialog with no focusable control (and does not throw)', () => {
        const { modal } = makeModal(0);
        assert.doesNotThrow(() => trapFocus(modal));
        assert.ok(!modal.onkeydown, 'no key handler was installed');
        assert.deepEqual(focusCalls, []);
    });
});

describe('OPEN_MODAL', () => {
    it('shows the dialog, hides the page behind it from the keyboard and the screen reader, stops it scrolling, and traps the focus', () => {
        const { modal, controls } = makeModal();
        modal.classList.add('hidden');
        handleAction({ type: 'OPEN_MODAL', payload: 'confirm-modal' });
        assert.equal(modal.classList.contains('hidden'), false);
        assert.equal(env.el('main-content-root').inert, true);
        assert.equal(document.body.style.overflow, 'hidden');
        assert.equal(FakeElement.lastFocused, controls[0]);
        assert.equal(typeof modal.onkeydown, 'function');
    });

    it('an id that is not on the page changes nothing: the page stays usable', () => {
        handleAction({ type: 'OPEN_MODAL', payload: 'no-such-modal' });
        assert.equal(env.el('main-content-root').inert, undefined);
        assert.equal(document.body.style.overflow, undefined);
    });
});

describe('CLOSE_MODAL', () => {
    function open() {
        const opener = new FakeElement('opener', 'button');
        FakeElement.lastFocused = opener;
        const parts = makeModal();
        parts.modal.classList.add('hidden');
        handleAction({ type: 'OPEN_MODAL', payload: 'confirm-modal' });
        return { ...parts, opener };
    }

    it('hides the dialog, gives the page back, and returns the focus to what had it before the dialog opened', () => {
        const { modal, opener } = open();
        env.stubQuery('.modal-overlay:not(.hidden)', []);
        handleAction({ type: 'CLOSE_MODAL', payload: 'confirm-modal' });
        assert.equal(modal.classList.contains('hidden'), true);
        assert.equal(modal.onkeydown, null, 'the trap is released');
        assert.equal(env.el('main-content-root').inert, false);
        assert.equal(document.body.style.overflow, '');
        assert.equal(FakeElement.lastFocused, opener);
    });

    it('keeps the page blocked while another dialog is still open, and does not move the focus', () => {
        const { modal, controls } = open();
        env.stubQuery('.modal-overlay:not(.hidden)', [env.el('another-modal')]);
        handleAction({ type: 'CLOSE_MODAL', payload: 'confirm-modal' });
        assert.equal(modal.classList.contains('hidden'), true);
        assert.equal(env.el('main-content-root').inert, true);
        assert.equal(document.body.style.overflow, 'hidden');
        assert.equal(FakeElement.lastFocused, controls[0]);
    });

    it('an id that is not on the page is ignored, and the page is still given back when no dialog is open', () => {
        env.el('main-content-root').inert = true;
        env.stubQuery('.modal-overlay:not(.hidden)', []);
        assert.doesNotThrow(() => handleAction({ type: 'CLOSE_MODAL', payload: 'no-such-modal' }));
        assert.equal(env.el('main-content-root').inert, false);
    });

    it('does not fail when nothing had the focus before (no element to give it back to)', () => {
        makeModal();
        env.stubQuery('.modal-overlay:not(.hidden)', []);
        FakeElement.lastFocused = null;
        handleAction({ type: 'OPEN_MODAL', payload: 'confirm-modal' });
        assert.doesNotThrow(() => handleAction({ type: 'CLOSE_MODAL', payload: 'confirm-modal' }));
    });
});
