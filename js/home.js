// Workout Tracker — Navigation, insights, home screen, manage workouts, weekly split editor
// ═══════ NAV ═══════
function switchTab(t){document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});document.querySelectorAll('.ntab').forEach(function(n){n.classList.remove('active');});var b=document.querySelector('.ntab[data-tab="'+t+'"]');if(b)b.classList.add('active');document.getElementById('nav-wrap').style.display='flex';document.getElementById('bbar').style.display='none';if(t==='home'){document.getElementById('s-home').classList.add('active');rHome();}else if(t==='progress'){document.getElementById('s-prog').classList.add('active');setTimeout(rProg,100);}else if(t==='history'){document.getElementById('s-hist').classList.add('active');rHist();}}
function goHome(){CW=null;CS={};OE={};ESI=null;WST=null;clearInterval(RTI);clearInterval(metaInterval);switchTab('home');if(syncQ){syncQ=false;cpush();}}
// ═══════ INSIGHTS ═══════
var insRange=7;
function genIns(ss,wk){
  if(!ss.length)return[];var ins=[];var now=new Date();var wa=new Date(now);wa.setDate(wa.getDate()-insRange);
  var sorted=ss.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  var rangeS=sorted.filter(function(s){return new Date(s.date)>=wa;});
  var ap={},wp=[];sorted.forEach(function(s){Object.keys(s.exercises).forEach(function(x){s.exercises[x].forEach(function(t){var p=ap[x]||0;if(t.kg>p){ap[x]=t.kg;if(new Date(s.date)>=wa)wp.push({x:x,kg:t.kg});}});});});
  if(wp.length>0){var b=wp[wp.length-1];ins.push({type:'pos',icon:'🏆',text:'<strong>New PR</strong> — '+b.x+' hit '+b.kg+' kg'});}
  var rd={};rangeS.forEach(function(s){rd[new Date(s.date).toDateString()]=true;});
  var sc=Object.keys(rd).length;var rl=insRange===7?'week':insRange===14?'2 weeks':'month';
  if(sc>=1)ins.push({type:'pos',icon:'🔥',text:'<strong>'+sc+' session'+(sc!==1?'s':'')+' this '+rl+'</strong>'});
  var split=gSplit();var di=(now.getDay()+6)%7;var planned=split[DAYS[di]];
  if(planned){var last=null;for(var i=sorted.length-1;i>=0;i--){if(sorted[i].workout===planned){last=sorted[i];break;}}var done=last&&new Date(last.date).toDateString()===now.toDateString();if(!done)ins.push({type:'info',icon:'📅',text:'<strong>'+planned+'</strong> is scheduled for today'});}
  Object.keys(wk).forEach(function(n){var l=null;for(var i=sorted.length-1;i>=0;i--){if(sorted[i].workout===n){l=sorted[i];break;}}if(l){var d=Math.floor((now-new Date(l.date))/86400000);if(d>insRange)ins.push({type:'warn',icon:'⚠️',text:'<strong>'+n+'</strong> not logged in '+d+' days'});}else{ins.push({type:'info',icon:'💡',text:'<strong>'+n+'</strong> not logged yet'});}});
  if(rangeS.length>=2){var lt=rangeS[rangeS.length-1];var pv=null;for(var i=rangeS.length-2;i>=0;i--){if(rangeS[i].workout===lt.workout){pv=rangeS[i];break;}}if(pv){var vf=function(s){return s.reduce(function(a,x){return a+x.kg*x.reps;},0);};var en=Object.keys(lt.exercises),up=0,dn=0;en.forEach(function(x){if(pv.exercises[x]){var cv=vf(lt.exercises[x]),pvv=vf(pv.exercises[x]);if(cv>pvv)up++;else if(cv<pvv)dn++;}});if(up>dn&&up>0)ins.push({type:'pos',icon:'📈',text:'<strong>'+lt.workout+' volume up</strong> — '+up+' improved'});if(dn>up&&dn>0)ins.push({type:'warn',icon:'📉',text:'<strong>'+lt.workout+' volume dropped</strong> on '+dn});}}
  if(sorted.length>0){var lt2=sorted[sorted.length-1];if(!coreDone(lday(lt2.date)))ins.push({type:'info',icon:'💪',text:'<strong>Don\'t forget core</strong>'});}
  return ins;
}

