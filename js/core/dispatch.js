/**
 * The action port: `dispatch({ type, payload })` is what every module calls to trigger an action.
 *
 * This file imports nothing from `game/` or `ui/`. The handler that actually runs the actions
 * (`app/actions.js`) is installed at start-up by `app/wire.js` through `setDispatchHandler`, so the modules
 * that dispatch never depend on the modules that handle.
 */

let handler = null;

/** Install the function that runs every action. */
export function setDispatchHandler(fn) {
    handler = fn;
}

export function dispatch(action) {
    if (!handler) throw new Error(`dispatch(${action && action.type}) ran before a handler was installed; call wireApp() first.`);
    handler(action);
}
