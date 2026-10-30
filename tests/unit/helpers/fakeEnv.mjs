/**
 * Just enough browser to import and drive the app modules under Node, with no dependencies.
 *
 * Why this exists: the modules call `document`, `localStorage`, `navigator` and the timer functions while
 * they run. ES imports are hoisted, so a test must call `installFakeEnv()` first and load the modules
 * afterwards with `await import(...)`.
 *
 * Everything here is a recording fake: it never opens a window or waits for real time.
 * `env.uninstall()` puts every global back and throws if a global was added or lost.
 */

/** Small seeded PRNG (mulberry32), so "random" tests replay the same sequence every time. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A manual clock behind setTimeout/setInterval. Time only moves when a test calls `tick(ms)`.
 * Timers scheduled from inside a callback run in the same `tick` if they fall inside its window
 * (node:test's `mock.timers` does not do that, and it prints an ExperimentalWarning on Node 22).
 */
function createClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    const add = (fn, ms, repeat) => {
        const id = nextId++;
        const delay = Math.max(1, Number(ms) || 0);
        timers.set(id, { id, fn, delay, repeat, at: now + delay });
        return id;
    };
    return {
        setTimeout: (fn, ms) => add(fn, ms, false),
        setInterval: (fn, ms) => add(fn, ms, true),
        clear: (id) => {
            timers.delete(id);
        },
        /** Number of timers and intervals that are still armed. */
        pending: () => timers.size,
        tick(ms) {
            const end = now + ms;
            for (;;) {
                let next = null;
                for (const t of timers.values()) {
                    if (t.at <= end && (!next || t.at < next.at)) next = t;
                }
                if (!next) break;
                now = next.at;
                if (next.repeat) next.at += next.delay;
                else timers.delete(next.id);
                next.fn();
            }
            now = end;
        }
    };
}

export class FakeElement {
    /** The element that `focus()` was called on last (what `document.activeElement` returns). */
    static lastFocused = null;

    constructor(id = '', tagName = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parent = null;
        this.dataset = {};
        this.style = {};
        this.attributes = {};
        this.listeners = {};
        this.queries = {};
        this.classes = new Set();
        this.textContent = '';
        this.innerHTML = '';
        this.value = '';
        this.disabled = false;
        this.onclick = null;
        this.classList = {
            add: (...names) => names.forEach((n) => this.classes.add(n)),
            remove: (...names) => names.forEach((n) => this.classes.delete(n)),
            contains: (name) => this.classes.has(name),
            toggle: (name, force) => {
                const on = force === undefined ? !this.classes.has(name) : Boolean(force);
                if (on) this.classes.add(name);
                else this.classes.delete(name);
                return on;
            }
        };
    }

    get className() {
        return [...this.classes].join(' ');
    }

    set className(value) {
        this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    get firstElementChild() {
        return this.children[0] || null;
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...nodes) {
        this.children.forEach((child) => {
            child.parent = null;
        });
        this.children = [];
        this.textContent = '';
        nodes.forEach((node) => this.appendChild(node));
    }

    remove() {
        if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return name in this.attributes ? this.attributes[name] : null;
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    removeEventListener(type, fn) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }

    /** The element a test stored for `selector` in `el.queries` (null when none). */
    querySelector(selector) {
        return this.queries[selector] || null;
    }

    focus() {
        FakeElement.lastFocused = this;
    }

    getBoundingClientRect() {
        return { top: 0, left: 0, width: 0, height: 0 };
    }
}

const TIMER_GLOBALS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];

