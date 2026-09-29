// Workout Tracker — Cloud sync with merge (sessions by id, tombstones, newest templates)
// ═══════ SYNC ═══════
// Merge instead of last-writer-wins. Record collections (sessions, core days, goals, schedule moves) are unioned by id,
// the latest edit (mt) wins and deletions travel as tombstones. Documents (workout templates, weekly plan, muscle
// overrides) take the most recently edited copy. Any device can sync at any time without wiping another's work.
function newer(a,b,f){var x=a[f]||0,y=b[f]||0;if(x!==y)return x>y?a:b;return(b.lastModified||0)>(a.lastModified||0)?b:a;}
function vals(o){return o?Object.keys(o).map(function(k){return o[k];}):[];}
function mergeRecs(la,lb,del,key){var by={},ids=[],out=[];
  [la,lb].forEach(function(l){(l||[]).forEach(function(r){var k=key(r),e=by[k];if(!e){ids.push(k);by[k]=r;}else if((r.mt||0)>(e.mt||0))by[k]=r;});});
  ids.forEach(function(k){var r=by[k];if(del[k]>=(r.mt||0))return;r.id=k;out.push(r);});return out;}
function byId(l){var o={};l.forEach(function(r){o[r.id]=r;});return o;}
function rid(r){return r.id;}
// The newer of two documents by timestamp, falling back to whichever side has one (same tie-breaks as templates)
function pickDoc(a,b,get,ts){var A={v:get(a),t:ts(a)||0,lastModified:a.lastModified},B={v:get(b),t:ts(b)||0,lastModified:b.lastModified};var w=newer(A,B,'t');if(!w.v)w=w===A?B:A;return w.v?w:null;}
function mergeD(a,b){
  a=normD(a);b=normD(b);
  var del={};
  [a,b].forEach(function(d){var x=d.deleted||{};Object.keys(x).forEach(function(k){if(!(del[k]>=x[k]))del[k]=x[k];});});
  var m={sessions:mergeRecs(a.sessions,b.sessions,del,sk),deleted:del,lastModified:Math.max(a.lastModified||0,b.lastModified||0)};
  var w=pickDoc(a,b,function(d){return d.workouts;},function(d){return d.wm;});if(w){m.workouts=w.v;if(w.t)m.wm=w.t;}
  var core=mergeRecs(vals(a.core),vals(b.core),del,rid);m.core=byId(core);
  var goals=mergeRecs(a.goals,b.goals,del,rid);if(goals.length)m.goals=goals;
  var sa=a.schedule||{},sb=b.schedule||{};
  var wk=pickDoc({s:sa,lastModified:a.lastModified},{s:sb,lastModified:b.lastModified},function(x){return x.s.week;},function(x){return x.s.wkm;});
  var mv=mergeRecs(vals(sa.moves),vals(sb.moves),del,rid);
  if(wk||mv.length)m.schedule={week:wk?wk.v:{},wkm:wk?wk.t:0,moves:byId(mv)};
  var mu=pickDoc(a,b,function(d){return d.muscles;},function(d){return d.mm;});if(mu){m.muscles=mu.v;if(mu.t)m.mm=mu.t;}
  return m;
}
function dsig(d){
  var rs=function(l){return l.map(function(r){return rid(r)+':'+(r.mt||0);}).sort();};
  var ss=(d.sessions||[]).map(function(s){return sk(s)+':'+(s.mt||0);}).sort();
  var dl=Object.keys(d.deleted||{}).sort().map(function(k){return k+':'+d.deleted[k];});
  var sc=d.schedule||{},ne=function(o){return o&&Object.keys(o).length?o:null;};
  return JSON.stringify([ss,dl,d.workouts||null,d.wm||0,rs(vals(d.core)),rs(d.goals||[]),ne(sc.week),sc.wkm||0,rs(vals(sc.moves)),ne(d.muscles),d.mm||0]);
}
function gSt(){try{return JSON.parse(localStorage.getItem('ironlog_sync_st'));}catch(e){return null;}}
function setSt(ok,m){try{localStorage.setItem('ironlog_sync_st',JSON.stringify({ok:ok,m:m}));}catch(e){}var e=document.getElementById('sync-st');if(e)e.textContent=m;uSub();}
var syncT=null,syncBusy=false,syncQ=false;
function cpush(){if(!gSyncUrl())return;clearTimeout(syncT);syncT=setTimeout(csync,2000);}
function csync(cb){
  var u=gSyncUrl();clearTimeout(syncT);syncT=null;
  if(!u)return;
  // Safe while a workout is open: the session keeps its own copy of the exercise list and keys sets by name
  if(syncBusy){syncQ=true;return;}
  syncBusy=true;var ch=false;
  fetch(u,{cache:'no-store'}).then(function(r){return r.json();}).then(function(c){
    if(c==null||(typeof c==='object'&&!c.error&&!Object.keys(c).length))c={sessions:[]};
    if(!Array.isArray(c.sessions))throw new Error(c.error||'unexpected response');
    // Sign the cloud copy as it arrived: merging fills in derived records (core days from old ticks), and a cloud
    // still in the old format should receive them once, along with the Sheet's muscle column
    var cs=dsig(c),l=gd(),m=mergeD(l,c);
    if(dsig(m)!==dsig(l)){localStorage.setItem('ironlog_data',JSON.stringify(m));ch=true;}
    if(dsig(m)===cs)return;
    // muscleMap only rides along for the Sheet's Muscle column; it is never stored on the device or merged
    return fetch(u,{method:'POST',body:JSON.stringify(Object.assign({},m,{muscleMap:muscleMap(m)})),headers:{'Content-Type':'text/plain'}}).then(function(r){return r.json();}).then(function(r){if(!r||!r.success)throw new Error((r&&r.error)||'save rejected');});
  }).then(function(){
    syncBusy=false;
    setSt(true,'Synced '+new Date().toLocaleTimeString());if(ch)refreshView();if(cb)cb(true);
    if(syncQ){syncQ=false;cpush();}
  }).catch(function(err){
    syncBusy=false;setSt(false,'Sync failed: '+(navigator.onLine===false?'offline':(err&&err.message)||'error'));if(ch)refreshView();if(cb)cb(false);
    if(syncQ){syncQ=false;cpush();}
  });
}
function refreshView(){if(CW!==null)return;var a=document.querySelector('.screen.active');if(!a)return;if(a.id==='s-home')rHome();else if(a.id==='s-hist')rHist();else if(a.id==='s-prog')rProg();else if(a.id==='s-goals')rGoals();}
function msync(){if(!gSyncUrl()){toast('Set URL first','var(--orange)');return;}document.getElementById('sync-st').textContent='Syncing...';csync(function(ok){if(ok)toast('Synced!');else toast('Sync failed','var(--red)');});}
