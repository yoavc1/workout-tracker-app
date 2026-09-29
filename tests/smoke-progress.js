// End-to-end test of the Progress screen (Track D) in headless Chrome at iPhone size, on six months of seeded data.
// Usage: node tests/smoke-progress.js   (SHOTS=/some/dir keeps the screenshots there)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf } = require('./lib');
const { progressSeed } = require('./progress-seed');

(async () => {
  const root = path.join(__dirname, '..');
  const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'wt-prog-'));
  fs.mkdirSync(shots, { recursive: true });
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }); // headless tabs aren't focused, so focus events wouldn't fire
    const shot = f => p.shot(path.join(shots, f));
    const seed = progressSeed();
    await p.go(APP);
    await p.ev(`localStorage.clear();localStorage.setItem('ironlog_data',${JSON.stringify(JSON.stringify(seed))});localStorage.setItem('ironlog_sync_url','${SYNC}');'ok'`);
    await p.go(APP); await p.wait(500);
    assert.ok((await store()).sessions.length === seed.sessions.length, 'seed pushed to the mock Sheet');
    await p.ev(`switchTab('progress');'ok'`); await p.wait(700);
    const noOverflow = async (what) => {
      const o = await p.ev(`(function(){var s=document.getElementById('s-prog'),w=innerWidth,bad=[].slice.call(s.querySelectorAll('*')).filter(function(e){var r=e.getBoundingClientRect();return r.width&&(r.right>w+0.5||r.left<-0.5);}).map(function(e){return e.className||e.tagName;});return {sw:s.scrollWidth,cw:s.clientWidth,bad:bad.slice(0,5)};})()`);
      assert.ok(o.sw <= o.cw && !o.bad.length, what + ': nothing wider than the screen ' + JSON.stringify(o));
    };

    // ── At a glance: one card per main group, statuses match the stats module ──
    const gl = await p.ev(`(function(){var M=groupStats(exStats(gd(),Date.now()),gd(),Date.now());return {cards:[].slice.call(document.querySelectorAll('.pg-gc')).map(function(c){return [c.dataset.g,c.querySelector('.pg-gt .pg-chip').textContent];}),
      want:M.filter(function(g){return g.main!=='Other';}).map(function(g){return [g.main,PG_LBL[g.status]];}),sub:document.querySelector('.pg-sub').textContent};})()`);
    assert.deepStrictEqual(gl.cards, gl.want);
    assert.deepStrictEqual(gl.cards.map(c => c[0]), ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'], 'muscle order');
    const st = Object.fromEntries(gl.cards);
    assert.strictEqual(st.Chest, 'Progressing'); assert.strictEqual(st.Legs, 'Progressing');
    assert.strictEqual(st.Back, 'Stalled'); assert.strictEqual(st.Arms, 'Stalled', 'one progressing + one regressing is mixed');
    assert.strictEqual(st.Core, 'Not lately', 'no core lifts for 5 weeks');
    assert.ok(/\d+ workouts · \d+ activities/.test(gl.sub), 'activities counted apart: ' + gl.sub);
    assert.ok(await p.ev(`/sets\\/wk/.test(document.querySelector('.pg-gc[data-g="Chest"] .pg-gm').textContent)`), 'sets per week shown');
    await noOverflow('overview');
    await shot('01-glance.png');
    step('at a glance: a status card per muscle group, activities counted separately');

    // Expanding a card shows its sub-groups with their own status
    await p.ev(`document.querySelector('.pg-gc[data-g="Shoulders"] .pg-gh').click();document.querySelector('.pg-gc[data-g="Back"] .pg-gh').click();'ok'`);
    const subs = await p.ev(`[].slice.call(document.querySelectorAll('.pg-gc[data-g="Shoulders"] .pg-sr')).map(function(r){return [r.querySelector('.pg-sn div').textContent,r.querySelector('.pg-chip').textContent];})`);
    assert.deepStrictEqual(subs, [['Front', 'Stalled'], ['Side', 'Progressing'], ['Rear', 'Regressing']]);
    assert.ok(await p.ev(`/Not lately/.test(document.querySelector('.pg-gc[data-g="Back"]').textContent)`), 'Traps (shrugs, 5 weeks ago) not trained lately');
    await p.ev(`(function(){var s=document.getElementById('s-prog');s.scrollTop+=document.querySelector('.pg-gc[data-g="Shoulders"]').getBoundingClientRect().top-72;})();'ok'`); await p.wait(100);
    await noOverflow('expanded groups');
    await shot('02-glance-expanded.png');
    await p.ev(`document.querySelector('.pg-gc[data-g="Back"] .pg-gh').click();'ok'`);
    step('group cards expand to sub-groups');

    // ── Exercises grouped by muscle ──
    const rows = await p.ev(`(function(){var o={};document.querySelectorAll('.pg-xr').forEach(function(r){o[r.dataset.x]={chip:r.querySelector('.pg-chip').textContent,meta:r.querySelector('.pg-xs').textContent,spk:!!r.querySelector('.pg-spk circle'),h:r.getBoundingClientRect().height};});return {o:o,groups:[].slice.call(document.querySelectorAll('.pg-el')).map(function(e){return e.textContent;})};})()`);
    const R = rows.o;
    assert.deepStrictEqual(rows.groups, ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']);
    assert.strictEqual(R['Incline Chest Press (Smith/Machine)'].chip, 'Progressing');
    assert.ok(/kg e1RM.*× 8.*4 wk/.test(R['Incline Chest Press (Smith/Machine)'].meta), 'e1RM, top set and 4-week change: ' + R['Incline Chest Press (Smith/Machine)'].meta);
    assert.strictEqual(R['Machine Chest Flys'].chip, 'Stalled');
    assert.strictEqual(R['Triceps Pulldown - Rope'].chip, 'Regressing');
    assert.strictEqual(R['Cable Face Pulls'].chip, 'Regressing');
    assert.strictEqual(R.Dips.chip, 'Progressing'); assert.ok(/\d+ reps/.test(R.Dips.meta) && !/0 kg/.test(R.Dips.meta), 'bodyweight shows reps: ' + R.Dips.meta);
    assert.strictEqual(R['Pull-Ups'].chip, 'Stalled');
    assert.strictEqual(R['Incline Chest Press Machine'].chip, 'Not lately', 'old name of a renamed exercise');
    assert.ok(!R['Session Complete'] && !R.Swimming, 'activities stay out of the lift list');
    assert.ok(Object.values(R).every(r => r.spk && r.h >= 44), 'every row has a sparkline and is easy to tap');
    assert.deepStrictEqual(await p.ev(`[].slice.call(document.querySelectorAll('.pg-xs,.pg-xn,.pg-gm')).filter(function(e){return e.scrollWidth>e.clientWidth+1;}).map(function(e){return e.textContent;})`), [], 'row text wraps inside its column');
    await p.ev(`document.querySelector('.pg-el').scrollIntoView();'ok'`); await p.wait(100);
    await shot('03-exercises.png');
    await p.ev(`[].slice.call(document.querySelectorAll('.pg-el')).filter(function(e){return e.textContent==='Legs';})[0].scrollIntoView();'ok'`); await p.wait(100);
    await shot('04-exercises-legs.png');
    step('exercises grouped by muscle with e1RM, top set, change, sparkline and status');

    // ── Exercise detail: chart, goal line, sessions table; default range 3M ──
    const listScroll = await p.ev(`document.getElementById('s-prog').scrollTop`);
    await p.ev(`document.querySelector('.pg-xr[data-x="Incline Chest Press (Smith/Machine)"]').click();'ok'`); await p.wait(600);
    let det = await p.ev(`(function(){var c=PCI;return {bk:getComputedStyle(document.getElementById('pg-bk')).display,range:document.querySelector('.pg-rb.active').textContent,
      sets:c.data.datasets.map(function(s){return s.label;}),line:c.data.datasets[0].borderColor,blue:pgCss('--blue'),goal:c.data.datasets[2].borderColor,orange:pgCss('--orange'),dash:c.data.datasets[2].borderDash,
      grid:c.options.scales.x.grid.color,brd:pgCss('--brd'),xmin:c.scales.x.min,xmax:c.scales.x.max,labels:c.scales.x.ticks.map(function(t){return t.label;}),
      tiles:[].slice.call(document.querySelectorAll('.pg-tl')).map(function(e){return e.textContent;}),rows:document.querySelectorAll('.pg-tbl .pg-tr:not(.pg-th)').length,
      goalTxt:document.querySelector('.pg-goal').textContent,why:document.querySelector('.pg-why').textContent,mus:document.getElementById('pg-mus').textContent};})()`);
    assert.strictEqual(det.bk, 'flex', 'back button shown');
    assert.strictEqual(det.range, '3M', 'default range is 3 months');
    assert.deepStrictEqual(det.sets, ['v', 'top', 'goal'], 'e1RM line, top-set points and goal line');
    assert.strictEqual(det.line, det.blue); assert.strictEqual(det.goal, det.orange); assert.strictEqual(det.grid, det.brd);
    assert.deepStrictEqual(det.dash, [6, 4]);
    assert.ok(Math.abs((det.xmax - det.xmin) / 864e5 - 95) < 5, '3M spans about 3 months');
    assert.ok(det.labels.length >= 3 && det.labels.every(l => l && !/\d{4}/.test(l)), '3M axis: month labels ' + det.labels);
    assert.deepStrictEqual(det.tiles, ['e1RM (kg)', 'Best (kg)', 'Top set', '4 weeks']);
    assert.ok(det.rows >= 8, 'recent sessions table');
    assert.deepStrictEqual(await p.ev(`[].slice.call(document.querySelectorAll('.pg-tv')).filter(function(v){return v.scrollWidth>v.clientWidth;}).map(function(v){return v.textContent;})`), [], 'tile values fit');
    assert.ok(/Goal: 53\.75 kg by/.test(det.goalTxt), det.goalTxt);
    assert.ok(/^New best on/.test(det.why)); assert.ok(/Chest · Upper/.test(det.mus));
    await noOverflow('detail');
    await shot('05-detail-goal.png');
    await p.ev(`document.querySelector('.pg-tbl').scrollIntoView({block:'center'});'ok'`); await p.wait(100);
    await shot('06-detail-sessions.png');
    // Tap targets on the detail screen
    const small = await p.ev(`[].slice.call(document.querySelectorAll('#pg-bk,.pg-rb,#pg-mus,#pg-merge,#pg-more')).filter(function(b){return b.getBoundingClientRect().height<36;}).map(function(b){return b.id||b.className;})`);
    assert.deepStrictEqual(small, [], 'buttons at least 36px tall');
    step('detail: e1RM line, top sets, goal pace line, sessions table, 3M default');

    // Colours are read from the theme each time the chart draws (so dark mode can follow)
    await p.ev(`document.documentElement.style.setProperty('--blue','rgb(1, 2, 3)');rProg();'ok'`);
    assert.strictEqual(await p.ev(`PCI.data.datasets[0].borderColor`), 'rgb(1, 2, 3)');
    await p.ev(`document.documentElement.style.removeProperty('--blue');rProg();'ok'`);
    step('chart colours come from CSS variables when it draws');

    // Ranges: All shows the whole history; the year appears only when the range spans two years
    await p.ev(`document.querySelector('.pg-rb[data-r="ALL"]').click();'ok'`); await p.wait(400);
    det = await p.ev(`({labels:PCI.scales.x.ticks.map(function(t){return t.label;}),min:PCI.scales.x.min,max:PCI.scales.x.max,n:PCI.data.datasets[0].data.length,active:document.querySelector('.pg-rb.active').textContent})`);
    assert.strictEqual(det.active, 'All');
    const crosses = new Date(det.min).getFullYear() !== new Date(det.max).getFullYear();
    assert.ok(det.labels.length >= 4 && det.labels.every(l => /’\d\d$/.test(l) === crosses), 'year on labels iff the range spans years: ' + det.labels);
    await p.ev(`document.querySelector('.pg-rb[data-r="1M"]').click();'ok'`); await p.wait(400);
    det = await p.ev(`({labels:PCI.scales.x.ticks.map(function(t){return t.label;}),pts:PCI.data.datasets[1].data.length})`);
    assert.ok(det.labels.length >= 4 && det.labels.every(l => /^\d+ \w+/.test(l)), '1M: weekly day labels ' + det.labels);
    assert.ok(det.pts >= 4 && det.pts <= 5, 'about 4 sessions in a month');
    await p.ev(`document.getElementById('s-prog').scrollTop=0;'ok'`); await p.wait(100);
    await shot('07-detail-1m.png');
    await p.ev(`document.querySelector('.pg-rb[data-r="3M"]').click();'ok'`); await p.wait(300);
    step('range 1M / 3M / 6M / All; year shown only across years');

    // Back to the list, where it was
    await p.ev(`document.getElementById('pg-bk').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`getComputedStyle(document.getElementById('pg-main')).display!=='none'&&PGX===null&&!PCI`), true);
    assert.ok(Math.abs((await p.ev(`document.getElementById('s-prog').scrollTop`)) - listScroll) < 2, 'scroll position restored');
    step('back returns to the list at the same place');

    // ── Bodyweight detail + muscle override ──
    await p.ev(`pgOpen('Dips');'ok'`); await p.wait(500);
    det = await p.ev(`({sets:PCI.data.datasets.map(function(s){return s.label;}),tiles:[].slice.call(document.querySelectorAll('.pg-tl')).map(function(e){return e.textContent;}),y:PCI.data.datasets[0].data.map(function(p){return p.y;}),leg:document.querySelector('.pg-leg').textContent,tick:PCI.scales.y.ticks[0].label})`);
    assert.deepStrictEqual(det.sets, ['v'], 'bodyweight: reps line only, no kg points or goal');
    assert.deepStrictEqual(det.tiles, ['Reps', 'Best', 'Sessions', '4 weeks']);
    assert.ok(det.y.every(v => v > 0), 'reps, never 0 → 0'); assert.ok(/Best reps/.test(det.leg)); assert.ok(!/kg/.test(det.tick));
    await shot('08-detail-bodyweight.png');
    await p.ev(`document.getElementById('pg-mus').click();'ok'`); await p.wait(200);
    const sheet = await p.ev(`(function(){var m=document.querySelector('#mov-mus .modal').getBoundingClientRect();return {on:document.querySelector('#mus-opts .pg-mb.on').dataset.m,bottom:m.bottom,h:innerHeight,top:m.top,small:[].slice.call(document.querySelectorAll('#mus-opts .pg-mb')).filter(function(b){return b.getBoundingClientRect().height<36;}).length};})()`);
    assert.strictEqual(sheet.on, 'Chest/Lower'); assert.ok(sheet.bottom <= sheet.h && sheet.top > 0, 'sheet fits on screen'); assert.strictEqual(sheet.small, 0);
    await shot('09-muscle-picker.png');
    await p.ev(`document.querySelector('#mus-opts .pg-mb[data-m="Arms/Triceps"]').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`gd().muscles.Dips`), 'Arms/Triceps');
    assert.ok(/Arms · Triceps/.test(await p.ev(`document.getElementById('pg-mus').textContent`)));
    await p.ev(`new Promise(function(r){csync(r);})`);
    let s = await store(); assert.strictEqual(s.muscles.Dips, 'Arms/Triceps'); assert.strictEqual(s.muscleMap.Dips, 'Arms/Triceps', 'Sheet muscle column follows');
    await p.ev(`pgBack();'ok'`); await p.wait(100);
    const arms = await p.ev(`[].slice.call(document.querySelectorAll('.pg-gc[data-g="Arms"] .pg-sr')).map(function(r){return r.querySelector('.pg-sx').textContent.split(' · ').sort().join(', ');})`);
    assert.deepStrictEqual(arms, ['Hammer Curl - Dumbbell', 'Dips, Triceps Pulldown - Rope'], 'Dips moved to Arms · Triceps');
    // Picking the guessed group again drops the override instead of storing a copy of the guess
    await p.ev(`pgOpen('Dips');document.getElementById('pg-mus').click();document.querySelector('#mus-opts .pg-mb[data-m="Chest/Lower"]').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`'Dips' in (gd().muscles||{})`), false);
    step('bodyweight detail in reps; muscle override picker saves, syncs and resets');

    // ── Merge into… ──
    // Blocked while an unfinished workout still lists the old name
    await p.ev(`localStorage.setItem('ironlog_draft',JSON.stringify({workout:'Legs',sets:{0:[{kg:'40',reps:'10'}]},ts:Date.now()}));pgOpen('Seated Machine Leg Curl');document.getElementById('pg-merge').click();'ok'`); await p.wait(200);
    await p.ev(`var i=document.getElementById('mg-inp');i.focus();i.value='hamstring';i.dispatchEvent(new Event('input'));'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.querySelector('#mov-merge .ta-i').textContent`), 'Seated Hamstring Curl');
    await p.ev(`document.querySelector('#mov-merge .ta-i').click();document.getElementById('mg-go').click();'ok'`); await p.wait(100);
    assert.ok(await p.ev(`gs().some(function(s){return s.exercises['Seated Machine Leg Curl'];})`), 'nothing merged while the draft is open');
    assert.ok(/Finish your Legs workout first/.test(await p.ev(`document.getElementById('toast').textContent`)));
    assert.deepStrictEqual(await p.ev(`(function(){var d=gDri();return [d.v,d.list.indexOf('Seated Machine Leg Curl')>=0];})()`), [2, true], 'old draft migrated by gDri(); its list is what blocks');
    await p.ev(`localStorage.removeItem('ironlog_draft');document.getElementById('mg-cancel').click();pgBack();'ok'`);

    const before = await p.ev(`({old:gs().filter(function(s){return s.exercises['Incline Chest Press Machine'];}).length,cur:gs().filter(function(s){return s.exercises['Incline Chest Press (Smith/Machine)'];}).length})`);
    await p.ev(`pgOpen('Incline Chest Press Machine');'ok'`); await p.wait(400);
    assert.strictEqual(await p.ev(`document.querySelector('#pg-det .pg-chip').textContent`), 'Not lately');
    await p.ev(`document.getElementById('pg-merge').click();'ok'`); await p.wait(200);
    // Suggestions start with the same muscle sub-group
    await p.ev(`document.getElementById('mg-inp').focus();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.querySelector('#mov-merge .ta-i').textContent`), 'Incline Chest Press (Smith/Machine)', 'same sub-group suggested first');
    await p.ev(`var i=document.getElementById('mg-inp');i.value='incl';i.dispatchEvent(new Event('input'));'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.getElementById('mg-go').disabled`), true, 'Merge waits for a pick');
    await p.ev(`document.querySelector('#mov-merge .ta-i[data-v="Incline Chest Press (Smith/Machine)"]').click();'ok'`); await p.wait(100);
    assert.ok(new RegExp('Move ' + before.old + ' sessions').test(await p.ev(`document.getElementById('mg-conf').textContent`)));
    assert.strictEqual(await p.ev(`document.getElementById('mg-go').disabled`), false);
    await p.ev(`document.getElementById('toast').classList.remove('show');'ok'`); await p.wait(500);
    await shot('10-merge-confirm.png');
    await p.ev(`document.getElementById('mg-go').click();'ok'`); await p.wait(500);
    const after = await p.ev(`({old:gs().filter(function(s){return s.exercises['Incline Chest Press Machine'];}).length,cur:gs().filter(function(s){return s.exercises['Incline Chest Press (Smith/Machine)'];}).length,
      push:gw()['Upper Push'],px:PGX,goal:gGoals().filter(function(g){return !g.archived;})[0].exercise,listed:!!document.querySelector('.pg-xr[data-x="Incline Chest Press Machine"]'),toast:document.getElementById('toast').textContent})`);
    assert.strictEqual(after.old, 0); assert.strictEqual(after.cur, before.old + before.cur, 'histories joined');
    assert.strictEqual(after.push.filter(x => /Incline Chest Press/.test(x)).length, 1, 'saved workout lists it once: ' + after.push);
    assert.strictEqual(after.push[0], 'Incline Chest Press (Smith/Machine)');
    assert.strictEqual(after.px, 'Incline Chest Press (Smith/Machine)', 'detail follows the merged exercise');
    assert.strictEqual(after.goal, 'Incline Chest Press (Smith/Machine)');
    assert.ok(new RegExp('Merged ' + before.old + ' sessions').test(after.toast));
    await p.ev(`document.querySelector('.pg-rb[data-r="ALL"]').click();'ok'`); await p.wait(500);
    assert.strictEqual(await p.ev(`PCI.data.datasets[0].data.length`), before.old + before.cur, 'one chart for the whole history');
    await shot('11-after-merge-all.png');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.ok(!s.sessions.some(x => x.exercises['Incline Chest Press Machine']), 'merge synced');
    assert.deepStrictEqual(s.workouts['Upper Push'], after.push);
    await p.ev(`pgBack();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`!!document.querySelector('.pg-xr[data-x="Incline Chest Press Machine"]')`), false, 'old name gone from the list');
    step('Merge into… joins histories, updates saved workouts once, follows goals, syncs');

    // A sync from another device re-renders the open detail without errors
    await p.ev(`pgOpen('Lat Pulldown Machine (Uni Lateral)');'ok'`); await p.wait(300);
    s = await store(); const sx = JSON.parse(JSON.stringify(s.sessions[s.sessions.length - 1])); sx.id = 'other1'; sx.mt = Date.now(); sx.date = new Date().toISOString();
    sx.workout = 'Upper Pull'; sx.exercises = { 'Lat Pulldown Machine (Uni Lateral)': [{ kg: 60, reps: 10 }] }; s.sessions.push(sx); delete s.muscleMap;
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`); await p.wait(400);
    assert.strictEqual(await p.ev(`document.querySelector('.pg-tv').textContent`), '80', 'new session shows after sync (60 × 10 → e1RM 80)');
    assert.strictEqual(await p.ev(`document.querySelector('.pg-why').textContent.indexOf('New best on')`), 0);
    step('sync refreshes the open detail');

    // Nothing logged yet: a friendly empty state, and the Core hook is still there
    await p.ev(`localStorage.setItem('ironlog_data',JSON.stringify({sessions:[{id:'m1',mt:1,workout:'Muay Thai',date:new Date().toISOString(),exercises:{'Session Complete':[{kg:0,reps:0}]}}]}));sSyncUrl('');PGX=null;rProg();'ok'`);
    assert.ok(/No lifts yet/.test(await p.ev(`document.getElementById('pg-glance').textContent`)));
    assert.ok(await p.ev(`!!document.querySelector('#pg-main > #prog-core:last-child')`), 'prog-core hook kept at the end');
    await p.ev(`document.getElementById('toast').classList.remove('show');'ok'`); await p.wait(500);
    await shot('12-empty.png');
    step('empty state; prog-core hook in place');

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('SMOKE-PROGRESS FAILED:', e.stack || e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
