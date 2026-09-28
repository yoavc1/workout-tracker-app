// Workout Tracker — Cloud sync with merge (sessions by id, tombstones, newest templates)
// ═══════ SYNC ═══════
// Merge instead of last-writer-wins: sessions are unioned by id (latest edit wins), deletions travel as tombstones,
// workout templates take the most recently edited copy. Any device can sync at any time without wiping another's work.
function newer(a,b,f){var x=a[f]||0,y=b[f]||0;if(x!==y)return x>y?a:b;return(b.lastModified||0)>(a.lastModified||0)?b:a;}
function mergeD(a,b){
  var del={},by={},ids=[];
  [a,b].forEach(function(d){var x=d.deleted||{};Object.keys(x).forEach(function(k){if(!(del[k]>=x[k]))del[k]=x[k];});});
  [a,b].forEach(function(d){(d.sessions||[]).forEach(function(s){var k=sk(s),e=by[k];if(!e){ids.push(k);by[k]=s;}else if((s.mt||0)>(e.mt||0))by[k]=s;});});
  var m={sessions:[],deleted:del,lastModified:Math.max(a.lastModified||0,b.lastModified||0)};
  ids.forEach(function(k){var s=by[k];if(del[k]>=(s.mt||0))return;s.id=k;m.sessions.push(s);});
  var w=newer(a,b,'wm');if(!w.workouts)w=w===a?b:a;if(w.workouts){m.workouts=w.workouts;if(w.wm)m.wm=w.wm;}
  return m;
}
function dsig(d){var ss=(d.sessions||[]).map(function(s){return sk(s)+':'+(s.mt||0);}).sort();var dl=Object.keys(d.deleted||{}).sort().map(function(k){return k+':'+d.deleted[k];});return JSON.stringify([ss,dl,d.workouts||null,d.wm||0]);}
function gSt(){try{return JSON.parse(localStorage.getItem('ironlog_sync_st'));}catch(e){return null;}}
function setSt(ok,m){try{localStorage.setItem('ironlog_sync_st',JSON.stringify({ok:ok,m:m}));}catch(e){}var e=document.getElementById('sync-st');if(e)e.textContent=m;uSub();}
var syncT=null,syncBusy=false,syncQ=false;
function cpush(){if(!gSyncUrl())return;clearTimeout(syncT);syncT=setTimeout(csync,2000);}
function csync(cb){
  var u=gSyncUrl();clearTimeout(syncT);syncT=null;
  if(!u)return;
  // Never swap data under an open workout (sets are keyed by exercise position); goHome() resumes the sync
  if(syncBusy||CW!==null){syncQ=true;return;}
  syncBusy=true;var ch=false,deferred=false;
  fetch(u,{cache:'no-store'}).then(function(r){return r.json();}).then(function(c){
    if(c==null||(typeof c==='object'&&!c.error&&!Object.keys(c).length))c={sessions:[]};
    if(!Array.isArray(c.sessions))throw new Error(c.error||'unexpected response');
    if(CW!==null){deferred=true;return;}
    var l=gd(),m=mergeD(l,c);
    if(dsig(m)!==dsig(l)){localStorage.setItem('ironlog_data',JSON.stringify(m));ch=true;}
    if(dsig(m)===dsig(c))return;
    return fetch(u,{method:'POST',body:JSON.stringify(m),headers:{'Content-Type':'text/plain'}}).then(function(r){return r.json();}).then(function(r){if(!r||!r.success)throw new Error((r&&r.error)||'save rejected');});
  }).then(function(){
    syncBusy=false;if(deferred){syncQ=true;return;}
    setSt(true,'Synced '+new Date().toLocaleTimeString());if(ch)refreshView();if(cb)cb(true);
    if(syncQ){syncQ=false;cpush();}
  }).catch(function(err){
    syncBusy=false;setSt(false,'Sync failed: '+(navigator.onLine===false?'offline':(err&&err.message)||'error'));if(ch)refreshView();if(cb)cb(false);
    if(syncQ){syncQ=false;cpush();}
  });
}
function refreshView(){if(CW!==null)return;var a=document.querySelector('.screen.active');if(!a)return;if(a.id==='s-home')rHome();else if(a.id==='s-hist')rHist();else if(a.id==='s-prog')rProg();}
function msync(){if(!gSyncUrl()){toast('Set URL first','var(--orange)');return;}document.getElementById('sync-st').textContent='Syncing...';csync(function(ok){if(ok)toast('Synced!');else toast('Sync failed','var(--red)');});}
