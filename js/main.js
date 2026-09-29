// Workout Tracker — Event wiring and start-up (loads last)
// ═══════ EVENTS ═══════
document.getElementById('btn-set').addEventListener('click',goSet);
document.getElementById('btn-split').addEventListener('click',openSplitEditor);
document.getElementById('btn-bk').addEventListener('click',function(){if(ESI===null)autoSave();goHome();});
document.getElementById('btn-bs').addEventListener('click',goHome);
document.getElementById('btn-fin').addEventListener('click',finWK);
document.getElementById('tog').addEventListener('click',tTheme);
document.getElementById('btn-exp').addEventListener('click',expD);
document.getElementById('btn-impt').addEventListener('click',function(){document.getElementById('impf').click();});
document.getElementById('impf').addEventListener('change',impD);
tap2(document.getElementById('btn-clr'),function(){localStorage.removeItem('ironlog_data');clDr();toast(gSyncUrl()?'Cleared on this device':'Cleared');goHome();});
document.getElementById('csel').addEventListener('change',rChart);
document.getElementById('nav').addEventListener('click',function(e){var t=e.target.closest('.ntab');if(t&&t.dataset.tab)switchTab(t.dataset.tab);});
document.getElementById('nav-plus').addEventListener('click',function(){
  var wk=gw();var opts=document.getElementById('quick-opts');
  var colors=['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22','#2c3e50'];
  var h='<div style="display:flex;flex-direction:column;gap:10px">';
  var ci=0;Object.keys(wk).forEach(function(n){var col=colors[ci%colors.length];ci++;
    h+='<button class="jqk" data-w="'+ea(n)+'" style="background:var(--card);border:2px solid var(--t1);border-radius:var(--r);padding:16px 18px;display:flex;align-items:center;gap:14px;cursor:pointer;text-align:left;font-family:var(--fb);transition:all 0.2s"><div style="width:6px;height:36px;border-radius:3px;background:'+col+';flex-shrink:0"></div><div><div style="font-family:var(--ff);font-size:16px;font-weight:700;color:var(--t1)">'+eh(n)+'</div><div style="font-size:12px;color:var(--t2);margin-top:2px">'+wk[n].length+' exercises</div></div></button>';
  });
  h+='</div>';opts.innerHTML=h;
  document.getElementById('mov-quick').classList.add('active');
  opts.querySelectorAll('.jqk').forEach(function(b){b.addEventListener('click',function(){document.getElementById('mov-quick').classList.remove('active');openWK(b.dataset.w);});});
});
document.getElementById('quick-cancel').addEventListener('click',function(){document.getElementById('mov-quick').classList.remove('active');});
document.getElementById('mov-quick').addEventListener('click',function(e){if(e.target===document.getElementById('mov-quick'))document.getElementById('mov-quick').classList.remove('active');});
document.getElementById('btn-surl').addEventListener('click',function(){var u=document.getElementById('sync-url').value.trim();if(!u){toast('Enter URL','var(--orange)');return;}sSyncUrl(u);toast('URL saved!');msync();});
document.getElementById('btn-sync').addEventListener('click',msync);
document.querySelectorAll('.tpre[data-secs]').forEach(function(b){b.addEventListener('click',function(){startT(parseInt(b.dataset.secs));});});
document.getElementById('tstop').addEventListener('click',function(){clearInterval(RTI);document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.remove('active');});
document.getElementById('tadd15').addEventListener('click',function(){RE+=15000;RS+=15;uTD();});
document.getElementById('btn-ct').addEventListener('click',function(){document.getElementById('mov-timer').classList.add('active');});
document.getElementById('tm-cancel').addEventListener('click',function(){document.getElementById('mov-timer').classList.remove('active');});
document.getElementById('tm-start').addEventListener('click',function(){var m=parseInt(document.getElementById('cmin').value)||0;var s=parseInt(document.getElementById('csec').value)||0;var t=m*60+s;if(t<=0){toast('Set a time','var(--orange)');return;}document.getElementById('mov-timer').classList.remove('active');startT(t);});
document.getElementById('btn-ae').addEventListener('click',function(){document.getElementById('mov-ex').classList.add('active');document.getElementById('new-ex').value='';setTimeout(function(){document.getElementById('new-ex').focus();},100);});
document.getElementById('ex-cancel').addEventListener('click',function(){document.getElementById('mov-ex').classList.remove('active');});
document.getElementById('ex-add').addEventListener('click',function(){var n=document.getElementById('new-ex').value.trim();if(!n){toast('Enter name','var(--orange)');return;}syncInp();var w=gw();w[CW].push(n);sw(w);CS[w[CW].length-1]=[];OE[w[CW].length-1]=true;document.getElementById('mov-ex').classList.remove('active');rEx();autoSave();toast(n+' added');});
document.getElementById('new-ex').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('ex-add').click();});
document.getElementById('hp-close').addEventListener('click',function(){document.getElementById('hmpop-ov').classList.remove('active');});
document.getElementById('rename-cancel').addEventListener('click',function(){document.getElementById('mov-rename').classList.remove('active');});
document.getElementById('mov-rename').addEventListener('click',function(e){if(e.target===document.getElementById('mov-rename'))document.getElementById('mov-rename').classList.remove('active');});
document.getElementById('rename-inp').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('rename-save').click();});
document.getElementById('hmpop-ov').addEventListener('click',function(e){if(e.target===document.getElementById('hmpop-ov'))document.getElementById('hmpop-ov').classList.remove('active');});
document.getElementById('manage-close').addEventListener('click',function(){document.getElementById('mov-manage').classList.remove('active');});
document.getElementById('mov-manage').addEventListener('click',function(e){if(e.target===document.getElementById('mov-manage'))document.getElementById('mov-manage').classList.remove('active');});
document.getElementById('sd-cancel').addEventListener('click',function(){document.getElementById('mov-splitday').classList.remove('active');});
document.getElementById('mov-splitday').addEventListener('click',function(e){if(e.target===document.getElementById('mov-splitday'))document.getElementById('mov-splitday').classList.remove('active');});
document.getElementById('date-cancel').addEventListener('click',function(){document.getElementById('mov-date').classList.remove('active');});
document.getElementById('date-save').addEventListener('click',function(){
  var val=document.getElementById('date-inp').value;if(!val){toast('Pick a date','var(--orange)');return;}
  var d=gd();var s=d.sessions[sIdx(editDateId)];if(!s){document.getElementById('mov-date').classList.remove('active');rHist();return;}
  var old=new Date(s.date);var nd=new Date(val);nd.setHours(old.getHours(),old.getMinutes(),old.getSeconds());
  var oldDay=lday(s.date);s.date=nd.toISOString();s.mt=Date.now();
  // A core tick travels with its session, as it did when core was stored per session
  if(s.abs){coreSet(d,lday(s.date),true);if(!d.sessions.some(function(x){return lday(x.date)===oldDay&&x.abs;}))coreSet(d,oldDay,false);}
  sd(d);
  document.getElementById('mov-date').classList.remove('active');rHist();toast('Date updated');
});
document.getElementById('mov-date').addEventListener('click',function(e){if(e.target===document.getElementById('mov-date'))document.getElementById('mov-date').classList.remove('active');});
// ═══════ INIT ═══════
(function(){var di=gDri();if(di&&di.sets){var h=false;Object.keys(di.sets).forEach(function(k){var s=di.sets[k];if(s&&s.length>0)s.forEach(function(x){if(x.kg!==''||x.reps!=='')h=true;});});if(!h)clDr();}})();
iTheme();
var ci=parseInt(sessionStorage.getItem('ins_idx')||'0');sessionStorage.setItem('ins_idx',String(ci+1));sessionStorage.removeItem('ins_dis');
// Sync on launch, when the app comes back to the foreground (iOS resumes home-screen apps rather than relaunching them)
// and when the connection returns; flush a pending save when it goes to the background.
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')csync();else if(syncT)csync();});
addEventListener('online',function(){csync();});
rHome();
csync();
