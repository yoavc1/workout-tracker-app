// End-to-end test of the Goals tab in headless Chrome at iPhone size (393x852), and at 320 wide, against a mock sync server.
// Usage: node tests/smoke-goals.js   (set CHROME=/path/to/chrome if it isn't in /Applications)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

// Synthetic history relative to today: noon N days ago, one top set per exercise per session
const DAY = 864e5, noon = new Date(); noon.setHours(12, 0, 0, 0);
const ago = n => new Date(noon.getTime() - n * DAY).toISOString();
const lday = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addM = (day, n) => { const [y, m, d] = day.split('-').map(Number), t = new Date(y, m - 1 + n, 1); t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return lday(t); };
const IN = 'Incline Chest Press (Smith/Machine)', LAT = 'Lat Pulldown Machine (Uni Lateral)', SQ = 'Squat - Dumbbell', LE = 'Seated Machine Leg Extension', FP = 'Cable Face Pulls', CALF = 'Calf Raise - Seated';
const sessions = [];
const add = (n, workout, ex) => sessions.push({ id: 'seed' + n + workout, mt: 1, workout, date: ago(n), duration: 3000, exercises: Object.fromEntries(Object.entries(ex).map(([k, kg]) => [k, [{ kg, reps: 8 }, { kg: Math.max(0, kg - 5), reps: 10 }]])) });
for (let n = 100, i = 0; n >= 2; n -= 4, i++) {
  const w = i % 3, t = 1 - n / 100;                                  // t: 0 → 1 over the last 100 days
  if (w === 0) add(n, 'Upper Push', { [IN]: 35 + Math.round(t * 6) * 2.5, Dips: 0 });
  if (w === 1) add(n, 'Upper Pull', { [LAT]: 45, [FP]: n <= 12 ? 25 : 20 });
  if (w === 2) add(n, 'Legs', { [SQ]: 30 + Math.round(t * 10) * 2.5, [LE]: n <= 26 ? 75 : 65, [CALF]: 50 + Math.round(t * 4) * 2.5 });
}
const G = (id, exercise, startKg, startAgo, targetKg, months, archived) => { const sd = lday(noon.getTime() - startAgo * DAY); return { id, mt: 1, exercise, startKg, startDate: sd, targetKg, targetDate: addM(sd, months), archived }; };
const goals = [
  G('gA', IN, 40, 60, 65, 6, false),   // on track
  G('gB', LAT, 45, 45, 60, 3, false),  // behind: flat at 45
  G('gC', SQ, 40, 30, 70, 6, false),   // ahead
  G('gD', LE, 60, 70, 75, 3, true),    // reached earlier, archived
  G('gE', FP, 20, 50, 25, 3, false),   // hit 25 kg this week: celebrated and archived when the tab opens
  G('gF', 'Dips', 10, 90, 20, 3, true) // given up on, archived
];
const DATA = { sessions, workouts: { 'Upper Push': [IN, 'Dips'], 'Upper Pull': [LAT, FP], Legs: [SQ, LE, CALF] }, goals, lastModified: noon.getTime() - 1000 };
const seed = `localStorage.clear();localStorage.setItem('ironlog_data',${JSON.stringify(JSON.stringify(DATA))});'ok'`;

