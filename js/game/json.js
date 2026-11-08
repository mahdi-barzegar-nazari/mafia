/**
 * Small helpers for plain JSON data: the game, its setup and its actions are only objects, arrays,
 * strings, numbers, booleans and null, so a JSON round trip is an exact deep copy.
 */

/** True for `{}` and `Object.create(null)`; false for arrays, null, class instances, functions. */
export function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** A deep copy of JSON data. The input is only read, so a frozen input is fine. */
export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

/** Deep equality of JSON data. Object key order does not matter; array order does. */
export function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}
