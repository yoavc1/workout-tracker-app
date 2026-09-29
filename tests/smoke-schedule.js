// End-to-end test of the Schedule sheet (Track B) in headless Chrome at iPhone size (393x852), against a mock sync server:
// the Today card, the week plan (tap to pick, drag to swap), moving a missed day, the month calendar and its day pop-up.
// Usage: node tests/smoke-schedule.js   (SHOTS=<dir> keeps the screenshots there)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

// SEED logs a session every 3 days from 60 to 3 days ago (Legs, Upper Pull, Upper Push, Muay Thai in turn; 3 days ago
// is Muay Thai). On top: a plan relative to today, set 7 days ago, a second session 3 days ago, and core on days -3 and -2.
//   day -4: Legs planned, nothing logged (missed, outside the Today card's 3 days)   day -3: Muay Thai + Legs, core
//   day -2: rest, core only    day -1: Legs planned, missed    today: Upper Pull    tomorrow: Upper Push
const PLAN = `(function(){var t=lday(new Date()),k=function(n){return DAYS[dow(addD(t,n))];},wk={};DAYS.forEach(function(x){wk[x]='';});
  wk[k(-4)]='Legs';wk[k(-3)]='Muay Thai';wk[k(-1)]='Legs';wk[k(0)]='Upper Pull';wk[k(1)]='Upper Push';
  var d=gd(),at=function(n,h){var x=new Date();x.setDate(x.getDate()+n);x.setHours(h,0,0,0);return x.toISOString();};
  d.sessions.push({id:'two',mt:1,workout:'Legs',date:at(-3,19),exercises:{'Squat - Dumbbell':[{kg:50,reps:8}]},duration:1800});
  [-3,-2].forEach(function(n){var k2='c'+addD(t,n);d.core[k2]={id:k2,mt:1,date:k2.slice(1),done:true,items:[]};});
  d.schedule={week:wk,wkm:new Date(at(-7,12)).getTime(),moves:{}};sd(d);return 'ok';})()`;

