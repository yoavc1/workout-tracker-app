// End-to-end test of Core (Track C) in headless Chrome at iPhone size (393x852) against a mock sync server:
// the home and workout chips, the day sheet with type-ahead, modes, sets and the stopwatch, History and Progress.
// Usage: node tests/smoke-core.js   (set CHROME=/path/to/chrome if it isn't in /Applications; SHOTS=dir keeps screenshots)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

// On top of the shared seed (sessions every 3 days, the last one 3 days ago): old per-session ticks (abs) on the
// sessions 3 and 12 days ago, per-day core records (two of them on days with no workout), and an evening Muay Thai
// as a second workout on days 6 (core done) and 9 (no core)
const CORE_SEED = `(function(){var d=JSON.parse(localStorage.getItem('ironlog_data'));var t=new Date();t.setHours(12,0,0,0);
  var ago=function(n){var x=new Date(t);x.setDate(x.getDate()-n);return lday(x);};
  d.sessions.forEach(function(s){var n=Math.round((t-new Date(s.date))/864e5);if(n===3||n===12)s.abs=true;});
  var T=function(n){return{name:'Plank',mode:'time',sets:[].slice.call(arguments,1).map(function(x){return{secs:x};})};};
  var R=function(n){return{name:n,mode:'reps',sets:[].slice.call(arguments,1).map(function(x){return{reps:x};})};};
  var C=function(n,items){var k='c'+ago(n);d.core=d.core||{};d.core[k]={id:k,mt:1000,date:ago(n),done:true,items:items};};
  C(1,[T(0,60,60,45),R('Leg Raise',15,15,12)]);C(6,[T(0,45),R('Leg Raise',12,12)]);C(10,[]);
  [6,9].forEach(function(n){var x=new Date(t);x.setDate(x.getDate()-n);x.setHours(19);d.sessions.push({workout:'Muay Thai',date:x.toISOString(),exercises:{Pads:[{kg:0,reps:5}]},duration:3600,abs:false});});
  localStorage.setItem('ironlog_data',JSON.stringify(d));})();'ok'`;

