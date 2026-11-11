// End-to-end test of the quicker workout flow and the week calendar in headless Chrome at iPhone size: logged times and
// rest between sets, + Add Set filling in, the finish summary, and the home calendar's Week / Month view (remembered,
// swipeable). Usage: node tests/smoke-flow.js   (screenshots go to a temp folder, printed at the end)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, launchChrome, urlOf } = require('./lib');

// Sessions placed around this week's Monday, so the week view always has something to show whatever today is:
// this Monday and today (Legs, Upper Push), last Tuesday and Thursday, core on last Saturday, plus older Legs sessions
// so "Previous" sets exist. Times are 00:05, so today's are always earlier than the workout the test logs.
const DATA = `localStorage.clear();(function(){var t=new Date();t.setHours(0,5,0,0);var dw=(t.getDay()+6)%7;
  var D=function(n){var x=new Date(t);x.setDate(x.getDate()+n);return x;},L=function(x){return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
  var W={'Legs':['Squat - Dumbbell','Calf Raise - Seated'],'Upper Push':['Dips'],'Upper Pull':['Lat Pull Down - Front']};
  var S=function(id,n,w,ex,dur){return{id:id,mt:1,workout:w,date:D(n).toISOString(),exercises:ex,duration:dur||0};};
  var ss=[S('o1',-dw-21,'Legs',{'Squat - Dumbbell':[{kg:50,reps:10},{kg:55,reps:8}],'Calf Raise - Seated':[{kg:30,reps:12}]},2700),
    S('o2',-dw-14,'Legs',{'Squat - Dumbbell':[{kg:52.5,reps:10},{kg:57.5,reps:8}],'Calf Raise - Seated':[{kg:30,reps:12}]},2900),
    S('lw2',-dw-6,'Upper Pull',{'Lat Pull Down - Front':[{kg:45,reps:10}]},2400),
    S('lw4',-dw-4,'Upper Push',{'Dips':[{kg:0,reps:12}]},1800),
    S('mon',-dw,'Legs',{'Squat - Dumbbell':[{kg:55,reps:10},{kg:60,reps:8}],'Calf Raise - Seated':[{kg:32.5,reps:12}]},3120)];
  if(dw>0)ss.push(S('tod',0,'Upper Push',{'Dips':[{kg:0,reps:14}]},1500));
  var core={};core['c'+L(D(-dw-2))]={id:'c'+L(D(-dw-2)),mt:1,date:L(D(-dw-2)),done:true,items:[]};
  localStorage.setItem('ironlog_data',JSON.stringify({sessions:ss,workouts:W,core:core,lastModified:1}));})();'ok'`;

