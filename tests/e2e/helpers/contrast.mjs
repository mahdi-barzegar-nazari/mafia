/**
 * Contrast of the text a person must read, measured in the real page (shared by game-screens.test.mjs and the
 * layout tests of the game screens).
 */
import assert from 'node:assert/strict';

/**
 * Runs in the page: for each selector, the WCAG contrast of the text colour of every showing element that has text
 * against what is behind it (the nearest opaque background, with any translucent layers in between composed over
 * it). Returns `{ selector, text, ratio }` for the worst element of each selector.
 */
export function measureContrast(selectors) {
    const parse = (value) => {
        let m = value.match(/^rgba?\(([^)]+)\)$/);
        if (m) {
            const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
            return [r, g, b, a];
        }
        m = value.match(/^color\(srgb ([^)]+)\)$/);
        if (m) {
            const [r, g, b, a = 1] = m[1].split(/[ /]+/).filter(Boolean).map(Number);
            return [r * 255, g * 255, b * 255, a];
        }
        return null;
    };
    const over = (top, bottom) => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
    };
    const luminance = ([r, g, b]) => {
        const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const backdrop = (el) => {
        const layers = [];
        for (let node = el; node; node = node.parentElement) {
            const colour = parse(getComputedStyle(node).backgroundColor);
            if (colour && colour[3] > 0) layers.push(colour);
            if (colour && colour[3] >= 1) break;
        }
        let result = [9, 13, 22, 1];
        for (const layer of layers.reverse()) result = over(layer, result);
        return result;
    };
    const out = [];
    for (const selector of selectors) {
        let worst = null;
        for (const el of document.querySelectorAll(selector)) {
            if (el.closest('.screen-view.hidden') || el.closest('.hidden') || !el.textContent.trim()) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const fg = parse(getComputedStyle(el).color);
            if (!fg) continue;
            const bg = backdrop(el);
            const text = over(fg, bg);
            const [hi, lo] = [luminance(text), luminance(bg)].sort((a, b) => b - a);
            const ratio = (hi + 0.05) / (lo + 0.05);
            if (!worst || ratio < worst.ratio) worst = { selector, text: el.textContent.trim().slice(0, 30), ratio: Math.round(ratio * 100) / 100 };
        }
        if (worst) out.push(worst);
    }
    return out;
}

export async function assertReadable(page, selectors, where, { min = 4.5 } = {}) {
    const found = await page.evaluate(measureContrast, selectors);
    assert.ok(found.length > 0, `${where}: found text to measure`);
    for (const item of found) assert.ok(item.ratio >= min, `${where}: "${item.text}" (${item.selector}) has contrast ${item.ratio}, needs ${min}`);
}