(async () => {
  const root = path.join(__dirname, '..');
  const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'wt-core-'));
  fs.mkdirSync(shots, { recursive: true });
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  const shot = f => p.shot(path.join(shots, f));
  const txt = sel => p.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`);
  let ok = false, p;
  try {
    p = await chrome.page();
    await p.go(APP); await p.ev(SEED); await p.ev(CORE_SEED); await p.go(APP);
    const day = await p.ev(`(function(){var t=new Date();t.setHours(12,0,0,0);var o={};[0,1,2,3,6,9,10].forEach(function(n){var x=new Date(t);x.setDate(x.getDate()-n);o[n]=lday(x);});return o;})()`);
    const today = day[0];

    // The chip is on home every day, including a rest day (no workout today in the seed)
    assert.strictEqual(await p.ev(`gs().some(function(s){return lday(s.date)===lday(new Date())})`), false, 'rest day');
    assert.ok(await p.ev(`!!document.querySelector('#abs-sec .cchip')`), 'chip on a rest day');
    assert.strictEqual(await txt('#abs-sec .cchip-n'), '3 of last 7 days', 'days 1, 3 (old abs tick) and 6');
    assert.strictEqual(await p.ev(`document.querySelector('#abs-sec .jct').classList.contains('on')`), false);
    await shot('c1-home-chip.png');
    step('core chip shows on home on a rest day, counting old ticks');

    // One tap ticks today, and the count follows
    await p.ev(`document.querySelector('#abs-sec .jct').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`coreDone(lday(new Date()))`), true);
    assert.strictEqual(await p.ev(`document.querySelector('#abs-sec .jct').classList.contains('on')`), true);
    assert.strictEqual(await txt('#abs-sec .cchip-n'), '4 of last 7 days');
    await p.wait(300); await shot('c2-home-chip-ticked.png');
    step('one-tap tick on the chip');

    // Tapping the chip (not the tick) opens Today's core; the type-ahead offers past core exercises first
    await p.ev(`document.querySelector('#abs-sec .cchip-m').click();'ok'`); await p.wait(100);
    assert.ok(await p.ev(`document.getElementById('mov-core').classList.contains('active')`));
    assert.strictEqual(await txt('#mov-core h3'), "Today's core");
    assert.strictEqual(await p.ev('COD'), today);
    const sugs = () => p.ev(`[].map.call(document.querySelectorAll('#mov-core .ta-i'),function(b){return b.textContent;})`);
    await p.ev(`var i=document.querySelector('#mov-core .jcn');i.focus();i.dispatchEvent(new Event('focus'));'ok'`); await p.wait(100);
    let sug = await sugs();
    assert.deepStrictEqual(sug.slice(0, 3), ['Plank', 'Leg Raise', 'Side Plank'], 'past core exercises (newest first), then common ones: ' + sug);
    await shot('c3-sheet-typeahead.png');
    await p.ev(`var i=document.querySelector('#mov-core .jcn');i.value='pl';i.dispatchEvent(new Event('input'));'ok'`); await p.wait(100);
    sug = await sugs();
    assert.deepStrictEqual(sug, ['Plank', 'Side Plank'], 'filtered as you type: ' + sug);
    await p.ev(`[].filter.call(document.querySelectorAll('#mov-core .ta-i'),function(b){return b.textContent==='Plank';})[0].click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`coreItems(lday(new Date()))`), [{ name: 'Plank', mode: 'time', sets: [] }], 'Plank remembered as timed');
    assert.strictEqual(await p.ev(`document.querySelector('#mov-core .cx .jcv').value`), '45', 'pre-filled with the last set');
    step('Today\'s core opens from the chip; type-ahead from past core exercises; mode remembered');

    // The stopwatch counts from a start time, so it survives the phone locking or the app being closed
    await p.ev(`document.querySelector('#mov-core .jsw').click();'ok'`);
    assert.strictEqual((await p.ev('gSW()')).name, 'Plank');
    await p.ev(`(function(){var s=gSW();s.t0-=62000;sSW(s);})();'ok'`); await p.wait(400);
    assert.strictEqual(await txt('#mov-core .jsw-t'), '1:02');
    await shot('c4-sheet-stopwatch.png');
    await p.go(APP);
    assert.ok(/stopwatch running/.test(await txt('#abs-sec .cchip-s')), 'the chip says a stopwatch is running');
    await p.ev(`openCore(lday(new Date()));'ok'`); await p.wait(400);
    assert.ok(/^1:0[2-4]$/.test(await txt('#mov-core .jsw-t')), 'still counting after a reload');
    await p.ev(`(function(){var s=gSW();s.t0=Date.now()-62400;sSW(s);})();document.querySelector('#mov-core .jsw').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`coreItems(lday(new Date()))[0].sets`), [{ secs: 62 }]);
    assert.strictEqual(await p.ev('gSW()'), null);
    step('stopwatch counts from a start time, survives a reload, and Stop logs the set');

    // A reps exercise typed in lower case joins the existing name; sets are added and removed
    await p.ev(`var i=document.querySelector('#mov-core .jcn');i.value='leg raise';document.querySelector('#mov-core .jcadd').click();'ok'`); await p.wait(100);
    const lr = `[].filter.call(document.querySelectorAll('#mov-core .cx'),function(c){return c.dataset.n==='Leg Raise';})[0]`;
    assert.strictEqual(await p.ev(`${lr}.querySelector('.cseg-b.on').dataset.m`), 'reps');
    await p.ev(`var c=${lr};var i=c.querySelector('.jcv');i.value='15';c.querySelector('.jcs').click();'ok'`); await p.wait(50);
    await p.ev(`${lr}.querySelector('.jcs').click();'ok'`); await p.wait(50);
    await p.ev(`${lr}.querySelector('.jcs').click();'ok'`); await p.wait(50);
    await p.ev(`${lr}.querySelector('.jcrm').click();'ok'`); await p.wait(50);
    assert.deepStrictEqual(await p.ev(`coreItems(lday(new Date()))[1]`), { name: 'Leg Raise', mode: 'reps', sets: [{ reps: 15 }, { reps: 15 }] });
    // A new exercise switched to Time is remembered as timed on another day
    await p.ev(`var i=document.querySelector('#mov-core .jcn');i.value='Dead Bug';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));'ok'`); await p.wait(100);
    const db = `[].filter.call(document.querySelectorAll('#mov-core .cx'),function(c){return c.dataset.n==='Dead Bug';})[0]`;
    assert.strictEqual(await p.ev(`${db}.querySelector('.cseg-b.on').dataset.m`), 'reps');
    await p.ev(`${db}.querySelector('.cseg-b[data-m="time"]').click();'ok'`); await p.wait(50);
    await p.ev(`var c=${db};var i=c.querySelector('.jcv');i.value='30';c.querySelector('.jcs').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`coreItems(lday(new Date()))[2]`), { name: 'Dead Bug', mode: 'time', sets: [{ secs: 30 }] });
    await shot('c5-sheet-exercises.png');
    await p.ev(`document.querySelector('#mov-core .jcx').click();openCore('${day[2]}');var i=document.querySelector('#mov-core .jcn');i.value='Dead Bug';document.querySelector('#mov-core .jcadd').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`coreMode('Dead Bug')`), 'time');
    assert.strictEqual(await p.ev(`document.querySelector('#mov-core .cseg-b.on').dataset.m`), 'time', 'remembered on another day');
    assert.strictEqual(await txt('#mov-core h3'), 'Core', 'a past day is titled by its date');
    await p.ev(`document.querySelector('#mov-core .jcdel').click();'ok'`); await p.wait(50);
    assert.deepStrictEqual(await p.ev(`coreItems('${day[2]}')`), [], 'an exercise with no sets is removed in one tap');
    assert.strictEqual(await p.ev(`coreDone('${day[2]}')`), false, 'adding without sets did not tick the day');
    await p.ev(`document.querySelector('#mov-core .jcx').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.getElementById('mov-core').classList.contains('active')`), false);
    assert.strictEqual(await txt('#abs-sec .cchip-s'), 'Plank 62s, Leg Raise 2×15, Dead Bug 30s');
    await shot('c6-home-chip-logged.png');
    step('reps and time exercises, sets added and removed, mode remembered across days');

    // Workout screen: the same chip between the header and the exercises, hidden when editing a past session
    await p.ev(`openWK('Legs');'ok'`); await p.wait(300);
    const pos = await p.ev(`(function(){var h=document.querySelector('#s-wk .header').getBoundingClientRect(),c=document.getElementById('wk-core').getBoundingClientRect(),l=document.getElementById('elist').getBoundingClientRect();return [h.bottom<=c.top,c.bottom<=l.top+10,c.height>40];})()`);
    assert.deepStrictEqual(pos, [true, true, true], 'chip sits between the header and the exercise list');
    assert.strictEqual(await txt('#wk-core .cchip-s'), 'Plank 62s, Leg Raise 2×15, Dead Bug 30s');
    await p.ev(`document.querySelector('#wk-core .cchip-m').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev('COD'), today);
    await p.ev(`document.querySelector('#mov-core .jcx').click();'ok'`); await p.wait(100);
    assert.ok(await p.ev(`document.getElementById('s-wk').classList.contains('active')&&CW==='Legs'`), 'closing the sheet stays in the workout');
    await shot('c7-workout-chip.png');
    await p.ev(`goHome();var i=gs().length-1;openWK(gs()[i].workout,gs()[i].exercises,i);'ok'`); await p.wait(200);
    assert.strictEqual(await p.ev(`document.getElementById('wk-core').style.display`), 'none', 'hidden when editing a past session');
    await p.ev(`goHome();'ok'`);
    step('workout screen chip; hidden when editing a past session');

    // History: a core row on every workout card, both cards on a two-workout day (old abs ticks included), and a card of
    // its own on a day with core but no workout. Each shows the tick, and what was logged or a prompt to add it. A day
    // ticked as a whole (no workout flagged) shows core on its latest workout.
    await p.ev(`switchTab('history');document.querySelectorAll('.hwg').forEach(function(g,i){if(i<2)g.classList.add('open');});'ok'`); await p.wait(300);
    const rows = () => p.ev(`(function(){var o={};document.querySelectorAll('.jhc').forEach(function(b){var t=b.querySelector('.jhct');
      (o[b.dataset.day]=o[b.dataset.day]||[]).push((b.classList.contains('hco')?'card ':'')+((b.classList.contains('hco')||b.classList.contains('on'))&&t.classList.contains('on')?'on ':'off ')+b.querySelector('.hcx-s,.hco-s').textContent);});return o;})()`);
    const hl = await rows();
    assert.deepStrictEqual(hl[day[3]], ['on Done · tap to add exercises'], 'old per-session tick shows as done');
    assert.deepStrictEqual(hl[day[6]], ['on Plank 45s, Leg Raise 2×12', 'off Not done · tap to add exercises'], 'a core day with two workouts: on the latest');
    assert.deepStrictEqual(hl[day[9]], ['off Not done · tap to add exercises', 'off Not done · tap to add exercises'], 'both workouts of a day without core');
    assert.deepStrictEqual(hl[day[1]], ['card on Plank 60s/60s/45s, Leg Raise 15/15/12'], 'core-only day card');
    assert.deepStrictEqual(hl[day[10]], ['card on Done · tap to add exercises'], 'tick-only day card');
    assert.deepStrictEqual(hl[today], ['card on Plank 62s, Leg Raise 2×15, Dead Bug 30s'], 'today, no workout');
    assert.strictEqual(await p.ev(`[].every.call(document.querySelectorAll('.hcard'),function(c){return c.querySelectorAll('.hcx .jhct').length===1;})`), true, 'every workout card has one core row with a tick');
    assert.strictEqual(await p.ev(`document.querySelectorAll('.hcard .hcx').length`), await p.ev(`gs().length`), 'one core row per workout');
    assert.strictEqual(await p.ev(`document.querySelectorAll('.hcard-btn').length>0&&[].every.call(document.querySelectorAll('.hcard-btn'),function(b){return b.textContent!=='C';})`), true, 'no more C button');
    const offs = [].concat.apply([], Object.values(hl)).filter(t => /^off/.test(t));
    assert.ok(offs.length && offs.every(t => t === 'off Not done · tap to add exercises'), 'days without core offer the tick and exercises: ' + offs);
    await p.ev(`document.querySelector('#s-hist').scrollTop=0;'ok'`); await shot('c8-history.png');
    await p.ev(`document.querySelector('.jhc[data-day="${day[1]}"]').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev('COD'), day[1], 'tapping the card opens that day');
    await shot('c9-sheet-past-day.png');
    const openBefore = await p.ev(`document.querySelectorAll('.hwg.open').length`);
    await p.ev(`document.querySelector('#mov-core .jcx').click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`document.querySelectorAll('.hwg.open').length`), openBefore, 'open weeks stay open after editing');
    step('History: a core row on every workout card (two on a two-workout day), core-only cards, old ticks; tapping opens that day');

    // The tick marks core on that workout only, right from History without opening the sheet: on a two-workout day the
    // other card stays as it was (cards are newest first: the evening Muay Thai, then the day's other workout)
    const tk = (n, i) => `document.querySelectorAll('.hcx[data-day="${day[n]}"] .jhct')[${i}]`;
    const sid = (n, i) => p.ev(`document.querySelectorAll('.hcx[data-day="${day[n]}"]')[${i}].dataset.sid`);
    const flagged = n => p.ev(`gs().filter(function(s){return lday(s.date)==='${day[n]}'&&s.abs;}).map(function(s){return s.id;})`);
    const [mt9, other9] = [await sid(9, 0), await sid(9, 1)];
    await p.ev(`${tk(9, 0)}.click();'ok'`); await p.wait(100);
    assert.deepStrictEqual([await p.ev(`coreDone('${day[9]}')`), await p.ev('COD')], [true, null], 'the day is ticked, sheet not opened');
    assert.deepStrictEqual((await rows())[day[9]], ['on Done · tap to add exercises', 'off Not done · tap to add exercises'], 'only the card tapped');
    assert.deepStrictEqual(await flagged(9), [mt9], 'core is flagged on that workout only');
    assert.strictEqual(await p.ev(`document.querySelectorAll('.hcx[data-day="${day[9]}"] .jhct.pop').length`), 1, 'the pop plays on that card');
    assert.strictEqual(await p.ev('CPOP'), null, 'the pop plays once');
    assert.strictEqual(await p.ev(`document.querySelectorAll('.hwg.open').length`), openBefore, 'open weeks stay open');
    await p.ev(`${tk(9, 1)}.click();'ok'`); await p.wait(100);
    assert.deepStrictEqual((await rows())[day[9]], ['on Done · tap to add exercises', 'on Done · tap to add exercises'], 'the other card can have it too');
    await p.ev(`${tk(9, 0)}.click();'ok'`); await p.wait(100);
    assert.deepStrictEqual((await rows())[day[9]], ['off Not done · tap to add exercises', 'on Done · tap to add exercises'], 'unticking one leaves the other');
    assert.deepStrictEqual([await p.ev(`coreDone('${day[9]}')`), await flagged(9)], [true, [other9]], 'the day stays a core day');
    await p.ev(`${tk(9, 1)}.click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`coreDone('${day[9]}')`), false, "no sets: one tap on the day's last workout with core unticks the day");
    assert.deepStrictEqual((await rows())[day[9]], ['off Not done · tap to add exercises', 'off Not done · tap to add exercises']);
    // With sets logged, taking core off the day's last workout with it asks first, as on the home chip, because it
    // clears them; while another workout still has core it doesn't
    await p.ev(`${tk(6, 0)}.click();'ok'`);
    assert.deepStrictEqual([await p.ev(`coreDone('${day[6]}')`), await p.ev(`${tk(6, 0)}.textContent`)], [true, 'Confirm?']);
    await p.ev(`rHist();'ok'`);
    await p.ev(`${tk(6, 1)}.click();'ok'`); await p.wait(100);
    assert.deepStrictEqual((await rows())[day[6]], ['on Plank 45s, Leg Raise 2×12', 'on Plank 45s, Leg Raise 2×12']);
    await p.ev(`${tk(6, 0)}.click();'ok'`); await p.wait(100);
    assert.deepStrictEqual((await rows())[day[6]], ['off Not done · tap to add exercises', 'on Plank 45s, Leg Raise 2×12'], 'one tap: the exercises stay with the day');
    // Tapping the rest of a workout card's row opens that day, remembering the card
    await p.ev(`document.querySelectorAll('.hcx[data-day="${day[9]}"] .hcx-m')[1].click();'ok'`); await p.wait(100);
    assert.deepStrictEqual([await p.ev('COD'), await p.ev('COS')], [day[9], other9], 'the row opens that day');
    // Core started in that sheet goes with that card's workout
    await p.ev(`document.querySelector('#mov-core .csh-h .jct').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await flagged(9), [other9]);
    await p.ev(`document.querySelector('#mov-core .jcx').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual((await rows())[day[9]], ['off Not done · tap to add exercises', 'on Done · tap to add exercises']);
    assert.strictEqual(await p.ev('COS'), null);
    await p.ev(`${tk(9, 1)}.click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`coreDone('${day[9]}')`), false);
    step('the tick marks core on that workout only; the day stays a core day while one has it; the row opens it');

    // Progress: best hold or reps per core exercise with a small trend, and the day counts
    await p.ev(`switchTab('progress');'ok'`); await p.wait(1200);
    const pc = await p.ev(`(function(){var r={};document.querySelectorAll('#prog-core .cp-row').forEach(function(x){r[x.querySelector('.cp-n').textContent]=[x.querySelector('.cp-d').textContent,!!x.querySelector('polyline')];});return {h:document.querySelector('#prog-core h3').textContent,n:[].map.call(document.querySelectorAll('#prog-core .cp-sum b'),function(b){return b.textContent;}),r:r};})()`);
    assert.strictEqual(pc.h, 'Core'); assert.deepStrictEqual(pc.n, ['4', '6']);
    assert.ok(/^Best hold 62s · /.test(pc.r.Plank[0]) && pc.r.Plank[1], 'Plank: ' + pc.r.Plank);
    assert.ok(/^Best 15 reps · /.test(pc.r['Leg Raise'][0]) && pc.r['Leg Raise'][1]);
    assert.ok(/^Best hold 30s/.test(pc.r['Dead Bug'][0]) && !pc.r['Dead Bug'][1], 'one day: no trend line yet');
    await p.ev(`document.getElementById('s-prog').scrollTop=1e5;'ok'`); await p.wait(200);
    await shot('c10-progress-core.png');
    step('Progress core section: best hold / reps and a trend per exercise');

    // Sync: the day record with its items reaches the Sheet backend, derived old ticks too
    await p.ev(`sSyncUrl('${SYNC}');switchTab('home');new Promise(function(r){csync(r);})`);
    let s = await store();
    assert.deepStrictEqual(s.core['c' + today].items, await p.ev(`coreItems(lday(new Date()))`));
    assert.strictEqual(s.core['c' + day[3]].done, true, 'old abs tick synced as a core day');
    assert.ok(s.core['c' + day[1]].items.length === 2);
    // Another device adds a set later: after a sync the chip shows it
    s.core['c' + today] = Object.assign({}, s.core['c' + today], { mt: Date.now() });
    s.core['c' + today].items = s.core['c' + today].items.map(it => it.name === 'Plank' ? Object.assign({}, it, { sets: it.sets.concat([{ secs: 50 }]) }) : it);
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`new Promise(function(r){csync(r);})`); await p.wait(100);
    assert.ok(/^Plank 62s\/50s/.test(await txt('#abs-sec .cchip-s')), 'merged from the other device');
    step('core items sync as the day record');

    // Unticking a day with logged sets asks for a second tap, then clears them
    await p.ev(`document.querySelector('#abs-sec .jct').click();'ok'`);
    assert.strictEqual(await p.ev(`coreDone(lday(new Date()))`), true, 'first tap only asks');
    assert.strictEqual(await txt('#abs-sec .jct'), 'Confirm?');
    await p.ev(`document.querySelector('#abs-sec .jct').click();'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`[coreDone(lday(new Date())),coreItems(lday(new Date()))]`), [false, []]);
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.deepStrictEqual([s.core['c' + today].done, s.core['c' + today].items], [false, []]);
    step('unticking a logged day takes two taps and clears it');

    // Coming back to the app on a new day redraws the chip (iOS resumes without reloading)
    await p.ev(`CCD='2000-01-01';document.querySelector('#abs-sec').innerHTML='';document.dispatchEvent(new Event('visibilitychange'));'ok'`); await p.wait(100);
    assert.ok(await p.ev(`!!document.querySelector('#abs-sec .cchip')&&CCD===lday(new Date())`));
    step('chip redraws when the app resumes on a new day');

    // A rest day's own card: unticking asks for a second tap, because the card then goes away
    await p.ev(`switchTab('history');'ok'`); await p.wait(200);
    const tick10 = `document.querySelector('.hco[data-day="${day[10]}"] .jhct')`;
    await p.ev(`${tick10}.click();'ok'`);
    assert.deepStrictEqual([await p.ev(`coreDone('${day[10]}')`), await p.ev(`${tick10}.textContent`)], [true, 'Confirm?'], 'first tap only asks');
    await p.ev(`${tick10}.click();'ok'`); await p.wait(100);
    assert.strictEqual(await p.ev(`coreDone('${day[10]}')`), false);
    assert.strictEqual(await p.ev(`document.querySelector('.jhc[data-day="${day[10]}"]')`), null, 'its card is gone');
    step('unticking a core-only card takes two taps and removes it');

    // A workout saved on a core day takes the day's core, unless another workout that day already has it
    await p.ev(`coreTick('${day[2]}',true);openWK('Legs');WDAY='${day[2]}';saveWK({Squat:[{kg:40,reps:8}]},false);'ok'`); await p.wait(100);
    await p.ev(`openWK('Upper Pull');WDAY='${day[2]}';saveWK({Dips:[{kg:0,reps:10}]},false);'ok'`); await p.wait(100);
    assert.deepStrictEqual(await p.ev(`gs().filter(function(s){return lday(s.date)==='${day[2]}';}).map(function(s){return s.workout+' '+!!s.abs;})`), ['Legs true', 'Upper Pull false']);
    step("a new workout takes the day's core only if no other workout that day has it");

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('SMOKE-CORE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
