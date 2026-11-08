/**
 * Layering of the rules engine, on the real tree: what game/ may import, that data/ and the lower layers
 * stay below it, that the engine is pure (a source scan), and that the repository has no empty directory
 * and no .gitkeep (Git does not keep empty folders, so a fresh clone must not need them).
 * The checks run on throwaway trees too, so a broken check cannot pass by finding nothing.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const GAME_FILES = ['constants', 'engine', 'json', 'persistence', 'roles', 'rules', 'view'].map((name) => `js/game/${name}.js`);
const DATA_FILES = ['js/data/roles.js'];

// ---- the module graph (the same reading of `import` as import-cycles.test.mjs)

function parseSpecifiers(source) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specifiers = new Set();
    for (const m of code.matchAll(/^\s*(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm)) specifiers.add(m[1]);
    for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specifiers.add(m[1]);
    for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.add(m[1]);
    return [...specifiers];
}

function listFiles(dir, extension) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listFiles(full, extension) : full.endsWith(extension) ? [full] : [];
    });
}

/** "js/..." path -> the "js/..." paths it imports. */
function buildGraph(root) {
    const toName = (file) => relative(root, file).split(sep).join('/');
    const graph = new Map();
    for (const file of listFiles(join(root, 'js'), '.js')) {
        const edges = new Set();
        for (const spec of parseSpecifiers(readFileSync(file, 'utf8'))) {
            if (!spec.startsWith('.')) continue;
            const target = resolve(dirname(file), spec);
            edges.add(toName(target));
        }
        graph.set(toName(file), [...edges].sort());
    }
    return graph;
}

/** What game/ may import: game/, data/, utils/ and core/config.js (for RULES). Every other import is a violation. */
function gameViolations(graph) {
    const allowed = (target) => target.startsWith('js/game/') || target.startsWith('js/data/') || target.startsWith('js/utils/') || target === 'js/core/config.js';
    return [...graph].flatMap(([file, imports]) => (file.startsWith('js/game/') ? imports.filter((t) => !allowed(t)).map((t) => `${file} -> ${t}`) : []));
}

/** Imports of game/ from a layer that must stay below it. */
function upwardViolations(graph) {
    const below = /^js\/(core|i18n|utils|platform|data)\//;
    return [...graph].flatMap(([file, imports]) => (below.test(file) ? imports.filter((t) => t.startsWith('js/game/')).map((t) => `${file} -> ${t}`) : []));
}

/** Imports of game/ from anywhere outside game/ (step 3 wires it into ui/ and app/ and drops that test). */
function importersOfGame(graph) {
    return [...graph].flatMap(([file, imports]) => (!file.startsWith('js/game/') ? imports.filter((t) => t.startsWith('js/game/')).map((t) => `${file} -> ${t}`) : []));
}

const real = buildGraph(ROOT);

describe('the engine files exist', () => {
    it('js/game/ and js/data/ hold their real files, so Git keeps both folders', () => {
        for (const file of [...GAME_FILES, ...DATA_FILES]) assert.ok(real.has(file), `${file} is missing`);
        assert.ok([...real.keys()].some((f) => f.startsWith('js/game/')));
        assert.ok([...real.keys()].some((f) => f.startsWith('js/data/')));
    });
});

