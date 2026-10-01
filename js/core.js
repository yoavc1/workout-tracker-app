// Workout Tracker — Core: the daily chip (workout screen), the day sheet (exercises, sets, stopwatch),
// History's core rows and the Progress core section
// ═══════ CORE ═══════
var CORE_DEF=['Plank','Side Plank','Leg Raise','Hanging Leg Raise','Crunch','Dead Bug','Russian Twist','Ab Wheel'];
var COD=null,COS=null,CSWI=null,CPOP=null,CCD=null,coreBound=false;
// ─── Pure helpers ───
function dayAdd(day,n){var p=day.split('-');return lday(new Date(+p[0],p[1]-1,+p[2]+n,12));}
function fclk(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function fsec(s){s=Math.round(+s)||0;return s<=90?s+'s':fclk(s);}
function csv(t,mode){return mode==='time'?(+t.secs||0):(+t.reps||0);}
function cfv(v,mode){return mode==='time'?fsec(v):String(v);}
// "Plank 3×60s, Leg Raise 15/12/10": repeated sets collapse to n×value; exercises with no sets are left out
function coreSum(items){return(items||[]).filter(function(it){return it.sets&&it.sets.length;}).map(function(it){
  var v=it.sets.map(function(t){return csv(t,it.mode);}),same=v.every(function(x){return x===v[0];});
  return it.name+' '+(same?(v.length>1?v.length+'×':'')+cfv(v[0],it.mode):v.map(function(x){return cfv(x,it.mode);}).join('/'));}).join(', ');}
// Days with core done among the n days ending today (includes days ticked by older app versions)
function coreCount(n,d,today){var cm=(d||gd()).core,c=0;today=today||lday(new Date());for(var i=0;i<n;i++)if(coreDone(dayAdd(today,-i),cm))c++;return c;}
// Day keys ('cYYYY-MM-DD') sort by date, so walking them backwards finds the most recent use first
function cits(d,k){var r=d.core[k];return(r&&Array.isArray(r.items))?r.items:[];}
function coreNames(d){d=d||gd();var seen={},out=[];Object.keys(d.core).sort().reverse().forEach(function(k){cits(d,k).forEach(function(it){if(it.name&&!seen[it.name]){seen[it.name]=1;out.push(it.name);}});});return out;}
// Type-ahead candidates: past core exercises, then core lifts from workouts, then common ones
function coreCands(d){d=d||gd();var seen={},out=[];function add(x){var l=x.toLowerCase();if(!seen[l]){seen[l]=1;out.push(x);}}
  coreNames(d).forEach(add);if(typeof exNames==='function')exNames(d).forEach(function(x){if(muscleOf(x,d).main==='Core')add(x);});CORE_DEF.forEach(add);return out;}
// The mode used last time for this exercise; a new one is timed if it sounds like a hold
function coreMode(name,d){d=d||gd();var ks=Object.keys(d.core).sort().reverse();
  for(var i=0;i<ks.length;i++){var its=cits(d,ks[i]);for(var j=0;j<its.length;j++)if(its[j].name===name)return its[j].mode==='time'?'time':'reps';}
  return/plank|hold|hollow|l.?sit|wall sit|dead hang/i.test(name)?'time':'reps';}
// The value to pre-fill for the next set: this day's last set, else the last set logged before
function coreLast(name,day,d){d=d||gd();var ks=Object.keys(d.core).sort().reverse();
  for(var i=0;i<ks.length;i++){if(ks[i].slice(1)>day)continue;var its=cits(d,ks[i]);for(var j=0;j<its.length;j++){var it=its[j];if(it.name===name&&it.sets&&it.sets.length)return csv(it.sets[it.sets.length-1],it.mode);}}
  return null;}
// Per exercise for Progress: each day's best set (in its latest mode), the best ever and the last, newest exercise first
function coreStats(d){d=d||gd();var by={},out=[];
  Object.keys(d.core).sort().forEach(function(k){cits(d,k).forEach(function(it){
    var v=(it.sets||[]).map(function(t){return csv(t,it.mode);}).filter(function(x){return x>0;});if(!v.length)return;
    var x=by[it.name];if(!x){x=by[it.name]={name:it.name,all:[]};out.push(x);}x.all.push({date:k.slice(1),mode:it.mode==='time'?'time':'reps',v:Math.max.apply(null,v)});});});
  return out.map(function(x){var m=x.all[x.all.length-1].mode,p=x.all.filter(function(q){return q.mode===m;}),b=p[0];
    p.forEach(function(q){if(q.v>b.v)b=q;});return{name:x.name,mode:m,best:b.v,bestDate:b.date,last:p[p.length-1],pts:p};})
    .sort(function(a,b){return a.last.date<b.last.date?1:a.last.date>b.last.date?-1:0;});}
// Days with core done but no workout logged, for History's core-only cards
function coreOnlyDays(d){d=d||gd();var has={};d.sessions.forEach(function(s){has[lday(s.date)]=1;});
  return Object.keys(d.core).map(function(k){return d.core[k];}).filter(function(r){return r&&r.done&&r.date&&!has[r.date];}).map(function(r){return r.date;}).sort();}
// Unticking a day also clears its exercises, so the day, History and the Sheet's Core tab never disagree
function coreTick(day,v){var d=gd();coreSet(d,day,v);if(!v)d.core['c'+day].items=[];else coreFrom(d,day);sd(d);}
function coreTickS(id,v){var d=gd();coreSetS(d,id,v);sd(d);}
function coreEdit(day,fn){var its=JSON.parse(JSON.stringify(coreItems(day)));fn(its);setCoreItems(day,its);var d=gd();if(coreFrom(d,day))sd(d);}
// Core started in the sheet a History card opened goes with that card's workout, unless another workout that day has it
function coreFrom(d,day){if(!COS||COD!==day||!coreDone(day,d.core))return false;var s=null,any=false;
  d.sessions.forEach(function(x){if(lday(x.date)!==day)return;if(x.abs)any=true;if(x.id===COS)s=x;});
  if(any||!s)return false;s.abs=true;s.mt=Date.now();return true;}
function citem(its,name){for(var i=0;i<its.length;i++)if(its[i].name===name)return its[i];return null;}
// The stopwatch is a start time on this device, so it keeps counting while the phone is locked or the app is closed
function gSW(){try{return JSON.parse(localStorage.getItem('ironlog_core_sw'));}catch(e){return null;}}
function sSW(v){if(v)localStorage.setItem('ironlog_core_sw',JSON.stringify(v));else localStorage.removeItem('ironlog_core_sw');}
function swStop(){var s=gSW();if(!s)return;sSW(null);var secs=Math.round((Date.now()-s.t0)/1000);
  if(secs>0&&citem(coreItems(s.day),s.name))coreEdit(s.day,function(its){citem(its,s.name).sets.push({secs:secs});});}

// ─── Chip: workout screen (#wk-core) ───
function rCoreChip(el,day){
  var d=gd(),on=coreDone(day,d.core),sum=coreSum(coreItems(day,d.core)),sw=gSW(),n=coreCount(7,d);CCD=lday(new Date());
  var sub=sw&&sw.day===day?'⏱ '+eh(sw.name)+' stopwatch running':sum?eh(sum):on?'Done · tap to add exercises':'Tap to log exercises';
  el.innerHTML='<div class="cchip"><button class="ctick jct'+(on?' on':'')+(on&&CPOP===day?' pop':'')+'" aria-label="Core done">✓</button><div class="cchip-m"><div class="cchip-t">Core<span class="cchip-n">'+n+' of last 7 days</span></div><div class="cchip-s">'+sub+'</div></div><span class="cchip-go">→</span></div>';
  CPOP=null;bindTick(el.querySelector('.jct'),day,on,!!sum,coreRefresh);
  el.querySelector('.cchip').addEventListener('click',function(){openCore(day);});
}
// One tap ticks; unticking a day with logged sets asks for a second tap, because it clears them.
// With a session id (History's workout cards) it ticks that workout only.
function bindTick(b,day,on,hasSets,after,sid){
  function flip(){if(sid)coreTickS(sid,!on);else coreTick(day,!on);if(!on)CPOP=sid||day;toast(on?'Core unmarked':'Core done ✓',on?'var(--t2)':'');after();}
  if(on&&hasSets)tap2(b,flip);else b.addEventListener('click',function(e){e.stopPropagation();flip();});
}
function rWkCore(){var el=document.getElementById('wk-core');if(!el)return;
  if(ESI!==null){el.innerHTML='';el.style.display='none';return;}
  el.style.display='';rCoreChip(el,(typeof WDAY!=='undefined'&&WDAY)||lday(new Date()));}
// Redraw whatever shows core on the current screen
function coreRefresh(){var a=document.querySelector('.screen.active');if(!a)return;
  if(a.id==='s-wk')rWkCore();else if(a.id==='s-home')rHome();else if(a.id==='s-hist')rHist();else if(a.id==='s-prog')rCoreProg(document.getElementById('prog-core'));}
// iOS resumes the app without reloading it, so a chip drawn yesterday would tick yesterday: redraw on a new day
if(document.addEventListener)document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&CCD&&CCD!==lday(new Date())&&COD===null)coreRefresh();});

