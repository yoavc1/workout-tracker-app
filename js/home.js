// Workout Tracker — Navigation, home screen, manage workouts
// ═══════ NAV ═══════
function switchTab(t){document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});document.querySelectorAll('.ntab').forEach(function(n){n.classList.remove('active');});var b=document.querySelector('.ntab[data-tab="'+t+'"]');if(b)b.classList.add('active');document.getElementById('nav-wrap').style.display='flex';document.getElementById('bbar').style.display='none';if(t==='home'){document.getElementById('s-home').classList.add('active');rHome();}else if(t==='progress'){document.getElementById('s-prog').classList.add('active');setTimeout(rProg,100);}else if(t==='history'){document.getElementById('s-hist').classList.add('active');rHist();}else if(t==='goals'){document.getElementById('s-goals').classList.add('active');rGoals(true);}}
function goHome(){CW=null;CL=[];CS={};OE={};ESI=null;WDAY=null;WST=null;clearInterval(RTI);clearInterval(metaInterval);switchTab('home');}
// ═══════ HOME ═══════
function uSub(){var n=gs().length,st=gSt();document.getElementById('hsub').textContent=(n===0?'Ready for your first workout?':n+' workout'+(n!==1?'s':'')+' logged')+(gSyncUrl()&&st&&st.ok===false?' · ⚠️ not synced':'');}
function rHome(){
  document.getElementById('bbar').style.display='none';
  var wk=gw();
  uSub();rToday();
  // Alerts, rebuilt from the data (js/alerts.js)
  rAlerts();
  // Core chip, every day (js/core.js)
  rCoreChip(document.getElementById('abs-sec'),lday(new Date()));
  // Workouts
  var wS=document.getElementById('wk-sec');var di=gDri();
  var h='<div class="hsec"><div class="hsec-t">My Workouts<button class="ibtn" id="btn-manage" style="width:28px;height:28px;font-size:12px">⚙</button></div><div class="wcards">';
  Object.keys(wk).forEach(function(n){var ex=wk[n],last=gLast(n),hd=di&&di.workout===n;
    h+='<div class="wcard" data-w="'+ea(n)+'"><div><h3>'+eh(n)+(hd?'<span class="draft">DRAFT</span>':'')+'</h3><span>'+ex.length+' exercises'+(last?' · Last: '+fds(last.date):'')+'</span></div><div style="color:var(--t3);font-size:18px">→</div></div>';
  });
  h+='</div></div>';wS.innerHTML=h;
  wS.querySelectorAll('.wcard').forEach(function(c){c.addEventListener('click',function(){openWK(c.dataset.w);});});
  document.getElementById('btn-manage').addEventListener('click',function(e){e.stopPropagation();showManage();});
}