(async () => {
  const root = path.join(__dirname, '..');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-goals-'));
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  const pages = [];
  let ok = false;
  try {
    const p = await chrome.page(); pages.push(p);
    await p.go(APP); await p.ev(seed); await p.go(APP);

    // Nav: four tabs in order, each label fully visible and a comfortable tap target
    const nav = async (pg) => pg.ev(`(function(){var n=document.getElementById('nav').getBoundingClientRect();return {w:innerWidth,right:document.getElementById('nav-plus').getBoundingClientRect().right,bottom:n.bottom,h:innerHeight,
      tabs:[].map.call(document.querySelectorAll('.ntab'),function(t){var r=t.getBoundingClientRect();return {l:t.textContent.trim(),w:r.width,h:r.height,clip:t.scrollWidth>t.clientWidth};})};})()`);
    let nv = await nav(p);
    assert.deepStrictEqual(nv.tabs.map(t => t.l), ['Workouts', 'Progress', 'Goals', 'History']);
    assert.ok(nv.tabs.every(t => t.w >= 44 && t.h >= 36 && !t.clip), 'tabs fit ' + JSON.stringify(nv.tabs));
    assert.ok(nv.right <= nv.w && nv.bottom <= nv.h, 'nav and + button on screen');
    step('nav has four tabs that fit at 393 wide');

    // Opening the tab: statuses, and the goal that hit its target is celebrated and archived
    await p.ev(`document.querySelector('.ntab[data-tab="goals"]').click();'ok'`); await p.wait(900);
    assert.strictEqual(await p.ev(`document.querySelector('.screen.active').id`), 's-goals');
    const cards = await p.ev(`[].map.call(document.querySelectorAll('#glist .gcard'),function(c){return [c.dataset.id,c.querySelector('.gchip').className.split(' ')[1],c.classList.contains('won')];})`);
    assert.deepStrictEqual(cards, [['gE', 'done', true], ['gB', 'behind', false], ['gA', 'on', false], ['gC', 'ahead', false]], 'celebrated first, then by target date');
    assert.strictEqual(await p.ev(`document.getElementById('toast').textContent`), '🎉 Goal reached!', 'toast');
    assert.ok(await p.ev(`document.querySelector('.gcard.won').classList.contains('pop')`), 'celebration animation');
    assert.strictEqual(await p.ev(`gGoals().filter(function(g){return g.id==='gE'})[0].archived`), true, 'reached goal archived');
    // The card shows goalStatus's numbers
    const a = await p.ev(`(function(){var g=gGoals().filter(function(g){return g.id==='gA'})[0],s=goalStatus(g,gd());var b=[].map.call(document.querySelectorAll('.gcard[data-id="gA"] .gstats b'),function(x){return x.textContent;});return {b:b,exp:gKg(s.exp),cur:gKg(s.cur),wk:'+'+gKg(s.perWk),m:document.querySelector('.gcard[data-id="gA"] .gbar-m').style.left,e:s.expPct};})()`);
    assert.deepStrictEqual(a.b, [a.cur, a.exp, a.wk]); assert.strictEqual(parseFloat(a.m), Math.round(a.e * 1000) / 10);
    assert.strictEqual(await p.ev(`document.getElementById('s-goals').scrollWidth<=innerWidth`), true, 'no sideways scroll');
    await p.shot(path.join(shots, '1-goals.png'));
    step('goal cards show status, pace and kg/week; a reached goal celebrates and archives');

    // Archived goals stay viewable in a collapsed section
    assert.strictEqual(await p.ev(`getComputedStyle(document.querySelector('.garch-b')).display`), 'none', 'collapsed');
    await p.ev(`document.querySelector('.garch-h').click();document.getElementById('s-goals').scrollTop=1e5;'ok'`); await p.wait(200);
    const arc = await p.ev(`[].map.call(document.querySelectorAll('.garow'),function(r){return [r.dataset.id,r.querySelector('.garow-st').textContent];})`);
    assert.deepStrictEqual(arc.map(r => r[0]), ['gD', 'gF']);
    assert.ok(/^🎉 Reached/.test(arc[0][1]) && arc[1][1] === 'Archived', JSON.stringify(arc));
    await p.shot(path.join(shots, '2-goals-archived.png'));
    // Reopening the tab moves the celebrated goal into Archived, without a second toast
    await p.ev(`switchTab('home');document.querySelector('.ntab[data-tab="goals"]').click();'ok'`); await p.wait(300);
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#glist .gcard'),function(c){return c.dataset.id;})`), ['gB', 'gA', 'gC']);
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('.garow'),function(r){return r.dataset.id;})`), ['gE', 'gD', 'gF']);
    step('archived section: collapsed, viewable, and the celebrated goal joins it');

    // Detail: chart of top sets with the pace line, in theme colours
    await p.ev(`document.getElementById('s-goals').scrollTop=0;document.querySelector('.gcard[data-id="gA"]').click();'ok'`); await p.wait(400);
    const det = await p.ev(`(function(){var cs=getComputedStyle(document.documentElement),ds=GCI.data.datasets,m=document.getElementById('goal-m').getBoundingClientRect();
      return {open:document.getElementById('mov-goal').classList.contains('active'),labels:ds.map(function(x){return x.label}),pace:ds[2].borderColor,blue:cs.getPropertyValue('--blue').trim(),
        top:ds[3].borderColor,t1:cs.getPropertyValue('--t1').trim(),pts:ds[3].data.length,paceY:ds[2].data.slice(0,2).map(function(q){return q.y}),
        ticks:GCI.scales.x.ticks.map(function(t){return t.label}),mTop:m.top,mBottom:m.bottom,h:innerHeight};})()`);
    assert.ok(det.open); assert.deepStrictEqual(det.labels, ['hi', 'lo', 'Pace', 'Top set', 'Pace today']);
    assert.strictEqual(det.pace, det.blue, 'pace line colour from --blue'); assert.strictEqual(det.top, det.t1, 'points from --t1');
    assert.ok(det.pts >= 5, 'top sets plotted'); assert.deepStrictEqual(det.paceY, [40, 65]);
    assert.ok(det.ticks.length >= 4 && det.ticks.every(l => /^[A-Z][a-z]{2,3}( '\d\d)?$/.test(l)), 'month ticks ' + det.ticks);
    assert.ok(det.mTop >= 0 && det.mBottom <= det.h, 'sheet fits on screen');
    await p.shot(path.join(shots, '3-goal-detail.png'));
    await p.ev(`document.getElementById('gd-close').click();'ok'`);
    assert.strictEqual(await p.ev(`document.getElementById('mov-goal').classList.contains('active')||GCI!==null`), false, 'closes and frees the chart');
    step('detail chart: top sets, pace line and band, colours from CSS variables');

    // Archive and restore from the detail sheet
    await p.ev(`document.querySelector('.gcard[data-id="gB"]').click();document.getElementById('gd-arc').click();'ok'`);
    assert.strictEqual(await p.ev(`gGoals().filter(function(g){return g.id==='gB'})[0].archived`), true);
    await p.ev(`document.querySelector('.garow[data-id="gB"]').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`document.getElementById('gd-arc').textContent`), 'Restore');
    await p.ev(`document.getElementById('gd-arc').click();'ok'`);
    assert.strictEqual(await p.ev(`gGoals().filter(function(g){return g.id==='gB'})[0].archived`), false);
    await p.ev(`document.querySelector('.garow[data-id="gE"]').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`!!document.getElementById('gd-arc')`), false, 'a reached goal has nothing to restore');
    await p.shot(path.join(shots, '4-goal-reached-detail.png'));
    await p.ev(`closeGoalM();'ok'`);
    step('archive and restore');

    // Delete needs a second tap and leaves a tombstone for sync
    await p.ev(`document.querySelector('.gcard[data-id="gC"]').click();document.getElementById('gd-del').click();'ok'`);
    assert.strictEqual(await p.ev(`gGoals().some(function(g){return g.id==='gC'})`), true, 'one tap does not delete');
    await p.ev(`document.getElementById('gd-del').click();'ok'`);
    assert.strictEqual(await p.ev(`gGoals().some(function(g){return g.id==='gC'})||!gd().deleted.gC`), false);
    assert.strictEqual(await p.ev(`!!document.querySelector('.gcard[data-id="gC"]')`), false);
    step('two-tap delete');

    // New goal: type-ahead, start kg from the best top set of the last 14 days, 6 months, saved and synced
    await p.ev(`sSyncUrl('${SYNC}');document.getElementById('btn-gnew').click();var i=document.getElementById('gn-ex');i.focus();i.value='calf';i.dispatchEvent(new Event('input'));'ok'`); await p.wait(200);
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#goal-m .ta-i'),function(b){return b.textContent;})`), [CALF]);
    await p.shot(path.join(shots, '5-new-goal-typeahead.png'));
    await p.ev(`document.querySelector('#goal-m .ta-i').click();'ok'`);
    const pre = await p.ev(`({s:document.getElementById('gn-s').value,best:bestRecent(${JSON.stringify(CALF)},14).kg,hint:document.getElementById('gn-hint').textContent})`);
    assert.strictEqual(+pre.s, pre.best, 'start kg = bestRecent(name, 14)'); assert.ok(/last 2 weeks/.test(pre.hint));
    const target = +pre.s + 10, today = lday(Date.now()), six = addM(today, 6);
    await p.ev(`var t=document.getElementById('gn-t');t.value='${target}';t.dispatchEvent(new Event('input'));document.querySelector('#gn-by [data-m="6"]').click();'ok'`);
    assert.ok((await p.ev(`document.getElementById('gn-sum').textContent`)).startsWith('By ' + await p.ev(`gFd('${six}')`)), 'summary shows the 6-month date');
    await p.shot(path.join(shots, '6-new-goal.png'));
    await p.ev(`document.getElementById('gn-save').click();'ok'`); await p.wait(200);
    const ng = await p.ev(`gGoals().filter(function(g){return g.exercise===${JSON.stringify(CALF)}})[0]`);
    assert.deepStrictEqual({ e: ng.exercise, s: ng.startKg, sd: ng.startDate, t: ng.targetKg, td: ng.targetDate, a: ng.archived }, { e: CALF, s: +pre.s, sd: today, t: target, td: six, a: false });
    assert.ok(ng.id && ng.mt, 'record fields for merge');
    assert.strictEqual(await p.ev(`document.getElementById('mov-goal').classList.contains('active')`), false);
    assert.ok(await p.ev(`!!document.querySelector('.gcard[data-id="${ng.id}"]')`), 'card shown');
    await p.wait(2600); let s = await store();
    assert.ok(s && s.goals.some(g => g.id === ng.id && g.targetDate === six), 'new goal synced');
    assert.ok(s.goals.find(g => g.id === 'gE').archived && s.deleted.gC, 'archive and delete synced');
    step('new goal via type-ahead: start kg pre-filled, 6 months, saved and synced');

    // Validation, custom date, and typed names matched to logged ones
    await p.ev(`document.getElementById('btn-gnew').click();var i=document.getElementById('gn-ex');i.value='${SQ.toLowerCase()}';i.dispatchEvent(new Event('change'));'ok'`);
    assert.ok(+(await p.ev(`document.getElementById('gn-s').value`)) > 0, 'typed name pre-fills too');
    await p.ev(`var t=document.getElementById('gn-t');t.value='1';t.dispatchEvent(new Event('input'));document.getElementById('gn-save').click();'ok'`);
    assert.strictEqual(await p.ev(`document.getElementById('toast').textContent`), 'Target must be above the start kg');
    await p.ev(`document.querySelector('#gn-by [data-m="0"]').click();'ok'`);
    const cu = await p.ev(`(function(){var di=document.getElementById('gn-date');return {vis:getComputedStyle(di).display!=='none',v:di.value};})()`);
    assert.deepStrictEqual(cu, { vis: true, v: addM(today, 3) }, 'custom starts from the preset date');
    await p.ev(`var di=document.getElementById('gn-date');di.value='${addM(today, 4)}';di.dispatchEvent(new Event('input'));var t=document.getElementById('gn-t');t.value='80';t.dispatchEvent(new Event('input'));document.getElementById('gn-save').click();'ok'`);
    const sq = await p.ev(`gGoals().filter(function(g){return !g.archived&&g.exercise===${JSON.stringify(SQ)}})[0]`);
    assert.ok(sq && sq.targetDate === addM(today, 4) && sq.targetKg === 80, 'custom date saved under the logged name');
    step('validation, custom date and case-insensitive names');

    // A goal added on another device appears after a sync while the tab is open
    s = await store(); s.goals.push({ id: 'other1', mt: Date.now(), exercise: IN, startKg: 30, startDate: today, targetKg: 70, targetDate: addM(today, 6), archived: true });
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`); await p.wait(200);
    assert.ok(await p.ev(`!!document.querySelector('.garow[data-id="other1"]')`), 'refreshView re-renders Goals');
    await p.ev(`sSyncUrl('');'ok'`);
    step('synced goals from another device show up');

    // Empty state
    const e = await chrome.page(); pages.push(e);
    await e.go(APP); await e.ev(SEED); await e.go(APP);
    await e.ev(`switchTab('goals');'ok'`); await e.wait(300);
    assert.strictEqual(await e.ev(`document.querySelector('.gempty h3').textContent`), 'No goals yet');
    await e.shot(path.join(shots, '7-goals-empty.png'));
    await e.ev(`document.getElementById('g-first').click();'ok'`);
    assert.strictEqual(await e.ev(`document.getElementById('mov-goal').classList.contains('active')`), true);
    step('empty state offers a first goal');

    // The narrowest phone: 320 wide
    const n = await chrome.page(320, 568); pages.push(n);
    await n.go(APP); await n.ev(seed); await n.go(APP);
    nv = await nav(n);
    assert.ok(nv.tabs.every(t => t.w >= 44 && t.h >= 36 && !t.clip), 'tabs fit at 320 ' + JSON.stringify(nv.tabs));
    assert.ok(nv.right <= nv.w, '+ button on screen at 320');
    await n.ev(`switchTab('goals');'ok'`); await n.wait(900);
    assert.strictEqual(await n.ev(`document.getElementById('s-goals').scrollWidth<=innerWidth`), true, 'no sideways scroll at 320');
    assert.strictEqual(await n.ev(`[].some.call(document.querySelectorAll('.gstats b, .gchip'),function(b){var r=b.getBoundingClientRect(),c=b.closest('.gcard').getBoundingClientRect();return r.right>c.right-2;})`), false, 'numbers stay inside the card');
    await n.shot(path.join(shots, '8-goals-320.png'));
    await n.ev(`document.querySelector('.gcard[data-id="gA"]').click();'ok'`); await n.wait(400);
    await n.shot(path.join(shots, '9-goal-detail-320.png'));
    step('fits at 320 wide');

    for (const pg of pages) assert.deepStrictEqual(pg.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('GOALS SMOKE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