(async () => {
  const root = path.join(__dirname, '..');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-flow-'));
  const site = await staticServer(root), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html';
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    // Headless pages aren't focused, so focus events (select-on-tap) only fire with focus emulated
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const shot = f => p.shot(path.join(shots, f));
    const txt = sel => p.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`);
    const on = sel => p.ev(`!!document.querySelector(${JSON.stringify(sel)})`);
    const rows = x => p.ev(`[].map.call(cardOf(${JSON.stringify(x)}).querySelectorAll('.srow'),function(r){return[r.querySelector('.jkg').value,r.querySelector('.jrp').value,r.querySelector('.srest')?r.querySelector('.srest').textContent:null];})`);
    const add = x => p.ev(`cardOf(${JSON.stringify(x)}).querySelector('.jadd').click();'ok'`);
    const type = (x, si, cls, v) => p.ev(`(function(){var i=cardOf(${JSON.stringify(x)}).querySelectorAll('.srow')[${si}].querySelector('.${cls}');i.value='${v}';i.dispatchEvent(new Event('input'));return 'ok';})()`);
    const sheetOpen = () => p.ev(`document.getElementById('mov-sum').classList.contains('active')`);

    await p.go(APP); await p.ev(DATA); await p.go(APP);
    const T = await p.ev(`(function(){var t=lday(new Date());return{today:t,mon:wkMon(t),dw:dow(t)};})()`);

    // ══ Workout: the first exercise opens, + Add Set fills in, sets keep their logged time ══
    await p.ev(`openWK('Legs');'ok'`); await p.wait(200);
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#elist .ecard'),function(c){return c.classList.contains('open');})`), [true, false], 'a new session opens on its first exercise');
    assert.strictEqual(await on('#rest.on'), false, 'no rest clock before the first set');
    const t0 = await p.ev('Date.now()');
    await add('Squat - Dumbbell'); await p.wait(80);
    assert.deepStrictEqual(await rows('Squat - Dumbbell'), [['55', '10', '']], 'set 1 starts from last time\'s set 1, no rest before it');
    assert.ok(await p.ev(`CS['Squat - Dumbbell'][0].at>=${t0}`), 'a filled-in set is logged at once');
    assert.ok(await p.ev(`!document.activeElement||!document.activeElement.classList.contains('sinp')`), 'the keyboard stays down');
    assert.ok(await on('#elist .srow.snew'), 'the new set flashes');
    assert.ok(await on('#rest.on'), 'the rest clock starts');
    assert.ok(/^0:0\d$/.test(await txt('#rest-t')), await txt('#rest-t'));
    assert.ok(/^last set \d{1,2}:\d\d/.test(await txt('#rest-s')), await txt('#rest-s'));
    // Change set 1 to 60 x 8: the edit keeps its time. Set 2 repeats it, not last time's set 2.
    const at1 = await p.ev(`CS['Squat - Dumbbell'][0].at`);
    await type('Squat - Dumbbell', 0, 'jkg', '60'); await type('Squat - Dumbbell', 0, 'jrp', '8');
    assert.strictEqual(await p.ev(`CS['Squat - Dumbbell'][0].at`), at1, 'editing a logged set keeps its time');
    await add('Squat - Dumbbell'); await p.wait(50);
    assert.deepStrictEqual((await rows('Squat - Dumbbell')).map(r => r.slice(0, 2)), [['60', '8'], ['60', '8']], 'later sets repeat this session\'s last set');
    // Rest is the gap to the previous logged set of any exercise; the clock counts from the latest
    await p.ev(`(function(){var n=Date.now(),s=CS['Squat - Dumbbell'];s[0].at=n-215000;s[1].at=n-125000;rEx();})();'ok'`);
    assert.deepStrictEqual((await rows('Squat - Dumbbell')).map(r => r[2]), ['', '1:30']);
    assert.ok(/^2:0[5-7]$/.test(await txt('#rest-t')), 'clock ' + await txt('#rest-t'));
    // It ticks with the elapsed time, once a second from the start, so two seconds always show a change
    await p.wait(2100);
    assert.ok(/^2:0[6-9]$/.test(await txt('#rest-t')), 'the clock ticks ' + await txt('#rest-t'));
    step('first exercise open; + Add Set fills in and logs the time; rest column and rest clock');

    // A new exercise has nothing to copy: the set is empty and kg gets the focus; it's logged once kg and reps are both in
    await p.ev(`document.getElementById('btn-ae').click();var i=document.getElementById('new-ex');i.value='Hip Thrust';document.getElementById('ex-add').click();'ok'`); await p.wait(150);
    await add('Hip Thrust'); await p.wait(150);
    assert.deepStrictEqual(await rows('Hip Thrust'), [['', '', '']]);
    assert.ok(await p.ev(`document.activeElement===cardOf('Hip Thrust').querySelector('.jkg')`), 'kg focused');
    await type('Hip Thrust', 0, 'jkg', '80');
    assert.strictEqual(await p.ev(`CS['Hip Thrust'][0].at`), undefined, 'kg alone is not a set yet');
    await type('Hip Thrust', 0, 'jrp', '10');
    assert.ok(await p.ev(`CS['Hip Thrust'][0].at>CS['Squat - Dumbbell'][1].at`), 'logged with reps');
    assert.ok(/^2:0\d$/.test((await rows('Hip Thrust'))[0][2]), 'rest since the squat: ' + (await rows('Hip Thrust'))[0][2]);
    assert.ok(/^0:0\d$/.test(await txt('#rest-t')), 'the clock restarts');
    // Tapping a filled-in number selects it, so typing replaces it
    const sel = await p.ev(`new Promise(function(r){var n=0,o=HTMLInputElement.prototype.select;HTMLInputElement.prototype.select=function(){n++;return o.call(this);};
      var i=cardOf('Squat - Dumbbell').querySelector('.jrp');i.blur();i.focus();setTimeout(function(){HTMLInputElement.prototype.select=o;i.blur();r(n);},60);})`);
    assert.strictEqual(sel, 1, 'select on focus');
    await shot('01-rest.png');
    step('a new exercise starts empty with kg focused; rest restarts from it; numbers select on tap');

    // The times survive the app being killed, and the session reopens on the exercise last logged
    await p.go(APP);
    await p.ev(`document.querySelector('#today-sec .td-go[data-w="Legs"]').click();'ok'`); await p.wait(200);
    assert.ok(await p.ev(`CS['Hip Thrust'][0].at>0&&CS['Squat - Dumbbell'][1].at>0`), 'times kept in the draft');
    assert.deepStrictEqual(await p.ev(`[].map.call(document.querySelectorAll('#elist .ecard'),function(c){return c.dataset.x+':'+c.classList.contains('open');})`),
      ['Squat - Dumbbell:false', 'Calf Raise - Seated:false', 'Hip Thrust:true'], 'resumes on the latest set');
    assert.ok(await on('#rest.on'));
    step('a resumed workout keeps its times and opens where you left off');

    // ══ Finish summary ══
    // A heavy last set makes a new best for the squat
    await add('Squat - Dumbbell'); await type('Squat - Dumbbell', 2, 'jkg', '80'); await type('Squat - Dumbbell', 2, 'jrp', '6');
    await p.ev(`document.getElementById('btn-fin').click();'ok'`); await p.wait(200);
    await p.ev(`document.getElementById('upd-no').click();'ok'`); await p.wait(400);
    assert.ok(await sheetOpen(), 'the summary shows after saving');
    const sum = await p.ev(`(function(){var b=document.getElementById('sum-body');return{h:b.querySelector('.sum-h').textContent,
      tiles:[].map.call(b.querySelectorAll('.sum-t span'),function(e){return e.textContent;}),sets:b.querySelector('.sum-t:nth-child(2) b').textContent,
      vs:(b.querySelector('.sum-vs')||{}).textContent,pb:[].map.call(b.querySelectorAll('.sum-pn'),function(e){return e.textContent;}),pv:(b.querySelector('.sum-pv')||{}).textContent};})()`);
    assert.strictEqual(sum.h, 'Legs done');
    assert.deepStrictEqual(sum.tiles, ['Time', 'Sets', 'Volume', 'Avg rest'], JSON.stringify(sum));
    assert.strictEqual(sum.sets, '4');
    assert.ok(/vs last Legs/.test(sum.vs) && /↑ 1 improved/.test(sum.vs), sum.vs);
    assert.deepStrictEqual(sum.pb, ['Squat - Dumbbell']);
    assert.ok(/^80 kg × 6 · e1RM 96 kg was 76 kg$/.test(sum.pv), sum.pv);
    const saved = await p.ev(`gss().pop()`);
    assert.ok(Object.keys(saved.exercises).every(x => saved.exercises[x].every(t => t.at > 0)), 'every set saved with its time');
    await shot('02-summary.png');
    await p.ev(`document.getElementById('mov-sum').dispatchEvent(new MouseEvent('click',{bubbles:true}));'ok'`);
    assert.strictEqual(await sheetOpen(), false, 'a tap anywhere closes it');
    // History shows the average rest
    await p.ev(`switchTab('history');'ok'`); await p.wait(150);
    assert.ok(/ · avg rest \d+:\d\d$/.test(await txt('#hlist .hcard .hcard-stats')), await txt('#hlist .hcard .hcard-stats'));
    step('finish summary: time, sets, volume, average rest, vs last time, new bests; History shows average rest');

    // Editing it from History keeps its times and shows its rest, but adds no times of its own
    const si = await p.ev(`sIdx(${JSON.stringify(saved.id)})`);
    await p.ev(`openWK('Legs',gs()[${si}].exercises,${si});'ok'`); await p.wait(150);
    assert.ok(await on('#elist .stbl.rt'), 'rest column for a workout logged with times');
    assert.strictEqual(await on('#rest.on'), false, 'no rest clock when editing');
    await p.ev(`cardOf('Calf Raise - Seated').querySelector('.jadd').click();'ok'`);
    assert.deepStrictEqual(await p.ev(`CS['Calf Raise - Seated']`), [{ kg: '32.5', reps: '12' }], 'filled in from last time, with no time');
    await p.ev(`document.getElementById('btn-fin').click();'ok'`); await p.wait(200);
    assert.strictEqual(await sheetOpen(), false, 'no summary for an edit');
    const ed = await p.ev(`gs()[sIdx(${JSON.stringify(saved.id)})].exercises`);
    assert.deepStrictEqual(ed['Squat - Dumbbell'].map(t => t.at), saved.exercises['Squat - Dumbbell'].map(t => t.at), 'times kept');
    assert.strictEqual(ed['Calf Raise - Seated'][0].at, undefined);
    // An old workout logged without times has no rest column
    const oi = await p.ev(`sIdx('o1')`);
    await p.ev(`openWK('Legs',gs()[${oi}].exercises,${oi});'ok'`); await p.wait(100);
    assert.strictEqual(await on('#elist .stbl.rt'), false);
    await p.ev(`goHome();'ok'`);
    step('editing keeps logged times and adds none; no rest column without times');

    // ══ Home calendar: Week by default, Month as the other view, remembered on this device ══
    await p.go(APP); await p.ev(`localStorage.removeItem('ironlog_calview');switchTab('home');'ok'`); await p.wait(100);
    const cal = () => p.ev(`(function(){var c=document.getElementById('cal-sec');return{view:c.querySelector('.cal-vb.on').dataset.v,
      days:[].map.call(c.querySelectorAll('.cal-c'),function(e){return e.dataset.day;}),title:c.querySelector('.cal-t').textContent,n:c.querySelector('.hsec-n').textContent,
      rows:[].map.call(c.querySelectorAll('.cal-wr'),function(e){return e.dataset.day+' '+e.querySelector('.cal-wn').textContent;}),back:!!c.querySelector('.cal-0'),leg:!!c.querySelector('.cal-leg')};})()`);
    let c = await cal();
    const week = n => Array.from({ length: 7 }, (_, i) => n + i);
    const dayOf = async n => p.ev(`addD(${JSON.stringify(T.mon)},${n})`);
    assert.strictEqual(c.view, 'week', 'Week is the default');
    assert.deepStrictEqual(c.days, await Promise.all(week(0).map(dayOf)), 'Monday to Sunday of this week');
    assert.ok(await on(`#cal-sec .cal-c.today[data-day="${T.today}"]`));
    // This Monday's Legs, today's Upper Push (not on a Monday), and the Legs workout logged above
    const thisWeek = (T.dw > 0 ? [`${T.mon} Legs`, `${T.today} Upper Push`] : [`${T.mon} Legs`]).concat(`${T.today} Legs`);
    assert.deepStrictEqual(c.rows, thisWeek, "this week's workouts, oldest first");
    assert.strictEqual(c.n, thisWeek.length + ' workout' + (thisWeek.length > 1 ? 's' : ''));
    assert.deepStrictEqual([c.back, c.leg], [false, false], 'no Today button on this week; the list names the workouts, so no legend');
    await shot('03-week.png');
    // Last week: the Today button appears and brings you back
    await p.ev(`document.querySelector('#cal-sec .cal-nb[data-act="mp"]').click();'ok'`);
    c = await cal();
    assert.deepStrictEqual(c.days, await Promise.all(week(-7).map(dayOf)));
    assert.deepStrictEqual(c.rows, [`${await dayOf(-6)} Upper Pull`, `${await dayOf(-4)} Upper Push`, `${await dayOf(-2)} Core`], 'a core-only day is listed too');
    assert.strictEqual(c.n, '2 workouts · 1 core');
    assert.ok(c.back && /^\d{1,2}( [A-Z][a-z]{2,3})? – \d{1,2} [A-Z][a-z]{2,3}$/.test(c.title), c.title);
    assert.ok(await on('#cal-sec .cal-sw.sl-p'), 'slides in from the left');
    await shot('04-last-week.png');
    // A row opens its day, like the cell
    await p.ev(`document.querySelector('#cal-sec .cal-wr').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`[document.getElementById('hmpop-ov').classList.contains('active'),document.getElementById('hp-wk').textContent]`), [true, 'Upper Pull']);
    await p.ev(`document.getElementById('hmpop-ov').classList.remove('active');document.querySelector('#cal-sec .cal-0').click();'ok'`);
    c = await cal(); assert.deepStrictEqual([c.days[0], c.back], [T.mon, false], 'Today goes back to this week');
    step('week view by default: Mon–Sun, the week\'s workouts and core days, ‹ › and Today');

    // Swipe: left for the next week, right for the previous; a vertical swipe does nothing
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const swipe = async (dx, dy) => {
      const r = await p.ev(`(function(){var b=document.querySelector('#cal-sec .cal-g').getBoundingClientRect();return[b.left+b.width/2,b.top+b.height/2];})()`);
      const t = (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await t('touchStart', r[0], r[1]); for (let i = 1; i <= 5; i++) { await t('touchMove', r[0] + dx * i / 5, r[1] + dy * i / 5); await p.wait(16); }
      await t('touchEnd'); await p.wait(120);
    };
    await swipe(-120, 10); c = await cal(); assert.strictEqual(c.days[0], await dayOf(7), 'swipe left: next week');
    await swipe(120, -8); await swipe(120, 0); c = await cal(); assert.strictEqual(c.days[0], await dayOf(-7), 'swipe right twice: last week');
    await swipe(30, 200); c = await cal(); assert.strictEqual(c.days[0], await dayOf(-7), 'a mostly vertical swipe is a scroll');
    step('swipe turns the week');

    // Switch to Month: the month of the week on show; the choice is remembered after a reload
    await p.ev(`SCM=-5;rCal(gd());'ok'`);
    const thu = await dayOf(-35 + 3);
    await p.ev(`document.querySelector('#cal-sec .cal-vb[data-v="month"]').click();'ok'`);
    c = await cal();
    assert.strictEqual(c.view, 'month');
    assert.strictEqual(await p.ev(`localStorage.getItem('ironlog_calview')`), 'month');
    assert.ok(c.days.includes(thu) && c.days[0].endsWith('-01'), 'the month with most of that week: ' + c.days[0]);
    assert.ok(c.leg && /^\d+ workout days?$/.test(c.n), 'month view keeps its legend and count ' + c.n);
    // Back to Week: the first week of that month
    const first = c.days[0];
    await p.ev(`document.querySelector('#cal-sec .cal-vb[data-v="week"]').click();'ok'`);
    c = await cal(); assert.ok(c.days.includes(first), 'first week of the month');
    await p.ev(`document.querySelector('#cal-sec .cal-vb[data-v="month"]').click();'ok'`);
    await p.go(APP); c = await cal();
    assert.strictEqual(c.view, 'month', 'opens in Month after a reload');
    assert.ok(c.days.includes(T.today) && c.days[0].endsWith('-01'), 'this month');
    await shot('05-month.png');
    await p.ev(`document.querySelector('#cal-sec .cal-vb[data-v="week"]').click();'ok'`);
    await p.go(APP); c = await cal();
    assert.deepStrictEqual([c.view, c.days[0]], ['week', T.mon], 'and back in Week after the next');
    step('Week / Month switch keeps your place, and the app opens in the view you used last');

    // ══ Fits a 320 px wide phone, in both themes ══
    const narrow = await chrome.page(320, 640);
    await narrow.go(APP);
    for (const th of ['light', 'dark']) {
      await narrow.ev(`sTheme('${th}');switchTab('home');'ok'`); await narrow.wait(100);
      assert.ok(await narrow.ev(`(function(){var h=document.getElementById('s-home');return h.scrollWidth<=h.clientWidth&&document.querySelector('#cal-sec .hsec').getBoundingClientRect().right<=320;})()`), 'week view fits 320px');
      await narrow.ev(`document.getElementById('cal-sec').scrollIntoView({block:'center'});'ok'`); await narrow.wait(100);
      await narrow.shot(path.join(shots, `06-week-320-${th}.png`));
      await narrow.ev(`openWK('Legs');(function(){var c=cardOf('Squat - Dumbbell');c.querySelector('.jadd').click();cardOf('Squat - Dumbbell').querySelector('.jadd').click();CS['Squat - Dumbbell'][0].at=Date.now()-100000;rEx();})();'ok'`); await narrow.wait(150);
      assert.ok(await narrow.ev(`(function(){var e=document.getElementById('elist'),r=document.getElementById('rest').getBoundingClientRect(),s=document.querySelector('#elist .srest').getBoundingClientRect();return e.scrollWidth<=e.clientWidth&&r.right<=320&&s.right<=320;})()`), 'rest column and clock fit 320px');
      await narrow.shot(path.join(shots, `07-rest-320-${th}.png`));
      await narrow.ev(`finWK();'ok'`); await narrow.wait(500);
      assert.ok(await narrow.ev(`(function(){var b=document.getElementById('sum-body').getBoundingClientRect();return b.left>=0&&b.right<=320&&[].every.call(document.querySelectorAll('.sum-t b'),function(e){return e.scrollWidth<=e.clientWidth+1;});})()`), 'summary fits 320px');
      await narrow.shot(path.join(shots, `08-summary-320-${th}.png`));
      await narrow.ev(`closeSum();'ok'`);
    }
    narrow.close();
    step('fits 320px in light and dark');

    assert.deepStrictEqual(p.errors, [], 'no JS errors'); step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('FLOW SMOKE FAILED:', e);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close();
    process.exit(ok ? 0 : 1);
  }
})();