function showManage(){
  document.getElementById('manage-title').textContent='Manage Workouts';
  var wk=gw();var body=document.getElementById('manage-body');
  var h='<div style="display:flex;flex-direction:column;gap:8px">';
  Object.keys(wk).forEach(function(n){h+='<div class="mrow"><div style="display:flex;align-items:center;gap:8px"><input class="minp jrn" data-n="'+ea(n)+'" value="'+ea(n)+'" style="flex:1;margin:0;padding:8px 10px;font-size:13px"><button class="hcard-btn jrs" data-n="'+ea(n)+'">Save</button><button class="hcard-btn jdw" data-n="'+ea(n)+'" style="color:var(--red)">Delete</button></div><button class="mrow-ex jex" data-n="'+ea(n)+'">'+wk[n].length+' exercise'+(wk[n].length!==1?'s':'')+'<span>Edit ›</span></button></div>';});
  h+='<div style="display:flex;gap:8px;margin-top:8px"><input class="minp" id="mn-new" placeholder="New workout name" style="flex:1;margin:0;padding:10px 12px;font-size:13px"><button class="mbtn pri" id="mn-add" style="flex:0;padding:10px 16px">Add</button></div></div>';
  body.innerHTML=h;document.getElementById('mov-manage').classList.add('active');
  body.querySelectorAll('.jrs').forEach(function(b){b.addEventListener('click',function(){var old=b.dataset.n;var nw=b.parentNode.querySelector('.jrn').value.trim();if(!nw||nw===old)return;var d=gd(),w=gw();if(w[nw]){toast('Name already used','var(--orange)');return;}
    // Keep list order and carry history, split day and draft over, so insights and "Previous" sets still find them
    var w2={};Object.keys(w).forEach(function(k){w2[k===old?nw:k]=w[k];});d.workouts=w2;d.wm=Date.now();
    d.sessions.forEach(function(s){if(s.workout===old){s.workout=nw;s.mt=Date.now();}});sd(d);
    var sp=gSplit();DAYS.forEach(function(k){if(sp[k]===old)sp[k]=nw;});sSplit(sp);
    var dr=gDri();if(dr&&dr.workout===old){dr.workout=nw;localStorage.setItem('ironlog_draft',JSON.stringify(dr));}
    document.getElementById('mov-manage').classList.remove('active');rHome();toast('Renamed!');});});
  body.querySelectorAll('.jdw').forEach(function(b){tap2(b,function(){var w=gw();delete w[b.dataset.n];sw(w);document.getElementById('mov-manage').classList.remove('active');rHome();toast('Deleted');});});
  body.querySelectorAll('.jex').forEach(function(b){b.addEventListener('click',function(){showExEd(b.dataset.n);});});
  document.getElementById('mn-add').addEventListener('click',function(){var n=document.getElementById('mn-new').value.trim();if(!n)return;var w=gw();if(w[n]){toast('Name already used','var(--orange)');return;}w[n]=[];sw(w);rHome();toast(n+' created');showExEd(n);});
}
// A saved workout's exercises: drag to reorder, rename, remove, add. Changes save straight away; sessions already
// logged keep their exercises.
function showExEd(n){
  var body=document.getElementById('manage-body'),list=gw()[n];if(!list){showManage();return;}
  document.getElementById('manage-title').textContent=n;
  var h='<button class="mback jmb">‹ All workouts</button><div class="exed" id="exed">';
  list.forEach(function(x){h+='<div class="exr" data-x="'+ea(x)+'"><span class="edrag jdrag" aria-label="Drag to reorder">⠿</span><span class="exr-n">'+eh(x)+'</span><button class="hcard-btn jer" aria-label="Rename">✏️</button><button class="hcard-btn jed" aria-label="Remove" style="color:var(--red)">×</button></div>';});
  if(!list.length)h+='<div class="exed-empty">No exercises yet. Add the first one below.</div>';
  h+='</div><div class="exed-add"><div style="flex:1;min-width:0"><input class="minp" id="exed-new" placeholder="Add exercise" style="margin:0;padding:10px 12px;font-size:13px"></div><button class="mbtn pri" id="exed-add" style="flex:0;padding:10px 16px">Add</button></div>';
  body.innerHTML=h;
  var el=document.getElementById('exed'),set=function(l){var w=gw();w[n]=l;sw(w);};
  body.querySelector('.jmb').addEventListener('click',showManage);
  if(window.Sortable&&list.length)Sortable.create(el,{handle:'.jdrag',animation:150,forceFallback:true,fallbackTolerance:3,ghostClass:'sghost',
    onEnd:function(){set([].map.call(el.querySelectorAll('.exr'),function(r){return r.dataset.x;}));}});
  el.querySelectorAll('.exr').forEach(function(r){var x=r.dataset.x;
    r.querySelector('.jer').addEventListener('click',function(){renEx(n,x);});
    tap2(r.querySelector('.jed'),function(){var l=gw()[n];l.splice(l.indexOf(x),1);set(l);showExEd(n);toast('Removed from '+n);});});
  var inp=document.getElementById('exed-new');
  var add=function(v){v=(v||'').trim();if(!v)return;var lc=v.toLowerCase(),k=exNames().filter(function(x){return x.toLowerCase()===lc;})[0];if(k)v=k;
    var l=gw()[n];if(l.indexOf(v)>=0){toast(v+' is already in '+n,'var(--orange)');return;}l.push(v);set(l);showExEd(n);toast(v+' added');
    setTimeout(function(){var i=document.getElementById('exed-new');if(i)i.focus();},60);};
  typeahead(inp,function(){var l=gw()[n]||[];return exNames().filter(function(x){return l.indexOf(x)<0;});},add);
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')add(inp.value);});
  document.getElementById('exed-add').addEventListener('click',function(){add(inp.value);});
}
// Renames an exercise in saved workout n. If it has been logged, it can also be renamed in history and every other
// saved workout (and the unfinished session), so its progress stays in one chart. Renaming onto an existing name merges.
function renEx(n,old){
  var m=document.getElementById('mov-rename'),inp=document.getElementById('rename-inp'),hc=document.getElementById('rename-hist');
  var used=gs().some(function(s){return s.exercises&&s.exercises[old];});
  inp.value=old;hc.checked=true;document.getElementById('rename-hist-row').style.display=used?'':'none';m.classList.add('active');inp.focus();
  document.getElementById('rename-save').onclick=function(){
    var nw=inp.value.trim();if(!nw){toast('Enter name','var(--orange)');return;}m.classList.remove('active');if(nw===old)return;
    var all=used&&hc.checked,w=gw();
    Object.keys(w).forEach(function(k){if(k!==n&&!all)return;var l=w[k],i=l.indexOf(old);if(i<0)return;if(l.indexOf(nw)>=0)l.splice(i,1);else l[i]=nw;});
    sw(w);var hn=all?renameExHist(old,nw):0;
    var dr=gDri();if(all&&dr&&dr.list.indexOf(old)>=0){dr.list=dr.list.map(function(x){return x===old?nw:x;}).filter(function(x,i,a){return a.indexOf(x)===i;});
      dr.sets[nw]=(dr.sets[nw]||[]).concat(dr.sets[old]||[]);delete dr.sets[old];localStorage.setItem('ironlog_draft',JSON.stringify(dr));}
    showExEd(n);toast(hn?'Renamed, including '+hn+' past workout'+(hn!==1?'s':''):'Renamed');
  };
}