// ═══════ HOME ═══════
function uSub(){var n=gs().length,st=gSt();document.getElementById('hsub').textContent=(n===0?'Ready for your first workout?':n+' workout'+(n!==1?'s':'')+' logged')+(gSyncUrl()&&st&&st.ok===false?' · ⚠️ not synced':'');}
function rHome(){
  document.getElementById('bbar').style.display='none';
  var ss=gs();var wk=gw();
  uSub();
  // Insight
  var iS=document.getElementById('ins-sec');var ins=genIns(ss,wk);
  var ii=parseInt(sessionStorage.getItem('ins_idx')||'0');
  if(sessionStorage.getItem('ins_dis')){iS.innerHTML='';}
  else if(ins.length>0){if(ii>=ins.length)ii=0;var ix=ins[ii];
    var rangeH='<div class="ins-range"><button class="ins-range-btn'+(insRange===7?' active':'')+'" data-r="7">Week</button><button class="ins-range-btn'+(insRange===14?' active':'')+'" data-r="14">2 Weeks</button><button class="ins-range-btn'+(insRange===30?' active':'')+'" data-r="30">Month</button></div>';
    iS.innerHTML='<div class="hsec"><div class="hsec-t">Insights<button class="ins-x" id="ins-x" style="margin-left:auto">×</button></div>'+rangeH+'<div class="ins '+ix.type+'"><div class="ins-icon">'+(ix.icon||'')+'</div><div class="ins-text">'+ix.text+'</div></div></div>';
    document.getElementById('ins-x').addEventListener('click',function(){iS.innerHTML='';sessionStorage.setItem('ins_dis','1');sessionStorage.setItem('ins_idx',String(ii+1));});
    iS.querySelectorAll('.ins-range-btn').forEach(function(b){b.addEventListener('click',function(){insRange=parseInt(b.dataset.r);rHome();});});
  }else{iS.innerHTML='';}
  // Core checkbox
  var aS=document.getElementById('abs-sec');var tds=new Date().toDateString(),today=lday(new Date());var hasWK=false,hasCore=coreDone(today);
  ss.forEach(function(s){if(new Date(s.date).toDateString()===tds)hasWK=true;});
  if(hasWK){
    aS.innerHTML='<div class="hsec" style="padding:14px 18px"><div style="display:flex;align-items:center;gap:12px"><input type="checkbox" id="core-cb" '+(hasCore?'checked':'')+' style="width:22px;height:22px;accent-color:var(--green)"><label for="core-cb" style="font-family:var(--ff);font-size:14px;font-weight:600;cursor:pointer;flex:1">'+(hasCore?'Core trained today ✓':'Core trained today?')+'</label></div></div>';
    document.getElementById('core-cb').addEventListener('change',function(){var c=this.checked;setCoreDone(today,c);toast(c?'Core logged!':'Core unmarked');});
  }else{aS.innerHTML='';}
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
  Object.keys(wk).forEach(function(n){h+='<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--input);border-radius:var(--rs)"><input class="minp jrn" data-n="'+ea(n)+'" value="'+ea(n)+'" style="flex:1;margin:0;padding:8px 10px;font-size:13px"><button class="hcard-btn jrs" data-n="'+ea(n)+'">Save</button><button class="hcard-btn jdw" data-n="'+ea(n)+'" style="color:var(--red)">Delete</button></div>';});
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
  document.getElementById('mn-add').addEventListener('click',function(){var n=document.getElementById('mn-new').value.trim();if(n){var w=gw();w[n]=[];sw(w);document.getElementById('mov-manage').classList.remove('active');rHome();toast(n+' created');}});
}

function openSplitEditor(){
  // Show a modal with all 7 days - tap each to pick workout
  var split=gSplit();var wk=gw();
  var body=document.getElementById('manage-body');
  var h='<div class="split-grid" style="margin-top:0">';
  DAYS.forEach(function(d){var v=split[d]||'';h+='<div class="split-day"><div class="split-day-label">'+d+'</div><div class="split-day-val'+(v?' has-workout':'')+'" data-day="'+d+'" style="cursor:pointer">'+(v||'Rest')+'</div></div>';});
  h+='</div>';
  document.getElementById('manage-title').textContent='Weekly Split';
  body.innerHTML=h;
  document.getElementById('mov-manage').classList.add('active');
  body.querySelectorAll('.split-day-val').forEach(function(el){el.addEventListener('click',function(){
    document.getElementById('mov-manage').classList.remove('active');
    openSD(el.dataset.day);
  });});
}
function openSD(day){
  var wk=gw();var split=gSplit();document.getElementById('sd-title').textContent=day;
  var opts=document.getElementById('sd-opts');
  var h='<div style="display:flex;flex-direction:column;gap:6px"><button class="mbtn sec jsd" data-v="" style="margin:0">Rest</button>';
  Object.keys(wk).forEach(function(n){h+='<button class="mbtn '+(split[day]===n?'pri':'sec')+' jsd" data-v="'+ea(n)+'" style="margin:0">'+eh(n)+'</button>';});
  h+='</div>';opts.innerHTML=h;document.getElementById('mov-splitday').classList.add('active');
  opts.querySelectorAll('.jsd').forEach(function(b){b.addEventListener('click',function(){split[day]=b.dataset.v||'';sSplit(split);document.getElementById('mov-splitday').classList.remove('active');rHome();});});
}
