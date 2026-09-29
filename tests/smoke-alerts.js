// End-to-end test of the smart banner on home in headless Chrome at iPhone size (393x852), and at 320 wide, against a
// mock sync server. Usage: node tests/smoke-alerts.js   (set CHROME=/path/to/chrome if it isn't in /Applications)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf } = require('./lib');

// Synthetic history relative to now: noon N days ago, plus one session a minute ago (so it's always "this week")
const DAY = 864e5, noon = new Date(); noon.setHours(12, 0, 0, 0);
const ago = n => new Date(noon.getTime() - n * DAY).toISOString(), justNow = new Date(Date.now() - 60000).toISOString();
const lday = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const IN = 'Incline Chest Press (Smith/Machine)', LAT = 'Lat Pulldown Machine (Uni Lateral)', FP = 'Cable Face Pulls', SQ = 'Squat - Dumbbell';
const sessions = [];
const add = (date, workout, ex) => sessions.push({ id: 'seed' + sessions.length, mt: 1, workout, date, duration: 3000, exercises: Object.fromEntries(Object.entries(ex).map(([k, kg]) => [k, [{ kg, reps: 8 }, { kg, reps: 8 }]])) });
for (let n = 62, i = 0; n >= 3; n -= 3, i++) {
  const w = i % 3;
  if (w === 0) add(ago(n), 'Upper Push', { [IN]: 40 });
  // Face pulls every 9 days until 23 days ago (rear delts: neglected); the lat pulldown stays flat at 45 (stalled)
  if (w === 1) add(ago(n), 'Upper Pull', n >= 20 ? { [LAT]: 45, [FP]: 20 } : { [LAT]: 45 });
  if (w === 2) add(ago(n), 'Legs', { [SQ]: 30 + (62 - n) / 3 });
}
add(justNow, 'Upper Push', { [IN]: 42.5 });                               // a new best this week
const start = lday(noon.getTime() - 45 * DAY), end = lday(noon.getTime() + 45 * DAY);
const goals = [{ id: 'gB', mt: 1, exercise: LAT, startKg: 45, startDate: start, targetKg: 60, targetDate: end, archived: false }];  // behind: flat at 45
const c5 = lday(noon.getTime() - 5 * DAY), core = { ['c' + c5]: { id: 'c' + c5, mt: 1, date: c5, done: true } };                    // core 5 days ago
const DATA = { sessions, workouts: { 'Upper Push': [IN], 'Upper Pull': [LAT, FP], Legs: [SQ] }, goals, core, lastModified: noon.getTime() - 1000 };