export function installFakeEnv() {
    const namesBefore = Object.getOwnPropertyNames(globalThis).sort();
    const originalRandom = Math.random;
    const originals = new Map();
    const dom = { byId: new Map(), queries: new Map() };
    const store = new Map();
    const sentinels = [];
    const logs = {
        wakeLocks: [],
        /** Every listener added with `document.addEventListener` or `window.addEventListener`: `{ target, type, fn }`. */
        listeners: []
    };
    let clock = null;

    const define = (name, value) => {
        if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, {
            value,
            configurable: true,
            writable: true,
            enumerable: true
        });
    };
    const restore = (name) => {
        if (!originals.has(name)) return;
        const descriptor = originals.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
        originals.delete(name);
    };

    define('window', {
        addEventListener: (type, fn) => logs.listeners.push({ target: 'window', type, fn })
    });
    define('document', {
        get activeElement() {
            return FakeElement.lastFocused;
        },
        addEventListener: (type, fn) => logs.listeners.push({ target: 'document', type, fn }),
        getElementById: (id) => dom.byId.get(id) || null,
        querySelectorAll: (selector) => dom.queries.get(selector) || [],
        querySelector: (selector) => (dom.queries.get(selector) || [])[0] || null,
        createElement: (tag) => new FakeElement('', tag),
        createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parent: null }),
        createElementNS: (ns, tag) => new FakeElement('', tag)
    });
    define('navigator', {
        wakeLock: {
            request: async (type) => {
                logs.wakeLocks.push(type);
                const sentinel = { released: false, addEventListener() {} };
                sentinels.push(sentinel);
                return sentinel;
            }
        }
    });
    define('localStorage', {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
            store.set(key, String(value));
        },
        removeItem: (key) => {
            store.delete(key);
        },
        clear: () => store.clear()
    });
    const installCrypto = (next) => {
        const realCrypto = globalThis.crypto;
        define('crypto', {
            getRandomValues(array) {
                array[0] = next();
                return array;
            },
            randomUUID: () => realCrypto.randomUUID()
        });
    };

    const restoreTimers = () => {
        TIMER_GLOBALS.forEach(restore);
        clock = null;
    };

    const env = {
        logs,
        /** The fake localStorage contents (a Map of key to string). */
        storage: store,

        /** Create (or fetch) the element `document.getElementById(id)` will return. */
        el(id) {
            if (!dom.byId.has(id)) dom.byId.set(id, new FakeElement(id));
            return dom.byId.get(id);
        },

        /** Make `document.querySelectorAll(selector)` return `elements`. */
        stubQuery(selector, elements) {
            dom.queries.set(selector, elements);
        },

        /** An `<input>` holding `value`. */
        input(value) {
            const input = new FakeElement('', 'input');
            input.value = value;
            return input;
        },

        /** Texts of the toasts currently on screen. */
        toasts() {
            const container = dom.byId.get('toast-container');
            return container ? container.children.map((c) => c.textContent) : [];
        },

        /** Swap the global timers for a manual clock. Returns it (also available as `env.clock`). */
        installTimers() {
            restoreTimers();
            clock = createClock();
            define('setTimeout', clock.setTimeout);
            define('setInterval', clock.setInterval);
            define('clearTimeout', clock.clear);
            define('clearInterval', clock.clear);
            return clock;
        },

        get clock() {
            return clock;
        },

        /** Replay the same "random" numbers: seeds Math.random and crypto.getRandomValues. */
        seedRandom(seed) {
            const random = mulberry32(seed);
            Math.random = random;
            installCrypto(() => Math.floor(random() * 4294967296));
        },

        /** Make crypto.getRandomValues return `next(callIndex)`; randomUUID stays real. */
        stubCrypto(next) {
            let calls = 0;
            installCrypto(() => next(calls++));
        },

        /** Forget everything a test did; leaves the fakes installed. */
        reset() {
            dom.byId.clear();
            dom.queries.clear();
            store.clear();
            logs.wakeLocks.length = 0;
            logs.listeners.length = 0;
            FakeElement.lastFocused = null;
            // A released sentinel makes wakeLock.js ask for a new lock on its next call.
            sentinels.forEach((s) => {
                s.released = true;
            });
            sentinels.length = 0;
            restoreTimers();
            restore('crypto');
            Math.random = originalRandom;
        },

        /** Put every global back, and fail loudly if anything was left behind or lost. */
        uninstall() {
            env.reset();
            [...originals.keys()].forEach(restore);
            const namesAfter = Object.getOwnPropertyNames(globalThis).sort();
            const leaked = namesAfter.filter((n) => !namesBefore.includes(n));
            const lost = namesBefore.filter((n) => !namesAfter.includes(n));
            if (leaked.length || lost.length || Math.random !== originalRandom) {
                throw new Error(`fake env left globals behind: +[${leaked}] -[${lost}]`);
            }
        }
    };
    return env;
}