// ─── Sheet: one day's core ───
// sid: the workout whose History card opened it, so core started here goes with that workout
function openCore(day,sid){COD=day;COS=sid||null;if(!coreBound){coreBound=true;var ov=document.getElementById('mov-core');ov.addEventListener('click',function(e){if(e.target===ov)closeCore();});}
  rCoreSheet();var ov2=document.getElementById('mov-core');ov2.classList.add('active');ov2.querySelector('.modal').scrollTop=0;}
function closeCore(){document.getElementById('mov-core').classList.remove('active');clearInterval(CSWI);CSWI=null;COD=null;COS=null;coreRefresh();}
function rCoreSheet(){
  var day=COD,d=gd(),its=coreItems(day,d.core),on=coreDone(day,d.core),sw=gSW(),today=lday(new Date());
  var h='<div class="csh-h"><div><h3>'+(day===today?'Today\'s core':'Core')+'</h3><div class="csh-d">'+fdf(day+'T12:00')+' · '+coreCount(7,d)+' of last 7 days</div></div><button class="ctick jct'+(on?' on':'')+(on&&CPOP===day?' pop':'')+'" aria-label="Core done">✓</button></div>';
  CPOP=null;
  its.forEach(function(it){var tm=it.mode==='time',run=sw&&sw.day===day&&sw.name===it.name,lv=coreLast(it.name,day,d);
    var sets=(it.sets||[]).map(function(t,si){return'<button class="cset jcrm" data-si="'+si+'">'+cfv(csv(t,it.mode),it.mode)+'<span>×</span></button>';}).join('');
    h+='<div class="cx" data-n="'+ea(it.name)+'"><div class="cx-h"><div class="cx-n">'+eh(it.name)+'</div><div class="cseg"><button class="cseg-b jcm'+(tm?'':' on')+'" data-m="reps">Reps</button><button class="cseg-b jcm'+(tm?' on':'')+'" data-m="time">Time</button></div><button class="cx-x jcdel" aria-label="Remove">×</button></div>'
      +'<div class="cx-sets">'+(sets||'<span class="cx-none">No sets yet</span>')+'</div><div class="cx-add">'
      +(tm?'<button class="csw jsw'+(run?' on':'')+'">'+(run?'<span class="jsw-t">'+fclk((Date.now()-sw.t0)/1000)+'</span> · Stop':'⏱ Start')+'</button>':'')
      +'<input type="number" class="cinp jcv'+(tm?'':' wide')+'" inputmode="numeric" step="1" min="1" placeholder="'+(tm?'secs':'reps')+'" value="'+(lv!=null?lv:'')+'"><button class="cplus jcs">+ Set</button></div></div>';
  });
  h+='<div class="cadd-row"><div class="cadd-in"><input type="text" class="minp jcn" placeholder="Add exercise, e.g. Plank" autocomplete="off"></div><button class="mbtn pri jcadd">Add</button></div>';
  h+='<button class="mbtn sec csh-done jcx">Done</button>';
  var body=document.getElementById('core-body');body.innerHTML=h;
  bindTick(body.querySelector('.csh-h .jct'),day,on,!!coreSum(its),rCoreSheet);
  body.querySelectorAll('.cx').forEach(function(card){var name=card.dataset.n;
    var edit=function(fn){coreEdit(day,function(l){var it=citem(l,name);if(it)fn(it,l);});rCoreSheet();};
    card.querySelectorAll('.jcm').forEach(function(b){b.addEventListener('click',function(){var m=b.dataset.m;if(b.classList.contains('on'))return;edit(function(it){
      // Switching mode keeps the numbers: it fixes a set logged in the wrong unit
      it.sets=it.sets.map(function(t){var v=csv(t,it.mode);return m==='time'?{secs:v}:{reps:v};});it.mode=m;var s=gSW();if(s&&s.day===day&&s.name===name)sSW(null);});});});
    card.querySelectorAll('.jcrm').forEach(function(b){b.addEventListener('click',function(){edit(function(it){it.sets.splice(+b.dataset.si,1);});});});
    var rm=function(){var s=gSW();if(s&&s.day===day&&s.name===name)sSW(null);edit(function(it,l){l.splice(l.indexOf(it),1);});};
    var del=card.querySelector('.jcdel');if(card.querySelector('.jcrm'))tap2(del,rm);else del.addEventListener('click',rm);
    var inp=card.querySelector('.jcv');
    card.querySelector('.jcs').addEventListener('click',function(){var v=parseInt(inp.value,10);if(!(v>0)){toast(inp.placeholder==='secs'?'Enter seconds':'Enter reps','var(--orange)');return;}
      edit(function(it){it.sets.push(it.mode==='time'?{secs:v}:{reps:v});});});
    inp.addEventListener('keydown',function(e){if(e.key==='Enter')card.querySelector('.jcs').click();});
    var swb=card.querySelector('.jsw');if(swb)swb.addEventListener('click',function(){var s=gSW(),mine=s&&s.day===day&&s.name===name;
      swStop();if(!mine)sSW({day:day,name:name,t0:Date.now()});rCoreSheet();});
  });
  var ni=body.querySelector('.jcn');
  typeahead(ni,function(){var on2={};coreItems(day).forEach(function(it){on2[it.name]=1;});return coreCands().filter(function(x){return!on2[x];});},coreAdd);
  body.querySelector('.jcadd').addEventListener('click',function(){coreAdd(ni.value);});
  ni.addEventListener('keydown',function(e){if(e.key==='Enter')coreAdd(ni.value);});
  body.querySelector('.jcx').addEventListener('click',closeCore);
  clearInterval(CSWI);CSWI=null;
  if(body.querySelector('.jsw-t'))CSWI=setInterval(function(){var e=body.querySelector('.jsw-t'),s=gSW();if(!e||!s){clearInterval(CSWI);CSWI=null;return;}e.textContent=fclk((Date.now()-s.t0)/1000);},250);
}
function coreAdd(name){name=String(name||'').trim();if(!name){toast('Enter a name','var(--orange)');return;}
  // Reuse the spelling already on record, so "plank" and "Plank" stay one exercise
  var c=coreCands();for(var i=0;i<c.length;i++)if(c[i].toLowerCase()===name.toLowerCase()){name=c[i];break;}
  if(citem(coreItems(COD),name)){toast(name+' is already on the list','var(--orange)');return;}
  var m=coreMode(name);coreEdit(COD,function(its){its.push({name:name,mode:m,sets:[]});});rCoreSheet();}

