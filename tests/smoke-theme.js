// End-to-end checks for the theme (Track G) in headless Chrome at iPhone size (393x852): Auto / Light / Dark from Settings,
// the old toggle's migration, no flash of the wrong theme, live flips with the phone's appearance, text contrast in both
// themes, and screenshots of every screen and sheet in both. Usage: node tests/smoke-theme.js  (SHOTS=dir keeps the PNGs there)
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const { staticServer, mockSync, launchChrome, urlOf, SEED } = require('./lib');

(async () => {
  const root = path.join(__dirname, '..');
  const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'wt-theme-'));
  fs.mkdirSync(shots, { recursive: true });
  const site = await staticServer(root), sync = await mockSync(), chrome = await launchChrome();
  const APP = urlOf(site) + 'index.html', SYNC = urlOf(sync);
  const step = (name) => console.log('  ✓ ' + name);
  let ok = false;
  try {
    const p = await chrome.page();
    const phone = v => p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
    // Note the theme at the moment <body> is created: it must already be the final one, or the page would flash
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__atBody='none';new MutationObserver(function(m,o){if(document.body){window.__atBody=document.documentElement.getAttribute('data-theme');o.disconnect();}}).observe(document,{childList:true,subtree:true});` });
    const theme = () => p.ev(`document.documentElement.getAttribute('data-theme')`);
    const stored = () => p.ev(`[localStorage.getItem('ironlog_theme'),localStorage.getItem('ironlog_theme_v')]`);
    const metas = () => p.ev(`[].map.call(document.querySelectorAll('meta[name="theme-color"]'),function(m){return m.content;})`);
    const reload = async (setup) => { await p.ev(setup + `;'ok'`); await p.go(APP); };
    const LIGHT = '#e8f0f8', DARK = '#11141c';

    await phone('light'); await p.go(APP); await p.ev(SEED);
    // Put a workout on today so the home screen shows the core tick box as well
    await p.ev(`addS({workout:'Upper Push',date:new Date().toISOString(),exercises:{Dips:[{kg:10,reps:9}]},duration:2400});'ok'`);

    // Migration from the old Dark Mode toggle: 'light' stays Light, anything else becomes Auto, exactly once
    await reload(`localStorage.setItem('ironlog_theme','dark');localStorage.removeItem('ironlog_theme_v')`);
    assert.deepStrictEqual([await theme(), await stored()], ['light', ['auto', '2']], "old 'dark' becomes Auto (phone is light)");
    await phone('dark'); await reload(`localStorage.setItem('ironlog_theme','light');localStorage.removeItem('ironlog_theme_v')`);
    assert.deepStrictEqual([await theme(), await stored()], ['light', ['light', '2']], "old 'light' stays Light on a dark phone");
    await reload(`localStorage.removeItem('ironlog_theme');localStorage.removeItem('ironlog_theme_v')`);
    assert.deepStrictEqual([await theme(), await stored()], ['dark', ['auto', '2']], 'a fresh install is Auto');
    assert.strictEqual(await p.ev('window.__atBody'), 'dark', 'the theme is set before <body> exists, so nothing flashes');
    assert.deepStrictEqual(await metas(), [LIGHT, DARK], 'Auto keeps the light/dark theme-color pair');
    step('old toggle migrates; Auto by default; theme set before the first paint');

    // Settings: the segmented control picks Auto / Light / Dark and stays on this device
    await p.ev(`goSet();'ok'`); await p.wait(300);
    const seg = () => p.ev(`[].map.call(document.querySelectorAll('#theme-seg .seg-b'),function(b){return b.dataset.th+(b.classList.contains('active')?'*':'')+(b.getAttribute('aria-pressed')==='true'?'!':'')}).join(' ')`);
    assert.strictEqual(await seg(), 'auto*! light dark');
    assert.strictEqual(await p.ev(`document.getElementById('tog')`), null, 'the old toggle is gone');
    const segH = await p.ev(`Math.min.apply(null,[].map.call(document.querySelectorAll('#theme-seg .seg-b'),function(b){return b.getBoundingClientRect().height}))`);
    assert.ok(segH >= 36, 'tap targets at least 36px, got ' + segH);
    await phone('light');
    await p.ev(`document.querySelector('#theme-seg [data-th="dark"]').click();'ok'`);
    assert.deepStrictEqual([await theme(), (await stored())[0], await seg()], ['dark', 'dark', 'auto light dark*!']);
    assert.deepStrictEqual(await metas(), [DARK, DARK], 'a fixed Dark colours both theme-color tags');
    assert.strictEqual(await p.ev(`document.getElementById('theme-d').textContent`), 'Always dark');
    await p.go(APP);
    assert.deepStrictEqual([await theme(), await p.ev('window.__atBody')], ['dark', 'dark'], 'Dark survives a reload on a light phone');
    await p.ev(`goSet();document.querySelector('#theme-seg [data-th="light"]').click();'ok'`);
    assert.deepStrictEqual([await theme(), (await stored())[0], await metas()], ['light', 'light', [LIGHT, LIGHT]]);
    await phone('dark'); await p.wait(100);
    assert.strictEqual(await theme(), 'light', 'a fixed Light ignores the phone');
    await p.ev(`document.querySelector('#theme-seg [data-th="auto"]').click();'ok'`);
    assert.deepStrictEqual([await theme(), (await stored())[0], await metas()], ['dark', 'auto', [LIGHT, DARK]]);
    step('Settings Auto / Light / Dark; the choice persists and drives theme-color');

    // Auto flips live with the phone and redraws the open screen (charts read CSS variables when they draw)
    await p.ev(`switchTab('progress');window.__rv=0;var __r=refreshView;refreshView=function(){__rv++;__r();};'ok'`); await p.wait(400);
    await phone('light'); await p.wait(200);
    assert.deepStrictEqual([await theme(), await p.ev('__rv')], ['light', 1], 'flips to light and redraws once');
    await phone('dark'); await p.wait(200);
    assert.deepStrictEqual([await theme(), await p.ev('__rv')], ['dark', 2]);
    await p.ev(`document.dispatchEvent(new Event('visibilitychange'));'ok'`);
    assert.strictEqual(await p.ev('__rv'), 2, 'no redraw when nothing changed');
    const card = await p.ev(`(function(){var c=getComputedStyle(document.querySelector('#s-set .sitem'));return [c.backgroundColor,c.borderTopColor,c.borderTopWidth];})()`);
    assert.deepStrictEqual(card, ['rgb(27, 31, 42)', 'rgb(228, 232, 241)', '2px'], 'dark cards keep the bold 2px outline');
    step('Auto follows the phone live and redraws');

    // Charts take their colours from CSS variables as they draw, so a live flip must redraw the open ones:
    // Progress v2's exercise detail and a goal's detail sheet
    const charts = async () => p.ev(`(function(){var t1=getComputedStyle(document.documentElement).getPropertyValue('--t1').trim(),o={};
      if(typeof PCI!=='undefined'&&PCI)o.prog=JSON.stringify(PCI.config.data.datasets.map(function(x){return x.borderColor;})).indexOf(t1)>=0||JSON.stringify(PCI.config.options.scales).indexOf(getComputedStyle(document.documentElement).getPropertyValue('--t2').trim())>=0;
      if(typeof GCI!=='undefined'&&GCI)o.goal=GCI.config.data.datasets.some(function(x){return x.borderColor===t1;});return o;})()`);
    const hasPg = await p.ev(`typeof pgOpen==='function'`), hasGoals = await p.ev(`typeof openGoal==='function'`);
    if (hasPg) {
      await p.ev(`switchTab('progress');'ok'`); await p.wait(300); await p.ev(`pgOpen('Squat - Dumbbell');'ok'`); await p.wait(300);
      const before = await p.ev('PCI&&PCI.id'); await phone('light'); await p.wait(300);
      assert.ok(await p.ev(`PCI&&PCI.id!==${before}`), 'Progress detail chart redrawn'); assert.strictEqual((await charts()).prog, true, 'in the light colours');
      await phone('dark'); await p.wait(300); assert.strictEqual((await charts()).prog, true, 'and back in the dark colours');
      await p.ev(`pgBack();'ok'`);
    }
    if (hasGoals) {
      await p.ev(`(function(){var a=new Date(),b=new Date();a.setDate(a.getDate()-60);b.setMonth(b.getMonth()+4);var id=addGoal({exercise:'Squat - Dumbbell',startKg:40,startDate:lday(a),targetKg:70,targetDate:lday(b),archived:false});switchTab('goals');openGoal(id);})();'ok'`); await p.wait(300);
      assert.strictEqual((await charts()).goal, true); await phone('light'); await p.wait(300);
      assert.strictEqual((await charts()).goal, true, 'goal chart redrawn in the light colours');
      assert.ok(await p.ev(`document.getElementById('mov-goal').classList.contains('active')`), 'the goal sheet stays open');
      await p.ev(`closeGoalM();'ok'`); await phone('dark'); await p.wait(200);
    }
    if (hasPg || hasGoals) step('open charts redraw in the new colours');

    // Contrast of the main text colours on every surface, in both themes (WCAG AA for body text: 4.5:1)
    const contrast = () => p.ev(`(function(){
      var e=document.createElement('i');document.body.appendChild(e);
      function rgb(t){e.style.color='var(--'+t+')';return getComputedStyle(e).color.match(/[\\d.]+/g).slice(0,3).map(Number);}
      function lum(c){c=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
      function cr(a,b){var x=lum(rgb(a)),y=lum(rgb(b));return Math.round((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)*100)/100;}
      var o={};['t1','t2'].forEach(function(t){['bg','card','card2','input'].forEach(function(s){o[t+'/'+s]=cr(t,s);});});
      o['on-accent/accent']=cr('on-accent','accent');['pos-bg','warn-bg','info-bg'].forEach(function(s){o['t1/'+s]=cr('t1',s);});
      o['t3/card (hints)']=cr('t3','card');e.remove();return o;})()`);
    const report = {};
    for (const t of ['light', 'dark']) {
      await p.ev(`sTheme('${t}');'ok'`);
      const c = report[t] = await contrast();
      Object.keys(c).filter(k => !/hints/.test(k)).forEach(k => assert.ok(c[k] >= 4.5, t + ' ' + k + ' contrast ' + c[k] + ' < 4.5'));
    }
    console.log('    contrast ' + Object.keys(report.light).map(k => k + ' ' + report.light[k] + '|' + report.dark[k]).join(', '));
    step('text contrast at least 4.5:1 in both themes');

    // The choice is device-only: it never reaches the synced data
    await p.ev(`sTheme('dark');sSyncUrl('${SYNC}');new Promise(function(r){csync(r);})`);
    const cloud = JSON.stringify((await (await fetch(SYNC + '__store')).json()).store);
    assert.ok(cloud.length > 100 && !/ironlog_theme|"theme"/.test(cloud), 'theme not synced');
    await p.ev(`sSyncUrl('');'ok'`);
    step('theme stays on the device');

    // Screenshots of every screen and sheet in both themes. Sheets that another track has since replaced are skipped.
    const shot = async (name, t) => { await p.wait(350); await p.shot(path.join(shots, name + '-' + t + '.png')); };
    const closeAll = `document.querySelectorAll('.mov.active,.hmpop-ov.active').forEach(function(m){m.classList.remove('active');});`;
    const sheet = async (name, t, open) => { const r = await p.ev(`(function(){${open}})()`); if (r === false) return console.log('    (skipped ' + name + ')'); await shot(name, t); await p.ev(closeAll + `'ok'`); };
    // Today's core has a timed and a reps exercise, so both themes show the same logged state
    await p.ev(`if(typeof setCoreItems==='function')setCoreItems(lday(new Date()),[{name:'Plank',mode:'time',sets:[{secs:60},{secs:60},{secs:45}]},{name:'Leg Raise',mode:'reps',sets:[{reps:15},{reps:12}]}]);'ok'`);
    for (const t of ['light', 'dark']) {
      await p.ev(`sTheme('${t}');goHome();document.getElementById('s-home').scrollTop=0;document.getElementById('toast').classList.remove('show');'ok'`);
      await shot('01-home', t);
      // All three insight colours, using the home screen's own markup
      await p.ev(`document.getElementById('ins-sec').innerHTML='<div class="hsec"><div class="hsec-t">Insights</div><div style="display:flex;flex-direction:column;gap:8px">'+[['pos','🏆','<strong>New PR</strong> — Dips hit 12 kg'],['warn','⚠️','<strong>Legs</strong> not logged in 9 days'],['info','📅','<strong>Upper Pull</strong> is scheduled for today']].map(function(i){return '<div class="ins '+i[0]+'"><div class="ins-icon">'+i[1]+'</div><div class="ins-text">'+i[2]+'</div></div>';}).join('')+'</div></div>';'ok'`);
      await shot('02-home-insights', t);
      await sheet('03-start-workout', t, `document.getElementById('nav-plus').click();`);
      await sheet('04-manage-workouts', t, `showManage();`);
      await sheet('05-weekly-split', t, `if(typeof openSplitEditor!=='function')return false;sSplit({Mon:'Legs',Wed:'Upper Pull',Fri:'Upper Push'});openSplitEditor();`);
      await sheet('06-split-day', t, `if(typeof openSD!=='function')return false;openSD('Mon');`);
      // Workout: one exercise open with a new-PR set, and the rest timer running
      await p.ev(`openWK('Legs');var h=document.querySelector('.ecard .jtog');if(h)h.click();var a=document.querySelector('.jadd');if(a)a.click();'ok'`); await p.wait(150);
      await p.ev(`var k=document.querySelector('.jkg'),r=document.querySelector('.jrp');if(k){k.value='99';k.dispatchEvent(new Event('input'));}if(r){r.value='8';r.dispatchEvent(new Event('input'));}startT(90);'ok'`);
      await shot('07-workout-timer', t);
      await sheet('08-add-exercise', t, `document.getElementById('btn-ae').click();`);
      await sheet('09-set-timer', t, `document.getElementById('btn-ct').click();`);
      // Dragging an exercise by its handle (Sortable's fallback clone carries the drag shadow), released mid-list
      const hd = await p.ev(`(function(){var e=document.querySelectorAll('#elist .ecard .jdrag')[1];if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
      if (hd) {
        const mouse = (type, x, y) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
        await mouse('mousePressed', hd.x, hd.y);
        for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', hd.x + i * 2, hd.y - i * 22); await p.wait(40); }
        await shot('10-drag-exercise', t); await mouse('mouseReleased', hd.x + 16, hd.y - 176); await p.wait(300);
      } else console.log('    (skipped 10-drag-exercise)');
      // Finish with a changed list: "Also update Legs?"
      await sheet('11-also-update', t, `if(typeof askTpl!=='function')return false;addEx('Leg Press');var ch=tplDiff();if(!ch)return false;askTpl(ch,function(){});`);
      await p.ev(`clDr();goHome();document.getElementById('toast').classList.remove('show');'ok'`);
      await sheet('12-edit-exercises', t, `if(typeof showExEd!=='function')return false;showManage();showExEd('Legs');`);
      await sheet('13-rename-exercise', t, `if(typeof showExEd!=='function')return false;showManage();showExEd('Legs');var b=document.querySelector('#exed .exr .jer');if(!b)return false;b.click();`);
      await p.ev(`switchTab('progress');'ok'`); await p.wait(1600);
      await shot('14-progress', t);
      await sheet('15-calendar-day', t, `var c=document.querySelector('.hmc.clk');if(!c)return false;c.click();`);
      // A chart with data (all time), then the section below it
      await p.ev(`var b=document.querySelector('#cttog [data-range="ALL"]');if(b)b.click();var s=document.getElementById('csel');if(s&&s.querySelector('option[value="Squat - Dumbbell"]')){s.value='Squat - Dumbbell';s.dispatchEvent(new Event('change'));}var o=document.querySelector('#ovtog [data-range="ALL"]');if(o)o.click();var c=document.getElementById('ccont');if(c)document.getElementById('s-prog').scrollTop=c.offsetTop-150;'ok'`); await p.wait(1400);
      await shot('16-progress-chart', t);
      await p.ev(`switchTab('history');'ok'`); await p.wait(200);
      await p.ev(`toast('Core added');'ok'`); await p.wait(300); await shot('17-history', t);
      await p.ev(`document.getElementById('toast').classList.remove('show');'ok'`);
      await sheet('18-change-date', t, `var b=document.querySelector('.hwg.open .jdt');if(!b)return false;b.click();`);
      await p.ev(`goSet();'ok'`); await shot('19-settings', t);
      // Goals: the list, a new goal, and a goal's detail chart (colours read from CSS variables as it draws)
      const gid = await p.ev(`(function(){if(typeof openGoal!=='function')return null;var g=gGoals().filter(function(x){return x.exercise==='Squat - Dumbbell';})[0];if(g)return g.id;var a=new Date(),b=new Date();a.setDate(a.getDate()-60);b.setMonth(b.getMonth()+4);return addGoal({exercise:'Squat - Dumbbell',startKg:40,startDate:lday(a),targetKg:70,targetDate:lday(b),archived:false});})()`);
      if (gid) {
        await p.ev(`switchTab('goals');'ok'`); await shot('20-goals', t);
        await sheet('21-new-goal', t, `openGoalNew();`);
        await sheet('22-goal-detail', t, `openGoal('${gid}');`);
      } else console.log('    (skipped 20-22 goals)');
      // Today's core sheet, with a timed and a reps exercise
      await sheet('23-core-sheet', t, `if(typeof openCore!=='function')return false;switchTab('home');openCore(lday(new Date()));`);
    }
    step('screenshots of every screen and sheet in both themes');

    assert.deepStrictEqual(p.errors, [], 'no JS errors');
    step('no JS errors');
    ok = true;
  } catch (e) {
    console.error('THEME SMOKE FAILED:', e.message);
  } finally {
    console.log('  screenshots: ' + shots);
    chrome.close(); site.close(); sync.close();
    setTimeout(() => process.exit(ok ? 0 : 1), 600);
  }
})();
