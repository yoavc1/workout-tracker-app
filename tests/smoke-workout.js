// End-to-end test of Track A (session vs saved workout) in headless Chrome at iPhone size.
// Usage: node tests/smoke-workout.js   (screenshots go to a temp folder, printed at the end)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

(async () => {
  const root = path.join(__dirname, '..');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-workout-'));
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    const shot = f => p.shot(path.join(shots, f));
    const names = () => p.ev(`[].map.call(document.querySelectorAll('#elist .ecard'),function(c){return c.dataset.x;})`);
    const center = sel => p.ev(`(function(){var r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    // A real drag with the mouse: press on the handle, move in small steps, release over the target
    const drag = async (fromSel, toSel, dy = 0) => {
      const a = await center(fromSel), b = await center(toSel); b.y += dy;
      const m = (type, x, y) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
      await m('mousePressed', a.x, a.y); await p.wait(50);
      for (let i = 1; i <= 12; i++) { await m('mouseMoved', a.x, a.y + (b.y - a.y) * i / 12); await p.wait(30); }
      await m('mouseReleased', b.x, b.y); await p.wait(300);
    };
    const tapFin = async () => { await p.ev(`document.getElementById('btn-fin').click();'ok'`); await p.wait(200); };
    const logSet = (x, kg, reps) => p.ev(`(function(){var c=cardOf(${JSON.stringify(x)});if(!c.classList.contains('open'))c.querySelector('.jtog').click();c=cardOf(${JSON.stringify(x)});c.querySelector('.jadd').click();c=cardOf(${JSON.stringify(x)});var k=[].slice.call(c.querySelectorAll('.jkg')).pop(),r=[].slice.call(c.querySelectorAll('.jrp')).pop();k.value='${kg}';k.dispatchEvent(new Event('input'));r.value='${reps}';r.dispatchEvent(new Event('input'));return 'ok';})()`);

    await p.go(APP); await p.ev(SEED);
    await p.ev(`(function(){var d=JSON.parse(localStorage.getItem('ironlog_data'));d.workouts.Legs.push('Seated Machine Leg Extension');localStorage.setItem('ironlog_data',JSON.stringify(d));})();'ok'`);
    await p.go(APP);
    const LEGS = ['Squat - Dumbbell', 'Calf Raise - Seated', 'Seated Machine Leg Extension'];

    // ── Reorder, add and remove change only the session ──
    await p.ev(`openWK('Legs');'ok'`); await p.wait(300);
    assert.deepStrictEqual(await names(), LEGS);
    await shot('1-workout.png');
    await drag('#elist .ecard:nth-child(3) .jdrag', '#elist .ecard:nth-child(1) .ehdr', -12);
    assert.deepStrictEqual(await names(), ['Seated Machine Leg Extension', 'Squat - Dumbbell', 'Calf Raise - Seated'], 'dragged to the top');
    assert.deepStrictEqual(await p.ev(`CL`), await names(), 'session order follows the drag');
    assert.deepStrictEqual(await p.ev(`gw().Legs`), LEGS, 'saved workout untouched by the drag');
    step('drag reorders the session only');

    // + opens Add Exercise with suggestions from history, leaving out what's already in the session
    await p.ev(`document.getElementById('btn-ae').click();'ok'`); await p.wait(250);
    const sugg = await p.ev(`[].map.call(document.querySelectorAll('#mov-ex .ta-i'),function(b){return b.textContent;})`);
    assert.ok(sugg.length > 0 && !sugg.some(x => LEGS.includes(x)), 'suggestions exclude session exercises ' + JSON.stringify(sugg));
    await p.ev(`var i=document.getElementById('new-ex');i.value='pull';i.dispatchEvent(new Event('input'));'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#mov-ex .ta-i'),function(b){return b.textContent;})`), ['Lat Pull Down - Front'], 'type-ahead filters');
    await shot('2-add-exercise.png');
    await p.ev(`document.querySelector('#mov-ex .ta-i').click();'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`document.getElementById('mov-ex').classList.contains('active')`), false, 'picking a suggestion adds it');
    // A brand-new name is allowed, and "dips" takes the logged spelling "Dips"
    for (const n of ['Hip Thrust', 'dips']) { await p.ev(`document.getElementById('btn-ae').click();var i=document.getElementById('new-ex');i.value=${JSON.stringify(n)};document.getElementById('ex-add').click();'ok'`); await p.wait(150); }
    assert.deepStrictEqual((await names()).slice(3), ['Lat Pull Down - Front', 'Hip Thrust', 'Dips']);
    // Remove needs two taps
    await p.ev(`(function(){var c=cardOf('Calf Raise - Seated');c.querySelector('.jtog').click();c.querySelector('.jdel').click();})();'ok'`);
    assert.ok((await names()).includes('Calf Raise - Seated'), 'one tap does not remove');
    await p.ev(`cardOf('Calf Raise - Seated').querySelector('.jdel').click();'ok'`);
    assert.ok(!(await names()).includes('Calf Raise - Seated'));
    assert.deepStrictEqual(await p.ev(`gw().Legs`), LEGS, 'saved workout untouched by add/remove');
    step('add (type-ahead, new names, logged spelling) and remove are session-only');

    // ── The unfinished session survives the app being killed ──
    await logSet('Seated Machine Leg Extension', 50, 12); await logSet('Hip Thrust', 80, 10); await logSet('Hip Thrust', 85, 8);
    const before = await p.ev(`({list:CL.slice(),st:WST})`);
    await p.go(APP);
    assert.ok(await p.ev(`!!document.querySelector('.wcard[data-w="Legs"] .draft')`), 'DRAFT badge on home');
    await p.ev(`openWK('Legs');'ok'`); await p.wait(200);
    assert.deepStrictEqual(await names(), before.list, 'list and order restored');
    assert.strictEqual(await p.ev(`WST`), before.st, 'elapsed time keeps counting from the real start');
    assert.deepStrictEqual(await p.ev(`CS['Hip Thrust']`), [{ kg: '80', reps: '10' }, { kg: '85', reps: '8' }]);
    step('draft restores list, order, sets and start time after a reload');

    // ── Sync no longer pauses during a workout; another device's template edit doesn't disturb the session ──
    await p.ev(`sSyncUrl('${SYNC}');new Promise(function(r){csync(r);})`);
    let s = await store(); assert.ok(s && s.sessions.length > 0, 'synced while the workout is open');
    s.workouts.Legs = ['Leg Press']; s.wm = Date.now();
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`);
    assert.deepStrictEqual(await p.ev(`gw().Legs`), ['Leg Press'], 'template edit from the other device arrived');
    assert.deepStrictEqual(await names(), before.list, 'open session unchanged');
    s.workouts.Legs = LEGS; s.wm = Date.now(); await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`);
    step('sync runs during a workout without touching the session');

    // ── Finish: "Also update Legs?" lists the changes; tapping outside goes back ──
    await tapFin();
    assert.strictEqual(await p.ev(`document.getElementById('upd-t').textContent`), 'Also update Legs?');
    const body = await p.ev(`document.getElementById('upd-body').innerText`);
    assert.ok(/Added\s+Lat Pull Down - Front, Hip Thrust, Dips/i.test(body) && /Removed\s+Calf Raise - Seated/i.test(body) && /New order/i.test(body), body);
    await shot('3-finish-prompt.png');
    const n0 = await p.ev(`gs().length`);
    await p.ev(`var m=document.getElementById('mov-upd');m.dispatchEvent(new MouseEvent('click',{bubbles:true}));'ok'`);
    assert.strictEqual(await p.ev(`document.getElementById('mov-upd').classList.contains('active')`), false);
    assert.strictEqual(await p.ev(`gs().length`), n0, 'nothing saved'); assert.strictEqual(await p.ev(`CW`), 'Legs', 'still in the workout');
    // "Just this session": saved in session order, template unchanged
    await tapFin(); await p.ev(`document.getElementById('upd-no').click();'ok'`); await p.wait(200);
    let last = await p.ev(`gss().pop()`);
    assert.deepStrictEqual(Object.keys(last.exercises), ['Seated Machine Leg Extension', 'Hip Thrust'], 'sets keyed by name, in session order');
    assert.deepStrictEqual(await p.ev(`gw().Legs`), LEGS, 'template unchanged');
    assert.strictEqual(await p.ev(`gDri()`), null, 'draft cleared');
    step('finish lists changes; "Just this session" keeps the saved workout');

    // "Update workout" copies the session's list; the new first-time exercise shows no bogus PR badge
    await p.ev(`openWK('Legs');'ok'`); await p.wait(150);
    await p.ev(`document.getElementById('btn-ae').click();var i=document.getElementById('new-ex');i.value='Nordic Curl';document.getElementById('ex-add').click();'ok'`); await p.wait(150);
    await logSet('Nordic Curl', 10, 5);
    assert.strictEqual(await p.ev(`cardOf('Nordic Curl').querySelector('.kgw').classList.contains('pr')`), false, 'no PR on a first-ever log');
    await logSet('Squat - Dumbbell', 999, 1);
    assert.strictEqual(await p.ev(`cardOf('Squat - Dumbbell').querySelector('.kgw').classList.contains('pr')`), true, 'a real PR still shows');
    await tapFin(); await p.ev(`document.getElementById('upd-yes').click();'ok'`); await p.wait(200);
    assert.deepStrictEqual(await p.ev(`gw().Legs`), [...LEGS, 'Nordic Curl']);
    // No changes → no question
    await p.ev(`openWK('Upper Push');'ok'`); await p.wait(100); await logSet('Dips', 20, 10); await tapFin();
    assert.strictEqual(await p.ev(`document.getElementById('mov-upd').classList.contains('active')`), false);
    assert.strictEqual(await p.ev(`gss().pop().workout`), 'Upper Push');
    step('"Update workout" saves the list; no prompt when nothing changed');

    // ── Logging a past day (used by the Schedule calendar) ──
    const day = await p.ev(`lday(Date.now()-3*864e5)`);
    await p.ev(`openWK('Upper Pull',null,null,'${day}');'ok'`); await p.wait(150);
    assert.strictEqual(await p.ev(`document.getElementById('wmeta').textContent`), await p.ev(`fds('${day}T12:00')`));
    assert.strictEqual(await p.ev(`document.getElementById('trow').style.display`), 'none', 'no rest timer for a past day');
    await logSet('Lat Pull Down - Front', 60, 8); await tapFin();
    last = await p.ev(`(function(){var s=gs();return s[s.length-1];})()`);
    assert.deepStrictEqual([await p.ev(`lday(${JSON.stringify(last.date)})`), last.duration], [day, 0]);
    step('a past day is logged on that date');

    // ── Editing a logged session keeps exercises that aren't in the saved workout, and finds it by id ──
    const hi = await p.ev(`(function(){var s=gs();for(var i=0;i<s.length;i++)if(s[i].exercises['Hip Thrust'])return i;})()`);
    await p.ev(`openWK('Legs',gs()[${hi}].exercises,${hi});'ok'`); await p.wait(150);
    assert.deepStrictEqual((await names()).slice(0, 2), ['Seated Machine Leg Extension', 'Hip Thrust'], 'logged exercises first, in their order');
    // Another device deletes the oldest session mid-edit, so every position shifts by one
    s = await store(); const victim = s.sessions[0].id; s.sessions.shift(); s.deleted = Object.assign(s.deleted || {}, { [victim]: Date.now() });
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) }); await p.ev(`new Promise(function(r){csync(r);})`);
    const sig = await p.ev(`JSON.stringify(gs().filter(function(x){return !x.exercises['Hip Thrust'];}))`);
    await logSet('Hip Thrust', 90, 6); await tapFin();
    const ed = await p.ev(`gs().filter(function(x){return x.exercises['Hip Thrust'];})`);
    assert.strictEqual(ed.length, 1); assert.deepStrictEqual(ed[0].exercises['Hip Thrust'].map(x => x.kg), [80, 85, 90]);
    assert.strictEqual(await p.ev(`JSON.stringify(gs().filter(function(x){return !x.exercises['Hip Thrust'];}))`), sig, 'no other session touched');
    step('editing a logged session updates that session and keeps its extra exercises');

    // ── Manage Workouts → edit a saved workout's exercises ──
    await p.ev(`showManage();'ok'`); await p.wait(150);
    await shot('4-manage.png');
    await p.ev(`document.querySelector('.jex[data-n="Legs"]').click();'ok'`); await p.wait(150);
    const exr = () => p.ev(`[].map.call(document.querySelectorAll('#exed .exr'),function(r){return r.dataset.x;})`);
    assert.deepStrictEqual(await exr(), await p.ev(`gw().Legs`));
    await drag('#exed .exr:nth-child(4) .jdrag', '#exed .exr:nth-child(1)', -8);
    assert.deepStrictEqual(await p.ev(`gw().Legs`), ['Nordic Curl', ...LEGS], 'drag saves the new order');
    await p.ev(`var i=document.getElementById('exed-new');i.value='Leg Press';document.getElementById('exed-add').click();'ok'`); await p.wait(150);
    await p.ev(`var tap=document.querySelector('#exed .exr[data-x="Calf Raise - Seated"] .jed');tap.click();tap.click();'ok'`); await p.wait(150);
    assert.deepStrictEqual(await p.ev(`gw().Legs`), ['Nordic Curl', 'Squat - Dumbbell', 'Seated Machine Leg Extension', 'Leg Press']);
    await shot('5-edit-exercises.png');
    step('edit exercises: drag, add, remove');

    // Rename with history: past sessions and other workouts follow, so progress stays in one chart
    const logged = await p.ev(`gs().filter(function(s){return s.exercises['Seated Machine Leg Extension']}).length`); assert.ok(logged > 0);
    await p.ev(`addGoal({exercise:'Seated Machine Leg Extension',startKg:50,startDate:lday(new Date()),targetKg:60,targetDate:lday(Date.now()+90*864e5)});'ok'`);
    await p.ev(`sw(Object.assign(gw(),{'Leg Day B':['Seated Machine Leg Extension']}));showExEd('Legs');document.querySelector('#exed .exr[data-x="Seated Machine Leg Extension"] .jer').click();'ok'`); await p.wait(150);
    assert.strictEqual(await p.ev(`getComputedStyle(document.getElementById('rename-hist-row')).display`), 'flex', 'history option shown for a logged exercise');
    await p.ev(`document.getElementById('rename-inp').value='Leg Extension';'ok'`);
    await shot('6-rename.png');
    await p.ev(`document.getElementById('rename-save').click();'ok'`); await p.wait(150);
    const rn = await p.ev(`({legs:gw().Legs,b:gw()['Leg Day B'],old:gs().filter(function(s){return s.exercises['Seated Machine Leg Extension']}).length,nw:gs().filter(function(s){return s.exercises['Leg Extension']}).length})`);
    assert.deepStrictEqual(rn, { legs: ['Nordic Curl', 'Squat - Dumbbell', 'Leg Extension', 'Leg Press'], b: ['Leg Extension'], old: 0, nw: logged });
    assert.strictEqual(await p.ev(`gGoals()[0].exercise`), 'Leg Extension', 'a goal follows the rename');
    // Without the tick, only this workout's list changes
    await p.ev(`document.querySelector('#exed .exr[data-x="Squat - Dumbbell"] .jer').click();document.getElementById('rename-inp').value='Goblet Squat';document.getElementById('rename-hist').checked=false;document.getElementById('rename-save').click();'ok'`); await p.wait(150);
    assert.ok(await p.ev(`gw().Legs.indexOf('Goblet Squat')>=0&&gs().some(function(s){return s.exercises['Squat - Dumbbell']})&&!gs().some(function(s){return s.exercises['Goblet Squat']})`));
    // A never-logged exercise has no history option
    await p.ev(`document.querySelector('#exed .exr[data-x="Leg Press"] .jer').click();'ok'`);
    assert.strictEqual(await p.ev(`document.getElementById('rename-hist-row').style.display`), 'none');
    await p.ev(`document.getElementById('rename-cancel').click();'ok'`);
    step('rename can carry history, goals and other workouts along');

    // ── A draft saved by the previous app version (sets keyed by position) moves to names ──
    await p.ev(`localStorage.setItem('ironlog_draft',JSON.stringify({workout:'Legs',sets:{0:[{kg:'5',reps:'5'}],2:[{kg:'7',reps:'7'}],9:[{kg:'1',reps:'1'}]},ts:Date.now()}));'ok'`);
    await p.go(APP);
    const mg = await p.ev(`gDri()`);
    assert.strictEqual(mg.v, 2); assert.deepStrictEqual(mg.list, await p.ev(`gw().Legs`));
    assert.deepStrictEqual(mg.sets, { 'Nordic Curl': [{ kg: '5', reps: '5' }], 'Leg Extension': [{ kg: '7', reps: '7' }] });
    await p.ev(`openWK('Legs');'ok'`); await p.wait(150);
    assert.deepStrictEqual(await p.ev(`CS['Leg Extension']`), [{ kg: '7', reps: '7' }]);
    await p.ev(`document.getElementById('btn-bk').click();'ok'`);
    step('old-format drafts migrate to names');

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('SMOKE (workout) FAILED:', e.stack || e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