// ─── History: a core row on every workout card, and a card of its own on a rest day ───
// The same tick as the chip, so marking core done looks and works the same everywhere
function coreTickB(day,on,sid){var sa=sid?' data-sid="'+ea(sid)+'"':'';
  return'<button class="ctick jhct'+(on?' on':'')+(on&&(CPOP===day||(sid&&CPOP===sid))?' pop':'')+'" data-day="'+day+'"'+sa+' aria-label="Core done" aria-pressed="'+on+'">✓</button>';}
// A workout's row: tapping the tick flips core for that workout only; tapping the rest opens the day's sheet to add or
// edit exercises. The day's exercises show on the workout core went with.
function coreLine(s,d){d=d||gd();var day=lday(s.date),on=coreWith(day,d).some(function(x){return x.id===s.id;}),sum=on?coreSum(coreItems(day,d.core)):'';
  return'<div class="hcx jhc'+(on?' on':'')+'" data-day="'+day+'" data-sid="'+ea(s.id)+'">'+coreTickB(day,on,s.id)+'<div class="hcx-m"><div class="hcx-t">Core</div><div class="hcx-s">'+(sum?eh(sum):(on?'Done':'Not done')+' · tap to add exercises')+'</div></div><span class="hcx-go">→</span></div>';}

// ─── Progress section ───
function cspark(pts){var p=pts.slice(-12),n=p.length,W=64,H=24;if(n<2)return'<svg class="cp-spark" viewBox="0 0 '+W+' '+H+'"></svg>';
  var vs=p.map(function(q){return q.v;}),mx=Math.max.apply(null,vs),mn=Math.min.apply(null,vs);
  var xy=p.map(function(q,i){return[Math.round((2+i*(W-4)/(n-1))*10)/10,mx===mn?H/2:Math.round((H-3-(q.v-mn)/(mx-mn)*(H-6))*10)/10];});
  var l=xy[n-1];return'<svg class="cp-spark" viewBox="0 0 '+W+' '+H+'"><polyline points="'+xy.map(function(a){return a.join(',');}).join(' ')+'"/><circle cx="'+l[0]+'" cy="'+l[1]+'" r="2.5"/></svg>';}
function rCoreProg(el){if(!el)return;var d=gd(),st=coreStats(d);
  var h='<h3 class="cp-h">Core</h3><div class="cp-card"><div class="cp-sum"><div><b>'+coreCount(7,d)+'</b><span>days in the last 7</span></div><div><b>'+coreCount(30,d)+'</b><span>days in the last 30</span></div></div>';
  if(!st.length)h+='<div class="cp-empty">Log core from the top of a workout, or tap a day on the Workouts calendar. Your best holds and reps show here.</div>';
  st.forEach(function(x){var tm=x.mode==='time';
    h+='<div class="cp-row"><div class="cp-l"><div class="cp-n">'+eh(x.name)+'</div><div class="cp-d">Best '+(tm?'hold ':'')+cfv(x.best,x.mode)+(tm?'':' reps')+' · '+fds(x.bestDate+'T12:00')+'</div></div>'+cspark(x.pts)+'<div class="cp-v">'+cfv(x.last.v,x.mode)+'<span>last</span></div></div>';});
  el.innerHTML=h+'</div>';}
