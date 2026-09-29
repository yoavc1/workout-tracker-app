// Unit tests for the theme (Track G): the <head> script that resolves Auto / Light / Dark before the first paint, the one-time
// migration from the old Dark Mode toggle, and an audit that colours live only in the theme tokens.
// Usage: node tests/theme.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const src = (head.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
assert.ok(src, 'index.html has an inline theme script in <head>');
assert.ok(head.indexOf('<script>') < head.indexOf('<link rel="stylesheet"'), 'theme script runs before the stylesheet is applied');
const tcs = [...head.matchAll(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: (light|dark)\)">/g)];
assert.deepStrictEqual(tcs.map(m => m[2]), ['light', 'dark'], 'a light, then a dark theme-color');
const [LIGHT, DARK] = tcs.map(m => m[1]);

// Runs the head script against a fake page: stored values, the phone's appearance, and optionally a broken localStorage
function boot(store, sysDark, opts = {}) {
  const attrs = {}, metas = [{ content: LIGHT }, { content: DARK }];
  const ls = opts.broken ? { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }
    : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = {
    localStorage: ls,
    document: { querySelectorAll: () => metas, documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] } },
  };
  if (!opts.noMedia) ctx.matchMedia = q => ({ media: q, get matches() { return /dark/.test(q) && ctx.sysDark; } });
  ctx.sysDark = sysDark; ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { theme: () => attrs['data-theme'], metas: () => metas.map(m => m.content), store, ctx };
}

// Fresh install: Auto, following the phone
let b = boot({}, false);
assert.strictEqual(b.theme(), 'light'); assert.deepStrictEqual(b.store, { ironlog_theme: 'auto', ironlog_theme_v: '2' });
assert.deepStrictEqual(b.metas(), [LIGHT, DARK], 'Auto keeps the media pair');
assert.strictEqual(boot({}, true).theme(), 'dark');

// Migration from the old toggle, which wrote 'light'/'dark' while both themes were light
b = boot({ ironlog_theme: 'light' }, true);
assert.strictEqual(b.theme(), 'light', "old 'light' stays Light"); assert.strictEqual(b.store.ironlog_theme, 'light');
b = boot({ ironlog_theme: 'dark' }, false);
assert.strictEqual(b.theme(), 'light', "old 'dark' becomes Auto"); assert.strictEqual(b.store.ironlog_theme, 'auto');
assert.strictEqual(boot({ ironlog_theme: 'dark' }, true).theme(), 'dark', 'and Auto follows a dark phone');
assert.strictEqual(boot({ ironlog_theme: 'weird' }, false).store.ironlog_theme, 'auto');

// After the migration a stored 'dark' is a real choice and survives reloads
b = boot({ ironlog_theme: 'dark', ironlog_theme_v: '2' }, false);
assert.strictEqual(b.theme(), 'dark'); assert.deepStrictEqual(b.metas(), [DARK, DARK], 'a fixed choice colours both tags');
b = boot({ ironlog_theme: 'light', ironlog_theme_v: '2' }, true);
assert.strictEqual(b.theme(), 'light'); assert.deepStrictEqual(b.metas(), [LIGHT, LIGHT]);
assert.strictEqual(boot({ ironlog_theme: 'bogus', ironlog_theme_v: '2' }, true).theme(), 'dark', 'unknown values act as Auto');

// thApply() re-resolves live: the phone flips, then the choice changes back to Auto
b = boot({ ironlog_theme: 'auto', ironlog_theme_v: '2' }, false);
b.ctx.sysDark = true; assert.strictEqual(b.ctx.thApply(), 'auto'); assert.strictEqual(b.theme(), 'dark');
b.store.ironlog_theme = 'light'; b.ctx.thApply(); assert.deepStrictEqual([b.theme(), b.metas()], ['light', [LIGHT, LIGHT]]);
b.store.ironlog_theme = 'auto'; b.ctx.thApply(); assert.deepStrictEqual([b.theme(), b.metas()], ['dark', [LIGHT, DARK]], 'Auto restores the pair');

// Blocked storage (old private browsing) falls back to Auto, and no matchMedia to light, without throwing
assert.strictEqual(boot({}, true, { broken: true }).theme(), 'dark');
assert.strictEqual(boot({}, true, { noMedia: true }).theme(), 'light');

// ─── Colours live only in the theme tokens ───
// Colour literals: #rgb/#rrggbb(aa) not followed by more of an id, rgb()/rgba()/hsl(), and %23-encoded colours in data URIs
const COLOR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])|\b(?:rgba?|hsla?)\(|%23[0-9a-f]{3,6}\b|color-scheme\s*:\s*dark/i;
const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
// Token blocks (:root{...} and :root[data-theme="dark"]{...}) are where colours belong; every other rule must use var(--...)
const rules = css.replace(/^@import[^\n]*\n/m, '').replace(/:root(\[[^\]]*\])?\{[^}]*\}/g, '');
const bad = [];
rules.replace(/\{([^{}]*)\}/g, (m, body) => { if (COLOR.test(body)) bad.push('app.css: ' + body.slice(0, 90)); });
assert.ok(/:root\[data-theme="dark"\]\{/.test(css), 'dark tokens block');
assert.ok(!/\[data-theme="light"\]/.test(css), 'no light duplicates left');
[...html.matchAll(/style="([^"]*)"/g)].forEach(m => { if (COLOR.test(m[1])) bad.push('index.html style: ' + m[1].slice(0, 90)); });
fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).forEach(f => {
  fs.readFileSync(path.join(root, 'js', f), 'utf8').split('\n').forEach((l, i) => {
    if (COLOR.test(l)) bad.push(f + ':' + (i + 1) + ': ' + l.trim().slice(0, 90));
  });
});
assert.deepStrictEqual(bad, [], 'hard-coded colours outside the theme tokens');

console.log('theme tests pass');
