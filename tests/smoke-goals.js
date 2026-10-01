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
// Your order and the muscle group button: goals saved before either existed (no ord), three of them Back, one on Flat DB
// Press, which its name guesses to Other, and one reached this week that floats to the top
const FDB = 'Flat DB Press', ROW = 'Seated Cable Row', PU = 'Pull-Ups';
const fdb = []; for (let n = 40; n >= 4; n -= 6) fdb.push({ id: 'fdb' + n, mt: 1, workout: 'Upper Push', date: ago(n) + '', duration: 3000, exercises: { [FDB]: [{ kg: 24 + Math.round((40 - n) / 6), reps: 8 }] } });
const ORDER = { sessions: sessions.concat(fdb), workouts: DATA.workouts, lastModified: noon.getTime() - 1000, goals: [
  G('o0', FP, 20, 50, 25, 3, false), G('o1', IN, 40, 60, 65, 4, false), G('o2', LAT, 45, 45, 60, 5, false), G('o3', SQ, 40, 30, 70, 6, false),
  G('o4', FDB, 24, 40, 40, 7, false), G('o5', ROW, 50, 10, 70, 8, false), G('o6', PU, 5, 5, 20, 9, false)] };
const seedOrder = `localStorage.clear();localStorage.setItem('ironlog_data',${JSON.stringify(JSON.stringify(ORDER))});'ok'`;

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

    // The muscle group filter: each chip is [group, label, count, active]
    const chipsOf = pg => pg.ev(`[].map.call(document.querySelectorAll('#glist .gf-c'),function(b){return [b.dataset.g,b.firstChild.textContent,+b.querySelector('em').textContent,b.classList.contains('active')];})`);
    const chips = () => p.ev(`[].map.call(document.querySelectorAll('#glist .gf-c'),function(b){return [b.dataset.g,b.firstChild.textContent,+b.querySelector('em').textContent,b.classList.contains('active')];})`);
    const view = () => p.ev(`({cards:[].map.call(document.querySelectorAll('#glist .gcard'),function(c){return c.dataset.id;}),arc:[].map.call(document.querySelectorAll('.garow'),function(r){return r.dataset.id;}),on:[].map.call(document.querySelectorAll('.gf-c.active'),function(b){return b.dataset.g;})})`);
    const pick = g => p.ev(`document.querySelector('.gf-c[data-g="${g}"]').click();'ok'`);

    // Opening the tab: statuses, and the goal that hit its target is celebrated and archived. It's a Shoulders goal, so a
    // Back filter left on lets go to show it.
    await p.ev(`GF='Back';document.querySelector('.ntab[data-tab="goals"]').click();'ok'`); await p.wait(900);
    assert.strictEqual(await p.ev(`document.querySelector('.screen.active').id`), 's-goals');
    const cards = await p.ev(`[].map.call(document.querySelectorAll('#glist .gcard'),function(c){return [c.dataset.id,c.querySelector('.gchip').className.split(' ')[1],c.classList.contains('won')];})`);
    assert.deepStrictEqual(cards, [['gE', 'done', true], ['gB', 'behind', false], ['gA', 'on', false], ['gC', 'ahead', false]], 'celebrated first, then by target date');
    assert.strictEqual(await p.ev(`document.getElementById('toast').textContent`), '🎉 Goal reached!', 'toast');
    assert.ok(await p.ev(`document.querySelector('.gcard.won').classList.contains('pop')`), 'celebration animation');
    assert.deepStrictEqual(await chips(), [['', 'All', 4, true], ['Chest', 'Chest', 1, false], ['Back', 'Back', 1, false], ['Shoulders', 'Shoulders', 1, false], ['Arms', 'Arms', 0, false], ['Legs', 'Legs', 1, false]], 'a goal reached just now clears the filter');
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

    // Filter by muscle group: a group's active and archived goals; tap it again for all of them
    assert.deepStrictEqual((await chips()).map(c => c[2]), [3, 1, 1, 0, 0, 1], 'counts are active goals');
    await pick('Legs');
    assert.deepStrictEqual(await view(), { cards: ['gC'], arc: ['gD'], on: ['Legs'] });
    assert.strictEqual(await p.ev(`document.querySelector('.gf-c[data-g="Legs"]').getAttribute('aria-pressed')`), 'true');
    await p.ev(`document.getElementById('s-goals').scrollTop=0;'ok'`); await p.shot(path.join(shots, '2b-goals-legs.png'));
    await pick('Chest');
    assert.deepStrictEqual(await view(), { cards: ['gA'], arc: ['gF'], on: ['Chest'] });
    await pick('Chest');
    assert.deepStrictEqual(await view(), { cards: ['gB', 'gA', 'gC'], arc: ['gE', 'gD', 'gF'], on: [''] }, 'tapping it again shows all');
    // A group with nothing active says so, and the filter stays while you're on another tab
    await pick('Shoulders');
    assert.deepStrictEqual(await view(), { cards: [], arc: ['gE'], on: ['Shoulders'] });
    assert.strictEqual(await p.ev(`document.querySelector('.gempty h3').textContent`), 'No active goals for Shoulders');
    await p.shot(path.join(shots, '2c-goals-empty-group.png'));
    await p.ev(`switchTab('home');switchTab('goals');'ok'`);
    assert.deepStrictEqual((await view()).on, ['Shoulders']);
    // A muscle group you picked in Progress moves the goal with it
    await p.ev(`setMuscle('Dips','Shoulders/Front');rGoals();'ok'`);
    assert.deepStrictEqual((await view()).arc, ['gE', 'gF']);
    await p.ev(`setMuscle('Dips',null);'ok'`); await pick('');
    assert.deepStrictEqual(await view(), { cards: ['gB', 'gA', 'gC'], arc: ['gE', 'gD', 'gF'], on: [''] });
    step('filter by muscle group: counts, active and archived, an empty group, your own muscle picks');

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

    // New goal: type-ahead, start kg from the best top set of the last 14 days, 6 months, saved and synced. It's a Legs
    // goal set while filtered to Chest, so the filter clears to show it.
    await pick('Chest');
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
    assert.deepStrictEqual((await view()).on, [''], 'a new goal outside the filter clears it');
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

    // ── Your order: drag ⠿, also inside a muscle group filter ──
    const o = await chrome.page(); pages.push(o);
    await o.go(APP); await o.ev(seedOrder + `;sTheme('light');'ok'`); await o.go(APP);
    const oshot = f => o.shot(path.join(shots, f));
    const ov = () => o.ev(`({won:[].map.call(document.querySelectorAll('#glist > .gcard'),function(c){return c.dataset.id;}),cards:[].map.call(document.querySelectorAll('#gact .gcard'),function(c){return c.dataset.id;}),
      handles:[].map.call(document.querySelectorAll('#glist .gdrag'),function(h){return h.closest('.gcard').dataset.id;}),on:[].map.call(document.querySelectorAll('#glist .gf-c.active'),function(b){return b.dataset.g;})})`);
    const oc = sel => o.ev(`(function(){var r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,top:r.top};})()`);
    const mouse = (type, x, y) => o.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    // A real drag with the mouse: press on ⠿, move in small steps to just inside the top of the target card, release.
    // during() runs mid-drag, with the lifted card under the pointer.
    const odrag = async (id, toId, during) => {
      await o.ev(`(function(){var s=document.getElementById('s-goals');s.scrollTop+=document.querySelector('.gcard[data-id="${toId}"]').getBoundingClientRect().top-140;})();'ok'`); await o.wait(100);
      const a = await oc(`.gcard[data-id="${id}"] .gdrag`), b = await oc(`.gcard[data-id="${toId}"]`), ty = b.top + 14;
      await mouse('mousePressed', a.x, a.y); await o.wait(50);
      for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', a.x, a.y + (ty - a.y) * i / 14); await o.wait(30); }
      if (during) await during();
      await mouse('mouseReleased', a.x, ty); await o.wait(400);
    };
    const ords = () => o.ev(`gGoals().filter(function(g){return 'ord' in g;}).map(function(g){return g.id;}).sort()`);
    await o.ev(`switchTab('goals');'ok'`); await o.wait(900);
    // Goals never dragged keep the target-date order; the one reached just now is on top, with nothing to drag it by
    assert.deepStrictEqual(await ov(), { won: ['o0'], cards: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'], handles: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'], on: [''] });
    const hb = await o.ev(`(function(){var h=document.querySelector('.gcard[data-id="o1"] .gdrag').getBoundingClientRect(),c=document.querySelector('.gcard[data-id="o1"]').getBoundingClientRect(),n=document.querySelector('.gcard[data-id="o1"] .gc-name').getBoundingClientRect();
      return {w:h.width,h:h.height,inCard:h.right<=c.right&&h.top>=c.top,clear:n.right<=h.left,ta:getComputedStyle(document.querySelector('.gdrag')).touchAction};})()`);
    assert.ok(hb.w >= 40 && hb.h >= 44 && hb.inCard && hb.clear && hb.ta === 'none', 'handle: a 40×44 target inside the card ' + JSON.stringify(hb));
    // Tapping ⠿ doesn't open the goal; tapping the card still does
    await o.ev(`document.querySelector('.gcard[data-id="o2"] .gdrag').click();'ok'`);
    assert.strictEqual(await o.ev(`document.getElementById('mov-goal').classList.contains('active')`), false, 'handle tap opens nothing');
    // With Back on: Lat Pulldown, Seated Cable Row and Pull-Ups, in the one order
    await o.ev(`document.querySelector('#glist .gf-c[data-g="Back"]').click();'ok'`);
    assert.deepStrictEqual((await ov()).cards, ['o2', 'o5', 'o6']);
    await o.ev(`document.getElementById('toast').classList.remove('show');'ok'`); await o.wait(450); await oshot('11-back-before.png');
    // Drag Pull-Ups to the top of Back. A sync landing mid-drag must not redraw the list under the finger.
    await o.ev(`document.getElementById('gact').dataset.mark='1';'ok'`);
    await odrag('o6', 'o2', async () => {
      assert.strictEqual(await o.ev(`!!document.querySelector('.gcard.sortable-fallback')&&GDRAG`), true, 'dragging');
      await o.ev(`refreshView();rGoals();'ok'`);
      assert.strictEqual(await o.ev(`document.getElementById('gact').dataset.mark`), '1', 'not redrawn mid-drag');
      await oshot('12-back-dragging.png');
    });
    assert.strictEqual(await o.ev(`document.getElementById('mov-goal').classList.contains('active')`), false, 'the drop opens nothing');
    assert.strictEqual(await o.ev(`document.getElementById('gact').dataset.mark`), undefined, 'redrawn after the drop');
    assert.deepStrictEqual((await ov()).cards, ['o6', 'o2', 'o5'], 'Pull-Ups on top of Back');
    assert.deepStrictEqual(await ords(), ['o6'], 'only Pull-Ups saved');
    await oshot('13-back-after.png');
    // All: Pull-Ups sits just above Lat Pulldown, the goal it was dropped above; the rest keep their places
    await o.ev(`document.querySelector('#glist .gf-c[data-g=""]').click();'ok'`);
    assert.deepStrictEqual((await ov()).cards, ['o1', 'o6', 'o2', 'o3', 'o4', 'o5']);
    // In All, Flat DB Press to the very top (under the reached goal, which stays first), then a tap opens a goal as usual
    // In All, Flat DB Press from low in the list to the very top: holding it over the header scrolls the list up. It lands
    // under the reached goal, which stays first.
    await o.ev(`(function(){var s=document.getElementById('s-goals');s.scrollTop+=document.querySelector('.gcard[data-id="o4"]').getBoundingClientRect().top-560;})();'ok'`); await o.wait(100);
    const h4 = await oc(`.gcard[data-id="o4"] .gdrag`), st0 = await o.ev(`document.getElementById('s-goals').scrollTop`);
    assert.ok(st0 > 200, 'scrolled down ' + st0);
    await mouse('mousePressed', h4.x, h4.y); await o.wait(50);
    for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', h4.x, h4.y + (50 - h4.y) * i / 14); await o.wait(30); }
    for (let i = 0; i < 40 && await o.ev(`document.getElementById('s-goals').scrollTop`) > 0; i++) { await mouse('mouseMoved', h4.x + (i % 2), 50); await o.wait(100); }
    assert.strictEqual(await o.ev(`document.getElementById('s-goals').scrollTop`), 0, 'autoscrolled to the top');
    const t1 = (await oc(`.gcard[data-id="o1"]`)).top + 14;
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', h4.x, 50 + (t1 - 50) * i / 6); await o.wait(40); }
    await mouse('mouseReleased', h4.x, t1); await o.wait(400);
    assert.deepStrictEqual(await ov(), { won: ['o0'], cards: ['o4', 'o1', 'o6', 'o2', 'o3', 'o5'], handles: ['o4', 'o1', 'o6', 'o2', 'o3', 'o5'], on: [''] });
    assert.deepStrictEqual(await ords(), ['o4', 'o6']);
    await o.wait(400); await o.ev(`document.getElementById('s-goals').scrollTop=0;document.querySelector('.gcard[data-id="o3"]').click();'ok'`);
    assert.strictEqual(await o.ev(`document.getElementById('goal-m').dataset.id`), 'o3', 'a tap still opens the goal'); await o.ev(`closeGoalM();'ok'`);
    // One goal on screen: nothing to drag
    await o.ev(`document.querySelector('#glist .gf-c[data-g="Legs"]').click();'ok'`);
    assert.deepStrictEqual(await ov(), { won: [], cards: ['o3'], handles: [], on: ['Legs'] });
    await o.ev(`document.querySelector('#glist .gf-c[data-g="Legs"]').click();'ok'`);
    // The order syncs on the goals themselves, survives a reload, and a new goal goes to the bottom whatever its date
    await fetch(SYNC + '__store', { method: 'PUT', body: 'null' });
    await o.ev(`sSyncUrl('${SYNC}');new Promise(function(r){csync(r);})`);
    s = await store();
    assert.deepStrictEqual(s.goals.filter(g => 'ord' in g).map(g => g.id).sort(), ['o4', 'o6'], 'ord synced');
    await o.ev(`sSyncUrl('');'ok'`); await o.go(APP); await o.ev(`switchTab('goals');'ok'`); await o.wait(300);
    assert.deepStrictEqual((await ov()).cards, ['o4', 'o1', 'o6', 'o2', 'o3', 'o5'], 'after a reload');
    await o.ev(`document.getElementById('btn-gnew').click();var i=document.getElementById('gn-ex');i.value='${CALF}';i.dispatchEvent(new Event('change'));var t=document.getElementById('gn-t');t.value=+document.getElementById('gn-s').value+10;t.dispatchEvent(new Event('input'));document.getElementById('gn-save').click();'ok'`); await o.wait(200);
    const nid = await o.ev(`gGoals().filter(function(g){return g.exercise===${JSON.stringify(CALF)};})[0].id`);
    assert.deepStrictEqual((await ov()).cards, ['o4', 'o1', 'o6', 'o2', 'o3', 'o5', nid], 'new goal at the bottom, though its date is the earliest but one');
    step('your order: drag ⠿ in All and inside a filter, one goal saved, synced, new goals last, no redraw mid-drag');

    // ── Muscle group button on a goal's sheet: the Progress picker, stacked over it ──
    await o.ev(`document.querySelector('#glist .gf-c[data-g="Other"]').click();'ok'`);
    assert.deepStrictEqual((await ov()).cards, ['o4'], 'Flat DB Press guesses to Other');
    await o.ev(`document.querySelector('.gcard[data-id="o4"]').click();'ok'`); await o.wait(400);
    const gm = await o.ev(`(function(){var b=document.getElementById('gd-mus'),r=b.getBoundingClientRect();return {t:b.textContent,h:r.height,cls:b.className};})()`);
    assert.deepStrictEqual([gm.t, gm.cls], ['Other ✎', 'pg-mus gd-mus']); assert.ok(gm.h >= 36, 'tap target');
    await o.ev(`document.getElementById('toast').classList.remove('show');'ok'`); await o.wait(450); await oshot('14-goal-muscle.png');
    // Progress was never opened on this page: the picker still opens, cancels and closes on a tap outside, by itself
    assert.strictEqual(await o.ev(`pgBound`), false);
    await o.ev(`document.getElementById('gd-mus').click();'ok'`); await o.wait(200);
    const st = await o.ev(`(function(){var m=document.querySelector('#mov-mus .modal').getBoundingClientRect();
      return {mus:document.getElementById('mov-mus').classList.contains('active'),goal:document.getElementById('mov-goal').classList.contains('active'),
        z:[getComputedStyle(document.getElementById('mov-mus')).zIndex,getComputedStyle(document.getElementById('mov-goal')).zIndex].map(Number),
        hit:!!document.elementFromPoint(m.left+m.width/2,m.top+20).closest('#mov-mus .modal'),top:m.top,bottom:m.bottom,h:innerHeight,
        for:document.getElementById('mus-for').textContent,on:document.querySelectorAll('#mus-opts .pg-mb.on').length};})()`);
    assert.ok(st.mus && st.goal && st.z[0] > st.z[1] && st.hit, 'the picker stacks over the goal sheet ' + JSON.stringify(st));
    assert.ok(st.top > 0 && st.bottom <= st.h, 'fits on screen ' + JSON.stringify(st));
    assert.ok(/^For Flat DB Press\. Guessed from its name: Other\.$/.test(st.for), st.for); assert.strictEqual(st.on, 0);
    await oshot('15-goal-muscle-picker.png');
    await o.ev(`document.getElementById('mus-cancel').click();'ok'`);
    assert.deepStrictEqual(await o.ev(`[document.getElementById('mov-mus').classList.contains('active'),document.getElementById('mov-goal').classList.contains('active')]`), [false, true], 'Cancel closes the picker only');
    await o.ev(`document.getElementById('gd-mus').click();'ok'`); await mouse('mousePressed', 200, 20); await mouse('mouseReleased', 200, 20); await o.wait(100);
    assert.deepStrictEqual(await o.ev(`[document.getElementById('mov-mus').classList.contains('active'),document.getElementById('mov-goal').classList.contains('active')]`), [false, true], 'a tap above it closes the picker only');
    // Chest · Middle: saved per exercise, the sheet and the list follow, and Other (now empty) lets the filter go
    await o.ev(`document.getElementById('gd-mus').click();document.querySelector('#mus-opts .pg-mb[data-m="Chest/Middle"]').click();'ok'`); await o.wait(250);
    const af = await o.ev(`({m:gd().muscles[${JSON.stringify(FDB)}],sheet:document.getElementById('mov-goal').classList.contains('active'),id:document.getElementById('goal-m').dataset.id,btn:document.getElementById('gd-mus').textContent,
      toast:document.getElementById('toast').textContent,chart:!!GCI,ord:gGoals().filter(function(g){return g.id==='o4';})[0].ord})`);
    assert.deepStrictEqual(af, { m: 'Chest/Middle', sheet: true, id: 'o4', btn: 'Chest · Middle ✎', toast: 'Now in Chest · Middle', chart: true, ord: af.ord });
    assert.deepStrictEqual(await chipsOf(o), [['', 'All', 7, true], ['Chest', 'Chest', 2, false], ['Back', 'Back', 3, false], ['Shoulders', 'Shoulders', 0, false], ['Arms', 'Arms', 0, false], ['Legs', 'Legs', 2, false]], 'Other gone, Chest +1');
    await o.ev(`closeGoalM();document.querySelector('#glist .gf-c[data-g="Chest"]').click();'ok'`);
    assert.deepStrictEqual((await ov()).cards, ['o4', 'o1'], 'in Chest, at its place in your order');
    // Moving a goal out of a group that still has others shows them all, as a new goal outside the filter does
    await o.ev(`document.querySelector('.gcard[data-id="o1"]').click();document.getElementById('gd-mus').click();document.querySelector('#mus-opts .pg-mb[data-m="Shoulders/Front"]').click();'ok'`); await o.wait(250);
    assert.deepStrictEqual((await ov()).on, [''], 'filter lets go'); assert.strictEqual(await o.ev(`document.getElementById('goal-m').dataset.id`), 'o1');
    // Picking the guess again drops the override, and Progress shows the same pick
    await o.ev(`document.getElementById('gd-mus').click();document.querySelector('#mus-opts .pg-mb[data-m="Chest/Upper"]').click();closeGoalM();'ok'`);
    assert.strictEqual(await o.ev(`${JSON.stringify(IN)} in gd().muscles`), false);
    await o.ev(`switchTab('progress');'ok'`); await o.wait(500); await o.ev(`pgOpen(${JSON.stringify(FDB)});'ok'`); await o.wait(300);
    assert.strictEqual(await o.ev(`document.getElementById('pg-mus').textContent`), 'Chest · Middle ✎', 'one setting, shared with Progress');
    step('goal sheet: muscle group button opens the Progress picker over it; saved per exercise, list and chips follow');

    // Dark: the sheet with the picker over it, and Back after the drag
    await o.ev(`sTheme('dark');switchTab('goals');document.querySelector('#glist .gf-c[data-g="Back"]').click();document.getElementById('toast').classList.remove('show');'ok'`); await o.wait(450);
    await oshot('16-back-after-dark.png');
    await o.ev(`document.querySelector('.gcard[data-id="o6"]').click();'ok'`); await o.wait(400); await oshot('17-goal-muscle-dark.png');
    await o.ev(`document.getElementById('gd-mus').click();'ok'`); await o.wait(200); await oshot('18-goal-muscle-picker-dark.png');
    await o.ev(`document.getElementById('mus-cancel').click();closeGoalM();sTheme('auto');'ok'`);
    step('dark mode');

    // Empty state
    const e = await chrome.page(); pages.push(e);
    await e.go(APP); await e.ev(SEED); await e.go(APP);
    await e.ev(`switchTab('goals');'ok'`); await e.wait(300);
    assert.strictEqual(await e.ev(`document.querySelector('.gempty h3').textContent`), 'No goals yet');
    assert.strictEqual(await e.ev(`document.querySelectorAll('.gf').length`), 0, 'no filter without goals');
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
    assert.strictEqual(await n.ev(`[].every.call(document.querySelectorAll('.gf-c'),function(b){var r=b.getBoundingClientRect();return r.right<=innerWidth-16&&r.height>=36;})`), true, 'filter chips wrap inside the screen');
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