describe('no empty directory and no .gitkeep (a fresh clone has neither)', () => {
    const SKIP = new Set(['node_modules', '.git', 'dist']);
    function walk(dir, found) {
        const entries = readdirSync(dir);
        if (entries.length === 0) found.empty.push(relative(ROOT, dir).split(sep).join('/'));
        for (const name of entries) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                if (!SKIP.has(name)) walk(full, found);
            } else if (name === '.gitkeep') {
                found.gitkeep.push(relative(ROOT, full).split(sep).join('/'));
            }
        }
        return found;
    }

    it('the repository tree has none', () => {
        const { empty, gitkeep } = walk(ROOT, { empty: [], gitkeep: [] });
        assert.deepEqual(empty, [], 'an empty directory is not in a Git clone: give it a file or remove it');
        assert.deepEqual(gitkeep, [], 'a .gitkeep is not needed once the folder has real files');
    });

    it('the walk really finds an empty directory and a .gitkeep (self-check on a throwaway tree)', () => {
        const root = mkdtempSync(join(tmpdir(), 'mafia-empty-'));
        try {
            mkdirSync(join(root, 'a', 'b'), { recursive: true });
            mkdirSync(join(root, 'c'));
            writeFileSync(join(root, 'c', '.gitkeep'), '');
            writeFileSync(join(root, 'a', 'file.txt'), 'x');
            const found = (function scan(dir, out) {
                const entries = readdirSync(dir);
                if (entries.length === 0) out.empty.push(relative(root, dir));
                for (const name of entries) {
                    const full = join(dir, name);
                    if (statSync(full).isDirectory()) scan(full, out);
                    else if (name === '.gitkeep') out.gitkeep.push(relative(root, full));
                }
                return out;
            })(root, { empty: [], gitkeep: [] });
            assert.deepEqual(found.empty, [join('a', 'b')]);
            assert.deepEqual(found.gitkeep, [join('c', '.gitkeep')]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('what game/ imports', () => {
    it('only game/, data/, utils/ and core/config.js', () => {
        assert.deepEqual(gameViolations(real), [], 'game/ must not reach into ui/, app/, i18n/, platform/ or the rest of core/');
    });

    it('the files are actually read: the engine imports its neighbours', () => {
        const engine = real.get('js/game/engine.js');
        for (const expected of ['js/core/config.js', 'js/data/roles.js', 'js/utils/text.js', 'js/game/roles.js', 'js/game/rules.js']) {
            assert.ok(engine.includes(expected), `engine.js should import ${expected}`);
        }
        assert.ok(real.get('js/game/persistence.js').includes('js/game/engine.js'));
    });
});

describe('what stays below game/', () => {
    it('data/ imports nothing outside data/', () => {
        const data = [...real].filter(([file]) => file.startsWith('js/data/'));
        assert.ok(data.length >= 1);
        for (const [file, imports] of data) assert.deepEqual(imports.filter((t) => !t.startsWith('js/data/')), [], file);
    });

    it('core/, i18n/, utils/, platform/ and data/ never import game/', () => {
        assert.deepEqual(upwardViolations(real), []);
    });

    it('core/ and i18n/ never import from ui/ or app/ either (the rule of import-cycles.test.mjs, on the real tree)', () => {
        for (const [file, imports] of real) {
            if (file.startsWith('js/core/') || file.startsWith('js/i18n/')) {
                assert.deepEqual(imports.filter((t) => /^js\/(game|ui|app)\//.test(t)), [], file);
            }
        }
    });
});

describe('this step does not wire the engine into the app', () => {
    // Step 3 connects game/ to ui/ and app/; it then deletes this test and keeps the rules above.
    it('nothing outside game/ imports it yet', () => {
        assert.deepEqual(importersOfGame(real), []);
    });
});

describe('the rules, proved on throwaway trees', () => {
    function graphOf(files) {
        const root = mkdtempSync(join(tmpdir(), 'mafia-game-layers-'));
        try {
            for (const [name, source] of Object.entries(files)) {
                const file = join(root, 'js', name);
                mkdirSync(dirname(file), { recursive: true });
                writeFileSync(file, source);
            }
            return buildGraph(root);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }

    it('flags game/ importing ui/, app/, i18n/, platform/ or core/ files other than config.js', () => {
        const graph = graphOf({
            'game/a.js': "import '../ui/x.js';\nimport '../app/y.js';\nimport '../i18n/i.js';\nimport '../platform/p.js';\nimport '../core/state.js';\nimport '../core/config.js';\nimport './b.js';\nimport '../data/d.js';\nimport '../utils/u.js';\n",
            'game/b.js': '',
            'ui/x.js': '', 'app/y.js': '', 'i18n/i.js': '', 'platform/p.js': '', 'core/state.js': '', 'core/config.js': '', 'data/d.js': '', 'utils/u.js': ''
        });
        assert.deepEqual(gameViolations(graph), [
            'js/game/a.js -> js/app/y.js',
            'js/game/a.js -> js/core/state.js',
            'js/game/a.js -> js/i18n/i.js',
            'js/game/a.js -> js/platform/p.js',
            'js/game/a.js -> js/ui/x.js'
        ]);
    });

    it('flags the lower layers importing game/, and anything outside game/ importing it', () => {
        const graph = graphOf({
            'core/c.js': "import '../game/g.js';\n",
            'i18n/i.js': "import '../game/g.js';\n",
            'data/d.js': "import '../game/g.js';\n",
            'utils/u.js': "import '../game/g.js';\n",
            'ui/x.js': "import '../game/g.js';\n",
            'game/g.js': ''
        });
        assert.deepEqual(upwardViolations(graph), ['js/core/c.js -> js/game/g.js', 'js/data/d.js -> js/game/g.js', 'js/i18n/i.js -> js/game/g.js', 'js/utils/u.js -> js/game/g.js']);
        assert.equal(importersOfGame(graph).length, 5);
    });

    it('lets the allowed directions through', () => {
        const graph = graphOf({ 'game/a.js': "import '../core/config.js';\nimport '../data/d.js';\nimport '../utils/u.js';\n", 'core/config.js': '', 'data/d.js': '', 'utils/u.js': '' });
        assert.deepEqual(gameViolations(graph), []);
        assert.deepEqual(upwardViolations(graph), []);
    });
});

describe('the engine is pure: a source scan of game/ and data/', () => {
    /** [what it is, the pattern]. Comments are removed first, so prose may use the words. */
    const FORBIDDEN = [
        ['document (the DOM)', /\bdocument\b/],
        ['window', /\bwindow\b/],
        ['localStorage', /\blocalStorage\b/],
        ['sessionStorage', /\bsessionStorage\b/],
        ['Math.random', /\bMath\s*\.\s*random\b/],
        ['Date.now', /\bDate\s*\.\s*now\b/],
        ['new Date', /\bnew\s+Date\b/],
        ['any use of Date', /\bDate\b/],
        ['setTimeout', /\bsetTimeout\b/],
        ['setInterval', /\bsetInterval\b/],
        ['performance', /\bperformance\b/],
        ['crypto', /\bcrypto\b/],
        ['fetch', /\bfetch\b/]
    ];

    const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const offences = (source) => FORBIDDEN.filter(([, pattern]) => pattern.test(stripComments(source))).map(([what]) => what);

    it('no file in game/ or data/ uses the DOM, storage, a timer, the clock or Math.random', () => {
        const files = [...listFiles(join(ROOT, 'js', 'game'), '.js'), ...listFiles(join(ROOT, 'js', 'data'), '.js')];
        assert.ok(files.length >= GAME_FILES.length + DATA_FILES.length, `only ${files.length} files scanned`);
        const found = files.flatMap((file) => offences(readFileSync(file, 'utf8')).map((what) => `${relative(ROOT, file)}: ${what}`));
        assert.deepEqual(found, []);
    });

    it('the scan really catches each of them, and ignores comments (self-check)', () => {
        for (const [source, what] of [
            ['const d = document.body;', 'document (the DOM)'],
            ['window.alert(1);', 'window'],
            ["localStorage.setItem('a', 'b');", 'localStorage'],
            ["sessionStorage.getItem('a');", 'sessionStorage'],
            ['const r = Math.random();', 'Math.random'],
            ['const r = Math . random ();', 'Math.random'],
            ['const t = Date.now();', 'Date.now'],
            ['const t = new Date();', 'new Date'],
            ['const t = Date.UTC(1);', 'any use of Date'],
            ['setTimeout(f, 1);', 'setTimeout'],
            ['setInterval(f, 1);', 'setInterval'],
            ['performance.now();', 'performance'],
            ['crypto.randomUUID();', 'crypto'],
            ["fetch('x');", 'fetch']
        ]) {
            assert.ok(offences(source).includes(what), `${what} not caught in: ${source}`);
        }
        assert.deepEqual(offences('// document window Math.random Date.now new Date\n/* localStorage setTimeout */\nconst x = 1;'), []);
        assert.deepEqual(offences('const documents = 1; const windowed = 2; const dated = 3;'), [], 'whole words only');
    });

    it('game/ and data/ hold no import of the browser or Node (only relative imports)', () => {
        for (const file of [...listFiles(join(ROOT, 'js', 'game'), '.js'), ...listFiles(join(ROOT, 'js', 'data'), '.js')]) {
            for (const spec of parseSpecifiers(readFileSync(file, 'utf8'))) assert.ok(spec.startsWith('.'), `${relative(ROOT, file)} imports ${spec}`);
        }
    });
});