(async () => {
  const root = path.join(__dirname, '..');
  const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'wt-alerts-'));
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  const pages = [];
  let ok = false;
  try {
    const p = await chrome.page(); pages.push(p);
    const shot = f => p.shot(path.join(shots, f));
    await p.go(APP);
    await p.ev(`localStorage.clear();sessionStorage.clear();localStorage.setItem('ironlog_data',${JSON.stringify(JSON.stringify(DATA))});localStorage.setItem('ironlog_sync_url','${SYNC}');'ok'`);
    await p.go(APP); await p.wait(400);
    const today = await p.ev('lday(new Date())');
    const banner = () => p.ev(`(function(){var w=document.querySelector('#ins-sec .al-wrap');if(!w)return null;return {ids:[].map.call(w.querySelectorAll('.al'),function(e){return e.dataset.id;}),
      kinds:[].map.call(w.querySelectorAll('.al'),function(e){return e.classList.contains('warn')?'warn':e.classList.contains('info')?'info':'pos';}),
      acts:[].map.call(w.querySelectorAll('.al'),function(e){var b=e.querySelector('.al-b');return b?b.textContent:null;}),
      more:(w.querySelector('.al-more')||{}).textContent||null,all:buildAlerts(gd()).map(function(a){return a.id;})};})()`);

    // ── Up to 3 alerts, most important first, then "+N more" ──
    let b = await banner();
    for (const id of ['neg:Shoulders/Rear', 'goal:gB', 'core', 'pr:' + IN + ':' + await p.ev(`alMon(lday(new Date()))`)]) assert.ok(b.all.includes(id), id + ' in ' + b.all);
    assert.strictEqual(b.ids.length, 3, 'three shown');
    assert.deepStrictEqual(b.ids, b.all.slice(0, 3), 'in priority order');
    assert.strictEqual(b.ids[0], 'neg:Shoulders/Rear');
    assert.strictEqual(b.more, '+' + (b.all.length - 3) + ' more');
    assert.strictEqual(await p.ev(`document.querySelector('.al[data-id="neg:Shoulders/Rear"] .al-s').textContent`), 'No sets in 23 days (usually every 9). ' + FP);
    assert.strictEqual(b.acts[0], 'Start Upper Pull');
    assert.deepStrictEqual(await p.ev(`[].slice.call(document.querySelectorAll('.al-b,.al-x,.al-more')).filter(function(e){var r=e.getBoundingClientRect();return r.height<36||(e.classList.contains('al-x')&&r.width<36);}).map(function(e){return e.className;})`), [], 'tap targets at least 36px');
    // Sits between the Today card and the core chip; the old insights (range buttons, one random tip) are gone
    assert.ok(await p.ev(`(function(){var t=document.getElementById('today-sec'),i=document.getElementById('ins-sec'),c=document.getElementById('abs-sec');return t.nextElementSibling===i&&i.nextElementSibling===c&&!!t.innerHTML&&!!c.innerHTML;})()`));
    assert.deepStrictEqual(await p.ev(`[document.querySelectorAll('.ins-range,.ins-x').length,sessionStorage.getItem('ins_idx'),typeof genIns]`), [0, null, 'undefined']);
    await p.ev(`document.getElementById('s-home').scrollTop=0;'ok'`); await shot('01-banner.png');
    step('up to 3 alerts in priority order, then "+N more"');

    // ── Expand and collapse ──
    await p.ev(`document.querySelector('.al-more').click();'ok'`); await p.wait(100);
    b = await banner();
    assert.deepStrictEqual([b.ids, b.more], [b.all, 'Show less']);
    await shot('02-banner-expanded.png');
    await p.ev(`document.querySelector('.al-more').click();'ok'`); await p.wait(100);
    b = await banner(); assert.strictEqual(b.ids.length, 3);
    step('"+N more" expands to every alert and "Show less" folds them back');

    // ── Actions (expanded, so every alert's button is on screen) ──
    await p.ev(`ALX=true;rAlerts();document.querySelector('.al[data-id="neg:Shoulders/Rear"] .al-b').click();'ok'`); await p.wait(300);
    assert.deepStrictEqual(await p.ev(`[document.getElementById('s-wk').classList.contains('active'),CW]`), [true, 'Upper Pull'], 'Start opens that workout');
    await p.ev(`clDr();goHome();'ok'`); await p.wait(200);
    await p.ev(`document.querySelector('.al[data-id="goal:gB"] .al-b').click();'ok'`); await p.wait(300);
    assert.deepStrictEqual(await p.ev(`[document.getElementById('s-goals').classList.contains('active'),document.getElementById('mov-goal').classList.contains('active'),document.getElementById('goal-m').dataset.id]`), [true, true, 'gB'], 'View goal opens it');
    await p.ev(`closeGoalM();switchTab('home');'ok'`); await p.wait(200);
    await p.ev(`document.querySelector('.al[data-id^="pr:"] .al-b').click();'ok'`); await p.wait(400);
    assert.deepStrictEqual(await p.ev(`[document.getElementById('s-prog').classList.contains('active'),PGX,getComputedStyle(document.getElementById('pg-bk')).display]`), [true, IN, 'flex'], 'See progress opens the exercise');
    await p.ev(`pgBack();switchTab('home');'ok'`); await p.wait(200);
    await p.ev(`document.querySelector('.al[data-id="core"] .al-b').click();'ok'`); await p.wait(300);
    assert.ok(await p.ev(`document.getElementById('mov-core').classList.contains('active')`), 'Log core opens today\'s core');
    await p.ev(`document.getElementById('mov-core').classList.remove('active');ALX=false;rHome();'ok'`);
    step('actions: Start the workout, View goal, See progress, Log core');

    // ── Snooze: hidden until tomorrow, on this device only ──
    await p.ev(`document.querySelector('.al[data-id="neg:Shoulders/Rear"] .al-x').click();'ok'`); await p.wait(100);
    b = await banner();
    assert.ok(!b.ids.includes('neg:Shoulders/Rear') && b.all.includes('neg:Shoulders/Rear'), 'hidden, though still true');
    assert.strictEqual(await p.ev(`document.getElementById('toast').textContent`), 'Hidden until tomorrow');
    assert.deepStrictEqual(await p.ev(`JSON.parse(localStorage.getItem('ironlog_snooze'))`), { 'neg:Shoulders/Rear': today });
    await shot('03-snoozed.png');
    await p.go(APP); await p.wait(400);
    assert.ok(!(await banner()).ids.includes('neg:Shoulders/Rear'), 'stays hidden after a reload');
    await p.ev(`new Promise(function(r){csync(r);})`);
    assert.ok(!/snooze/.test(JSON.stringify(await store())), 'snoozes never reach the Sheet');
    await p.ev(`localStorage.setItem('ironlog_snooze',JSON.stringify({'neg:Shoulders/Rear':'2000-01-01'}));rHome();'ok'`);
    assert.strictEqual((await banner()).ids[0], 'neg:Shoulders/Rear', 'back the next day');
    step('snooze hides an alert until tomorrow, survives a reload and stays on the device');

    // ── Alerts clear themselves once the data resolves them ──
    await p.ev(`(function(){var d=gd();coreSet(d,lday(new Date()),true);sd(d);rHome();})();'ok'`);
    assert.ok(!(await banner()).all.includes('core'), 'ticking core clears the core alert');
    // Face pulls logged on another device arrive with the next sync, and the banner rebuilds
    const s = await store();
    s.sessions.push({ id: 'other1', mt: Date.now(), workout: 'Upper Pull', date: justNow, duration: 3000, exercises: { [FP]: [{ kg: 20, reps: 12 }] } });
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`); await p.wait(200);
    b = await banner();
    assert.ok(!b.all.includes('neg:Shoulders/Rear') && !b.ids.includes('neg:Shoulders/Rear'), 'rebuilt after the sync: ' + b.ids);
    step('alerts clear when the data resolves them, including after a sync');

    // ── Rebuilt when the app resumes on a new day, and at midnight ──
    await p.ev(`TDAY='2000-01-01';document.getElementById('ins-sec').innerHTML='';document.dispatchEvent(new Event('visibilitychange'));'ok'`); await p.wait(100);
    assert.ok(await p.ev(`!!document.querySelector('#ins-sec .al')`), 'redrawn on resume');
    const mid = await p.ev(`(function(){var st=window.setTimeout,got=null;window.setTimeout=function(f,ms){got={f:f,ms:ms};return 0;};alMidnight();window.setTimeout=st;
      var n=new Date(),m=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1,0,0,5);document.getElementById('ins-sec').innerHTML='';got.f();
      return {off:Math.abs(got.ms-(m-n)),redrawn:!!document.querySelector('#ins-sec .al')};})()`);
    assert.ok(mid.off < 2000 && mid.redrawn, JSON.stringify(mid));
    step('rebuilt when the app resumes on a new day, and just after midnight');

    // ── Fits at 320 wide ──
    const n = await chrome.page(320, 700); pages.push(n);
    await n.go(APP); await n.wait(400);
    await n.ev(`ALX=true;rAlerts();'ok'`); await n.wait(100);
    assert.deepStrictEqual(await n.ev(`[document.documentElement.scrollWidth<=320,[].slice.call(document.querySelectorAll('.al')).filter(function(e){var r=e.getBoundingClientRect();return r.left<0||r.right>320;}).length]`), [true, 0]);
    await n.shot(path.join(shots, '04-banner-320.png'));
    step('fits at 320 wide');

    // ── Nothing to say: no banner at all ──
    const e = await chrome.page(); pages.push(e);
    await e.go(APP); await e.ev(`localStorage.clear();'ok'`); await e.go(APP); await e.wait(300);
    assert.strictEqual(await e.ev(`document.getElementById('ins-sec').innerHTML`), '');
    step('no data, no banner');

    for (const pg of pages) assert.deepStrictEqual(pg.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('ALERTS SMOKE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