(async () => {
  const root = path.join(__dirname, '..');
  const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'wt-sched-'));
  fs.mkdirSync(shots, { recursive: true });
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    const shot = f => p.shot(path.join(shots, f));
    const text = sel => p.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`);
    const click = sel => p.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('no ${sel.replace(/'/g, '')}');e.click();return 1;})()`);
    await p.go(APP); await p.ev(SEED); await p.go(APP);

    // No plan yet: the home card says so and opens the sheet
    assert.strictEqual(await p.ev(`document.getElementById('hsub').nextElementSibling.id`), 'today-sec', 'Today card sits right under the subtitle');
    assert.ok(/No weekly plan yet/.test(await text('#today-sec')));
    await shot('01-home-no-plan.png');
    await click('#today-sec .td-plan'); await p.wait(400);
    assert.strictEqual(await p.ev(`schOpen()`), true, 'Plan your week opens the sheet');
    await click('#sch-x'); assert.strictEqual(await p.ev(`schOpen()`), false);
    step('without a plan, the Today card offers to plan the week');

    await p.ev(PLAN); await p.go(APP);
    await p.ev(`var T={t:lday(new Date()),k:function(n){return DAYS[dow(addD(T.t,n))];},day:function(n){return addD(T.t,n);},
      col:function(v){var e=document.createElement('i');e.style.background=v;document.body.appendChild(e);var c=getComputedStyle(e).backgroundColor;e.remove();return c;},
      cal:function(n){var day=T.day(n),t=new Date(),q=pday(day);SCM=(q.getFullYear()-t.getFullYear())*12+q.getMonth()-t.getMonth();rCal(gd());return document.querySelector('.cal-c[data-day="'+day+'"]');}};
      window.__wk=[];var _o=openWK;openWK=function(){__wk.push([].slice.call(arguments));return _o.apply(this,arguments);};'ok'`);

    // Home: today's planned workout with Start, and yesterday's missed Legs with the two move buttons
    const home = await p.ev(`(function(){var c=document.getElementById('today-sec');return {names:[].map.call(c.querySelectorAll('.td-n'),function(e){return e.textContent;}),
      go:[].map.call(c.querySelectorAll('.td-go'),function(e){return e.dataset.w+':'+e.textContent;}),mv:[].map.call(c.querySelectorAll('[data-act="mv"]'),function(e){return e.textContent+'>'+e.dataset.to;}),
      miss:missedDays(3),y:T.day(-1),tm:T.day(1)};})()`);
    assert.deepStrictEqual(home.names, ['Upper Pull', 'Legs']); assert.deepStrictEqual(home.go, ['Upper Pull:Start']);
    assert.deepStrictEqual(home.mv, ['Do it today>' + await p.ev('T.t'), 'Tomorrow>' + home.tm]);
    assert.deepStrictEqual(home.miss, [{ day: home.y, workout: 'Legs' }], 'day -4 is outside the 3 days, day -3 was done');
    await shot('02-home-today.png');
    await click('#today-sec .td-go'); await p.wait(200);
    assert.strictEqual(await text('#wk-t'), 'Upper Pull'); assert.deepStrictEqual(await p.ev('__wk.pop()'), ['Upper Pull']);
    await click('#btn-bk'); await p.wait(200);
    step('home Today card: planned workout starts, missed day offers a move');

    // The sheet covers the whole screen, nav included, and never scrolls sideways (also on a 320px phone)
    await click('#btn-split'); await p.wait(450);
    const sheet = await p.ev(`(function(){var s=document.getElementById('sch'),r=s.getBoundingClientRect();return {r:[r.left,r.top,r.right,r.bottom],top:document.elementFromPoint(196,830).closest('#sch')!==null,sw:s.scrollWidth,cw:s.clientWidth};})()`);
    assert.deepStrictEqual(sheet.r, [0, 0, 393, 852]); assert.ok(sheet.top, 'sheet is above the nav'); assert.ok(sheet.sw <= sheet.cw, 'no sideways scroll');
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('.wp-d div'),function(e){return e.textContent;})`), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.strictEqual(await p.ev(`document.querySelector('.wp-d .tdy').textContent`), await p.ev('T.k(0)'), "today's row is highlighted");
    await shot('03-schedule-sheet.png');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true }); await p.wait(200);
    assert.ok(await p.ev(`(function(){var s=document.getElementById('sch');return s.scrollWidth<=s.clientWidth&&document.querySelector('.cal-g').getBoundingClientRect().right<=320;})()`), 'fits 320px');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true }); await p.wait(200);
    step('Schedule sheet opens full screen: Today, Week plan, Calendar');

    // Move yesterday's missed Legs to today, then undo, then move it to tomorrow
    const [t, y, tm] = [await p.ev('T.t'), await p.ev('T.day(-1)'), await p.ev('T.day(1)')];
    await p.ev(`sSyncUrl('${SYNC}');new Promise(function(r){csync(r);})`); let s;
    await click(`#sch-td [data-act="mv"][data-to="${t}"]`); await p.wait(100);
    const mv = await p.ev(`({plan:plannedOn(T.t),miss:missedDays(3),sub:[].map.call(document.querySelectorAll('#today-sec .td-s'),function(e){return e.textContent;}),
      dot:!!T.cal(-1).querySelector('.cal-m')})`);
    assert.deepStrictEqual(mv.plan, ['Upper Pull', 'Legs']); assert.deepStrictEqual(mv.miss, [], 'no longer missed');
    assert.ok(mv.sub.includes('Moved from yesterday · Undo'), 'home card shows the move with Undo: ' + mv.sub);
    assert.strictEqual(mv.dot, false, 'no red dot on the day it moved from');
    await p.ev(`document.getElementById('sch').scrollTop=0;'ok'`); await shot('06-moved-today.png');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    const moves = Object.values(s.schedule.moves);
    assert.deepStrictEqual(moves.map(m => [m.from, m.to, m.workout]), [[y, t, 'Legs']]); assert.ok(moves[0].id && moves[0].mt, 'synced as a record');
    await click('#sch-td [data-act="undo"]'); await p.wait(100);
    assert.deepStrictEqual(await p.ev('missedDays(3)'), [{ day: y, workout: 'Legs' }], 'undo');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.deepStrictEqual(Object.keys(s.schedule.moves), []); assert.ok(s.deleted[moves[0].id], 'undo syncs as a tombstone');
    await click(`#sch-td [data-act="mv"][data-to="${tm}"]`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`plannedOn(T.day(1))`), ['Upper Push', 'Legs']);
    assert.ok(/Tomorrow\s*Legs\s*Moved from yesterday · Undo/.test(await text('#sch-td')), 'tomorrow section');
    await p.ev(`document.getElementById('sch').scrollTop=0;'ok'`); await shot('07-moved-tomorrow.png');
    step('move a missed day: Do it today / Tomorrow / Undo, synced as schedule.moves');

    // Calendar: done days in the workout's colour, two workouts split, upcoming planned outlined, missed red dot, core C.
    // Red dots only count from when the plan was set (7 days ago): day -8 had Legs planned and nothing logged.
    const cal = await p.ev(`(function(){var r={};
      var c=T.cal(-6);r.done=[c.classList.contains('done'),getComputedStyle(c).backgroundColor===T.col(wColor('Upper Push'))];
      c=T.cal(-3);r.two=/linear-gradient/.test(getComputedStyle(c).backgroundImage)&&!!c.querySelector('.cal-k');
      c=T.cal(-4);r.miss=!!c.querySelector('.cal-m')&&!c.classList.contains('done');
      r.miss7=!!T.cal(-7).querySelector('.cal-m');
      c=T.cal(-2);r.core=!!c.querySelector('.cal-k')&&!c.querySelector('.cal-m');
      c=T.cal(1);r.plan=c.classList.contains('plan')&&getComputedStyle(c).borderTopColor===T.col(wColor('Upper Push'));
      c=T.cal(0);r.today=c.classList.contains('today')&&c.classList.contains('plan');
      c=T.cal(-1);r.moved=!c.querySelector('.cal-m');
      c=T.cal(-8);r.before=!c.querySelector('.cal-m')&&missedOn(T.day(-8)).length===0&&plannedOn(T.day(-8))[0]==='Legs';
      return r;})()`);
    assert.deepStrictEqual(cal, { done: [true, true], two: true, miss: true, core: true, plan: true, today: true, moved: true, before: true, miss7: true });
    await p.ev(`SCM=0;rCal(gd());document.getElementById('sch-cal').scrollIntoView({block:'end'});'ok'`); await p.wait(100);
    await shot('08-calendar.png');
    const m0 = await text('.cal-t');
    await click('.cal-nb[data-act="mp"]'); const mPrev = await text('.cal-t');
    await click('.cal-nb[data-act="mn"]'); await click('.cal-nb[data-act="mn"]');
    const next = await p.ev(`({t:document.querySelector('.cal-t').textContent,plan:document.querySelectorAll('.cal-c.plan').length,done:document.querySelectorAll('.cal-c.done').length})`);
    assert.notStrictEqual(mPrev, m0); assert.notStrictEqual(next.t, m0);
    assert.ok(next.plan >= 8 && next.done === 0, 'next month shows its planned days outlined: ' + JSON.stringify(next));
    await click('.cal-nb[data-act="mp"]'); assert.strictEqual(await text('.cal-t'), m0);
    step('calendar: colours, outlines, red dots, core, month navigation');

    // Tap a day: what was logged (as the old heatmap pop-up showed); on a missed day, log it for that date
    await p.ev(`T.cal(-6).click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.getElementById('hmpop-ov').classList.contains('active')`), true);
    assert.strictEqual(await text('#hp-wk'), 'Upper Push'); assert.ok(/↑ 1 improved · ↓ 0 declined/.test(await text('#hp-det')), await text('#hp-det'));
    assert.strictEqual(await p.ev(`document.querySelectorAll('#hp-det [data-act="log"]').length`), 0, 'nothing to log on a logged day');
    await shot('09-day-logged.png');
    await p.ev(`T.cal(-3).click();'ok'`);
    assert.strictEqual(await text('#hp-wk'), 'Muay Thai, Legs'); assert.ok(/Core trained/.test(await text('#hp-det')));
    await click('#hp-close');
    await p.ev(`T.cal(-4).click();'ok'`); await p.wait(100);
    const pop = await p.ev(`({wk:document.getElementById('hp-wk').textContent,det:document.getElementById('hp-det').textContent,
      btn:[].map.call(document.querySelectorAll('#hp-det [data-act="log"]'),function(b){return b.dataset.w+(b.classList.contains('pri')?'*':'');})})`);
    assert.strictEqual(pop.wk, 'Nothing logged'); assert.ok(/Legs was planned · missed/.test(pop.det));
    assert.deepStrictEqual(pop.btn, ['Legs*', 'Upper Pull', 'Upper Push', 'Muay Thai'], 'planned workout first');
    await shot('10-day-log-it.png');
    await click('#hp-det [data-act="log"][data-w="Legs"]'); await p.wait(200);
    assert.deepStrictEqual(await p.ev('__wk.pop()'), ['Legs', null, null, await p.ev('T.day(-4)')], 'opens the workout for that date');
    assert.deepStrictEqual(await p.ev(`[schOpen(),document.getElementById('hmpop-ov').classList.contains('active'),document.getElementById('s-wk').classList.contains('active')]`), [false, false, true]);
    // Logging it saves the session on that day, which fills the calendar cell and clears its red dot
    assert.strictEqual(await text('#wmeta'), await p.ev(`fds(T.day(-4)+'T12:00')`), 'the workout screen shows the date being logged');
    await p.ev(`document.querySelector('.ecard .jtog').click();document.querySelector('.ecard .jadd').click();var k=document.querySelector('.jkg'),r=document.querySelector('.jrp');k.value='52.5';k.dispatchEvent(new Event('input'));r.value='8';r.dispatchEvent(new Event('input'));document.getElementById('btn-fin').click();'ok'`); await p.wait(300);
    const logged = await p.ev(`(function(){var s=gs().filter(function(x){return x.workout==='Legs'&&x.exercises['Squat - Dumbbell']&&x.exercises['Squat - Dumbbell'][0].kg===52.5;}),c=T.cal(-4);
      return {n:s.length,day:s.length&&lday(s[0].date),miss:missedOn(T.day(-4)),done:c.classList.contains('done'),dot:!!c.querySelector('.cal-m'),home:document.getElementById('s-home').classList.contains('active')};})()`);
    assert.deepStrictEqual(logged, { n: 1, day: await p.ev('T.day(-4)'), miss: [], done: true, dot: false, home: true }, 'session saved on the chosen past day');
    step('day pop-up: details of a logged day, and logging a missed past day on that date');

    // Week plan: tap a rest day and pick a workout
    await click('#btn-split'); await p.wait(400);
    const rest = await p.ev('T.k(2)');
    await click(`.wp-p[data-day="${rest}"] .wp-b`); await p.wait(150);
    assert.strictEqual(await text('#sd-title'), (await p.ev(`DAYL[DAYS.indexOf('${rest}')]`)));
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#sd-opts .jsd'),function(b){return b.dataset.v+(b.classList.contains('pri')?'*':'');})`), ['*', 'Legs', 'Upper Pull', 'Upper Push', 'Muay Thai'], 'Rest is the current choice');
    await shot('04-day-picker.png');
    await click('#sd-opts .jsd[data-v="Muay Thai"]'); await p.wait(100);
    assert.strictEqual(await p.ev(`gSplit()['${rest}']`), 'Muay Thai');
    assert.strictEqual(await text(`.wp-p[data-day="${rest}"] .wp-b`), 'Muay Thai', 'the list redraws');
    step('week plan: tap a day to pick a workout');

    // Week plan: drag today's workout onto tomorrow's to swap the two days
    await p.ev(`document.getElementById('sch-wp').scrollIntoView({block:'center'});'ok'`); await p.wait(100);
    const [d0, d1] = [await p.ev('T.k(0)'), await p.ev('T.k(1)')];
    const pt = sel => p.ev(`(function(){var r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
    const [sx, sy] = await pt(`.wp-p[data-day="${d0}"] .wp-h`), [tx, ty] = await pt(`.wp-p[data-day="${d1}"] .wp-h`);
    const mouse = (type, x, y) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
    await mouse('mousePressed', sx, sy); await p.wait(60);
    for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', sx + (tx - sx) * i / 12, sy + (ty - sy) * i / 12); await p.wait(30); }
    await p.wait(150);
    assert.strictEqual(await p.ev(`document.querySelectorAll('.wp-sw').length`), 1, 'the target is highlighted while dragging');
    await shot('05-week-drag.png');
    await mouse('mouseReleased', tx, ty); await p.wait(400);
    const sw = await p.ev(`({a:gSplit()['${d0}'],b:gSplit()['${d1}'],rows:[].map.call(document.querySelectorAll('#wp-l .wp-p'),function(e){return e.dataset.day;}),
      today:[].map.call(document.querySelectorAll('#sch-td .td-go'),function(e){return e.dataset.w;})})`);
    assert.deepStrictEqual([sw.a, sw.b], ['Upper Push', 'Upper Pull'], 'days swapped');
    assert.deepStrictEqual(sw.rows, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'rows keep their days');
    assert.deepStrictEqual(sw.today, ['Upper Push'], 'the Today card follows');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.deepStrictEqual([s.schedule.week[d0], s.schedule.week[d1], s.schedule.week[rest]], ['Upper Push', 'Upper Pull', 'Muay Thai'], 'plan synced');
    // Changing the plan starts it afresh: day -7's red dot goes, and so does anything to move
    assert.deepStrictEqual(await p.ev(`[!!T.cal(-7).querySelector('.cal-m'),missedDays(3).length,planFrom(gd())===T.t]`), [false, 0, true]);
    await p.ev(`SCM=0;rCal(gd());'ok'`);
    step('week plan: drag to swap two days, synced; red dots count from the change');

    // Start from the sheet closes it; the old split editor and the Progress heatmap are gone
    await click('#btn-split'); await p.wait(400); await click('#sch-td .td-go'); await p.wait(200);
    assert.deepStrictEqual([await p.ev('schOpen()'), await text('#wk-t')], [false, 'Upper Push']);
    await click('#btn-bk'); await p.wait(200);
    await p.ev(`switchTab('progress');'ok'`); await p.wait(1200);
    assert.deepStrictEqual(await p.ev(`[typeof openSplitEditor,typeof rHM,!!document.getElementById('hmrow'),!!document.getElementById('hmnav')]`), ['undefined', 'undefined', false, false]);
    await shot('11-progress-no-heatmap.png');
    step('Start from the sheet; heatmap and old editor removed');

    // The + quick start uses the same workout colours
    await p.ev(`switchTab('home');'ok'`); await click('#nav-plus'); await p.wait(150);
    assert.ok(await p.ev(`[].every.call(document.querySelectorAll('#quick-opts .jqk'),function(b){return getComputedStyle(b.firstChild).backgroundColor===T.col(wColor(b.dataset.w));})`));
    assert.strictEqual(await p.ev(`getComputedStyle(document.querySelector('#quick-opts .jqk').firstChild).backgroundColor`), await p.ev(`T.col('var(--w1)')`));
    await shot('12-quick-start-colours.png');
    await click('#quick-cancel');
    step('quick start uses wColor');

    // Once today's workout is logged, the card ticks it off
    await p.ev(`addS({workout:'Upper Push',date:new Date().toISOString(),exercises:{Dips:[{kg:50,reps:8}]},duration:1500});rHome();'ok'`);
    assert.deepStrictEqual(await p.ev(`({ok:document.querySelectorAll('#today-sec .td-ok').length,go:document.querySelectorAll('#today-sec .td-go').length,s:document.querySelector('#today-sec .td-s').textContent})`), { ok: 1, go: 0, s: 'Done' });
    await shot('13-home-done.png');
    step('a logged workout shows as done');

    // Reopening the app on a later day redraws the Today card
    await p.ev(`TDAY='2000-01-01';document.getElementById('today-sec').innerHTML='';document.dispatchEvent(new Event('visibilitychange'));'ok'`);
    assert.deepStrictEqual([await p.ev('TDAY===T.t'), /Upper Push/.test(await text('#today-sec'))], [true, true]);
    step('a new day redraws the Today card on resume');

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('SCHEDULE SMOKE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
