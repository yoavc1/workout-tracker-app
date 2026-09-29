// Test helpers with no dependencies: a static file server, a mock of the Apps Script sync endpoint,
// and headless Chrome driven over the DevTools protocol (needs Node 22+ for the global WebSocket).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function listen(server) { return new Promise(r => server.listen(0, '127.0.0.1', () => r(server))); }
function urlOf(server) { return 'http://127.0.0.1:' + server.address().port + '/'; }

function staticServer(root) {
  return listen(http.createServer((q, r) => {
    const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(root) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(r);
  }));
}

// Same contract as backend/Code.gs: GET -> stored JSON, POST (text/plain) -> store, {"success":true}.
// /__store reads (GET) or replaces (PUT) the stored data for tests.
function mockSync() {
  const state = { store: null, log: [] };
  return listen(http.createServer((q, r) => {
    const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    let b = ''; q.on('data', c => b += c);
    q.on('end', () => {
      if (q.url.startsWith('/__store')) {
        if (q.method === 'PUT') state.store = JSON.parse(b);
        r.writeHead(200, h); return r.end(JSON.stringify(state));
      }
      if (q.method === 'GET') { state.log.push('GET'); r.writeHead(200, h); return r.end(JSON.stringify(state.store || {})); }
      state.log.push('POST'); state.store = JSON.parse(b); r.writeHead(200, h); r.end('{"success":true}');
    });
  })).then(s => Object.assign(s, { state }));
}

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((res, rej) => {
    let err = ''; const t = setTimeout(() => rej(new Error('Chrome did not start: ' + err)), 20000);
    proc.stderr.on('data', d => { err += d; const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//); if (m) { clearTimeout(t); res(m[1]); } });
    proc.on('exit', c => rej(new Error('Chrome exited ' + c + ': ' + err)));
  });
  return {
    port,
    close() { try { proc.kill('SIGKILL'); } catch (e) {} setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); },
    async page(width = 393, height = 852) {
      const t = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
      let id = 0; const pend = {}; const errors = [];
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
      };
      const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
      await send('Runtime.enable'); await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      const pg = {
        errors, send,
        wait: ms => new Promise(r => setTimeout(r, ms)),
        async ev(expr) {
          const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
          if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' => ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
          return r.result.result.value;
        },
        async go(url) { await send('Page.navigate', { url }); await pg.wait(300); await pg.ev('new Promise(r=>{if(document.readyState==="complete")r();else addEventListener("load",()=>r())})'); await pg.ev('document.fonts.ready.then(()=>1)'); await pg.wait(400); },
        async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); if (file) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); return r.result.data; },
        close() { ws.close(); },
      };
      return pg;
    },
  };
}

// 20 sessions over the last ~60 days across four workouts, written straight into localStorage
const SEED = `localStorage.clear();(function(){var ss=[];var W={'Legs':['Squat - Dumbbell','Calf Raise - Seated'],'Upper Pull':['Lat Pull Down - Front'],'Upper Push':['Dips'],'Muay Thai':['Pads']};var n=0;var t0=new Date();t0.setHours(12,0,0,0);for(var d=60;d>2;d-=3){var w=Object.keys(W)[n++%4];var ex={};W[w].forEach(function(x){ex[x]=[{kg:40+n,reps:10},{kg:42+n,reps:8}];});ss.push({workout:w,date:new Date(t0.getTime()-d*864e5).toISOString(),exercises:ex,duration:3000,abs:false});}localStorage.setItem('ironlog_data',JSON.stringify({sessions:ss,workouts:W,lastModified:t0.getTime()-1000}));})();'ok'`;

// Loads app scripts (js/*.js) into a sandbox with an in-memory localStorage and no DOM, for unit tests of the
// data layer. fetch can be replaced per test (ctx.fetch = ...). Values come from another realm, so compare via JSON.
function loadApp(files, store = {}) {
  const vm = require('vm');
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear() { for (const k in store) delete store[k]; } };
  const ctx = vm.createContext({
    localStorage, console, setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: () => null, querySelector: () => null }, navigator: { onLine: true },
    uSub() {}, fetch: () => Promise.reject(new Error('no network in unit tests')),
  });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  ctx.__store = store;
  return ctx;
}

module.exports = { staticServer, mockSync, launchChrome, urlOf, SEED, loadApp };
