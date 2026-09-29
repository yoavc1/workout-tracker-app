// End-to-end smoke test in headless Chrome at iPhone size (393x852) against a mock sync server.
// Usage: node tests/smoke.js   (set CHROME=/path/to/chrome if it isn't in /Applications)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

(async () => {
  const root = path.join(__dirname, '..');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-smoke-'));
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const store = async () => (await (await fetch(SYNC + '__store')).json()).store;
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    await p.go(APP); await p.ev(SEED); await p.go(APP);
    await p.shot(path.join(shots, '1-home.png'));

    // Layout: the nav sits fully on screen and scrolled content ends above it
    const nav = await p.ev(`(function(){var r=document.getElementById('nav').getBoundingClientRect();return {top:r.top,bottom:r.bottom,h:innerHeight};})()`);
    assert.ok(nav.top > 0 && nav.bottom <= nav.h, 'nav on screen ' + JSON.stringify(nav));
    const lastCard = await p.ev(`(function(){var s=document.getElementById('s-home');s.scrollTop=1e5;return [].slice.call(document.querySelectorAll('.wcard')).pop().getBoundingClientRect().bottom;})()`);
    assert.ok(lastCard < nav.top, 'last card clears the nav');
    await p.ev(`document.getElementById('s-home').scrollTop=0;document.documentElement.style.setProperty('--sab','34px');'ok'`); await p.wait(100);
    const inset = await p.ev(`innerHeight-document.getElementById('nav').getBoundingClientRect().bottom`);
    assert.strictEqual(Math.round(inset), 26, 'with a 34px home-indicator inset the nav sits 26px up');
    await p.shot(path.join(shots, '2-home-iphone-inset.png'));
    await p.ev(`document.documentElement.style.removeProperty('--sab');'ok'`);
    step('home renders; nav fully on screen, also with a home-indicator inset');

    // Workout screen bottom bar and rest timer
    await p.ev(`openWK('Legs');'ok'`); await p.wait(300);
    const bb = await p.ev(`(function(){var r=document.getElementById('bbar').getBoundingClientRect();return [r.top,r.bottom,innerHeight];})()`);
    assert.ok(bb[0] > 0 && bb[1] === bb[2], 'bottom bar pinned to the bottom');
    await p.shot(path.join(shots, '3-workout.png'));
    await p.ev(`startT(90);RE-=60000;'ok'`); await p.wait(400);
    assert.strictEqual(await p.ev(`document.getElementById('ttime').textContent`), '0:30', 'timer counts to an end time');
    await p.ev(`document.getElementById('tstop').click();goHome();'ok'`);
    step('workout bottom bar and rest timer');

    // First sync uploads everything, with ids
    await p.ev(`sSyncUrl('${SYNC}');new Promise(function(r){csync(r);})`);
    let s = await store(); const n0 = await p.ev('gs().length');
    assert.strictEqual(s.sessions.length, n0); assert.ok(s.sessions.every(x => x.id), 'ids pushed');
    step('first sync pushes local data');

    // Log a workout through the UI; the debounced sync pushes it
    await p.ev(`openWK('Upper Push');document.querySelector('.ecard .jtog').click();document.querySelector('.jadd').click();'ok'`); await p.wait(200);
    await p.ev(`var k=document.querySelector('.jkg'),r=document.querySelector('.jrp');k.value='55';k.dispatchEvent(new Event('input'));r.value='9';r.dispatchEvent(new Event('input'));document.getElementById('btn-fin').click();'ok'`);
    await p.wait(2800); s = await store();
    const last = s.sessions[s.sessions.length - 1];
    assert.strictEqual(s.sessions.length, n0 + 1); assert.strictEqual(last.workout, 'Upper Push');
    assert.deepStrictEqual(last.exercises, { Dips: [{ kg: 55, reps: 9 }] }); assert.ok(last.id && last.mt);
    step('logging a workout syncs it');

    // Another device adds one session and deletes another, while this device edits offline
    const victim = s.sessions[0].id; s.sessions.shift(); s.deleted = Object.assign(s.deleted || {}, { [victim]: Date.now() });
    s.sessions.push({ id: 'otherdev1', mt: Date.now(), workout: 'Muay Thai', date: new Date(Date.now() - 5 * 864e5).toISOString(), exercises: { Pads: [{ kg: 0, reps: 5 }] }, duration: 0, abs: true });
    await fetch(SYNC + '__store', { method: 'PUT', body: JSON.stringify(s) });
    await p.ev(`(function(){var d=gd();d.sessions[3].abs=true;d.sessions[3].mt=Date.now();localStorage.setItem('ironlog_data',JSON.stringify(d));})();'ok'`);
    await p.ev(`switchTab('history');new Promise(function(r){csync(r);})`); await p.wait(300);
    const loc = await p.ev(`(function(){var s=gs();return {hasOther:s.some(function(x){return x.id==='otherdev1'}),victimGone:!s.some(function(x){return x.id==='${victim}'}),abs:s.filter(function(x){return x.abs}).length};})()`);
    s = await store();
    assert.deepStrictEqual(loc, { hasOther: true, victimGone: true, abs: 2 });
    assert.strictEqual(s.sessions.filter(x => x.abs).length, 2, 'local edit reached the cloud');
    step('merge keeps both devices\' changes');

    // Core is one record per day: the home chip's tick and History's core line both go through it, and it syncs as core
    const today = await p.ev(`lday(new Date())`);
    await p.ev(`switchTab('home');document.querySelector('#abs-sec .jct').click();'ok'`);
    assert.strictEqual(await p.ev(`coreDone(lday(new Date()))`), true, 'home tick sets the day');
    assert.ok(await p.ev(`gs().filter(function(s){return lday(s.date)===lday(new Date())}).every(function(s){return s.abs})`), 'abs kept in step');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.strictEqual(s.core['c' + today].done, true, 'core day synced');
    await p.ev(`switchTab('history');document.querySelector('.hwg.open .jhc.on').click();'ok'`);
    assert.strictEqual(await p.ev(`COD`), today, 'History core line opens that day');
    await p.ev(`document.querySelector('#mov-core .csh-h .jct').click();document.querySelector('#mov-core .jcx').click();'ok'`);
    assert.strictEqual(await p.ev(`coreDone(lday(new Date()))`), false, 'the day sheet unticks the same day');
    assert.strictEqual(await p.ev(`document.querySelector('.hwg.open .jhc.on')`), null);
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.strictEqual(s.core['c' + today].done, false); assert.ok(s.muscleMap && s.muscleMap.Dips === 'Chest/Lower', 'muscle map sent to the Sheet');
    assert.strictEqual(await p.ev(`'muscleMap' in JSON.parse(localStorage.getItem('ironlog_data'))`), false);
    step('home core chip and History core line share one synced day record');

    // History: newest week first, labelled Monday to Sunday
    const wk = await p.ev(`(function(){var s=gss();var k=gwk(s[s.length-1].date);var q=k.split('-');return {label:document.querySelector('.hwt').textContent,expect:fwr(k),dow:new Date(q[0],q[1]-1,q[2]).getDay()};})()`);
    assert.strictEqual(wk.label, wk.expect); assert.strictEqual(wk.dow, 1, 'week starts on Monday');
    await p.shot(path.join(shots, '4-history.png'));
    step('history weeks start on Monday');

    // Delete needs a second tap
    const before = await p.ev('gs().length');
    await p.ev(`document.querySelector('.hwg.open .jd').click();'ok'`);
    assert.strictEqual(await p.ev('gs().length'), before, 'one tap does not delete');
    await p.ev(`document.querySelector('.hwg.open .jd').click();'ok'`);
    assert.strictEqual(await p.ev('gs().length'), before - 1);
    step('two-tap delete');

    // Rename carries history, the split day and list position
    await p.ev(`sSplit({Mon:'Legs'});switchTab('home');showManage();var i=document.querySelector('.jrn[data-n="Legs"]');i.value='Leg Day';i.parentNode.querySelector('.jrs').click();'ok'`);
    const rn = await p.ev(`({order:Object.keys(gw()),old:gs().filter(function(s){return s.workout==='Legs'}).length,renamed:gs().filter(function(s){return s.workout==='Leg Day'}).length,split:gSplit().Mon})`);
    assert.deepStrictEqual(rn.order, ['Leg Day', 'Upper Pull', 'Upper Push', 'Muay Thai']);
    assert.strictEqual(rn.old, 0); assert.ok(rn.renamed > 0); assert.strictEqual(rn.split, 'Leg Day');
    step('rename carries history and split');

    // The weekly plan in the Schedule sheet saves into synced data
    await p.ev(`document.getElementById('btn-split').click();document.querySelector('.wp-p[data-day="Tue"] .wp-b').click();'ok'`); await p.wait(100);
    await p.ev(`document.querySelector('#sd-opts .jsd[data-v="Upper Pull"]').click();document.getElementById('sch-x').click();'ok'`);
    assert.strictEqual(await p.ev(`gSplit().Tue`), 'Upper Pull');
    await p.ev(`new Promise(function(r){csync(r);})`); s = await store();
    assert.deepStrictEqual({ mon: s.schedule.week.Mon, tue: s.schedule.week.Tue }, { mon: 'Leg Day', tue: 'Upper Pull' }, 'plan synced as schedule');
    assert.ok(s.schedule.wkm > 1);
    step('weekly plan editor saves and syncs as schedule');

    // A failing sync is shown, not swallowed
    await p.ev(`sSyncUrl('http://127.0.0.1:9/');new Promise(function(r){csync(r);})`);
    assert.ok(/^Sync failed/.test(await p.ev('gSt().m')));
    assert.ok(/not synced/.test(await p.ev(`document.getElementById('hsub').textContent`)));
    step('sync failure is visible');

    // Other screens render
    await p.ev(`sSyncUrl('');switchTab('progress');'ok'`); await p.wait(1500); await p.shot(path.join(shots, '5-progress.png'));
    await p.ev(`goSet();'ok'`); await p.wait(400); await p.shot(path.join(shots, '6-settings.png'));
    step('progress and settings render');

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('SMOKE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
