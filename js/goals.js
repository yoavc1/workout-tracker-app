// Workout Tracker — Goals tab: target kg by a date, straight-line pace and status, detail chart, celebrate and archive
// ═══════ GOALS ═══════
var GT={
  TOL_KG:2.5,   // "On track" = within ±2.5 kg or ±10% of the goal's gap (target − start), whichever is larger
  TOL_PCT:10,
  RECENT:14,    // current kg = best top set of the last 14 days, else the latest top set
  LEAD:28       // the detail chart also shows the 4 weeks before the goal started, for context
};
// GF: the muscle group the list is filtered to ('' = all of them). GSRT: the list's Sortable, GDRAG: a drag is in progress,
// GDT: when the last one ended, GVIS: the ids of the goals that can be dragged, as drawn
var GCI=null,GJUST={},GARC=false,gBound=false,GF='',GSRT=null,GDRAG=false,GDT=0,GVIS=[];
// Goal dates are local days ('YYYY-MM-DD'), so parse them as local midnight rather than UTC
function gDay(s){var p=String(s).split('-');return new Date(+p[0],p[1]-1,+p[2]);}
function gDays(a,b){return Math.round((gDay(b)-gDay(a))/864e5);}
// n calendar months later; the 31st lands on the month's last day
function gMonths(day,n){var d=gDay(day),t=new Date(d.getFullYear(),d.getMonth()+n,1);t.setDate(Math.min(d.getDate(),new Date(t.getFullYear(),t.getMonth()+1,0).getDate()));return lday(t);}
function gKg(x){return Math.round((+x||0)*10)/10+' kg';}
function gFd(day){var d=gDay(day),o={day:'numeric',month:'short'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleDateString('en-GB',o);}
// "Current" kg: the best top-set kg in the last 14 days (what bestRecent(name,14).kg gives), falling back to the latest
// top set when the lift hasn't been done lately. {kg, date, src:'recent'|'latest'}, or null if never done with weight.
function goalCur(name,d,now){
  now=now==null?Date.now():+now;var from=now-GT.RECENT*864e5,best=null,last=null;
  exerciseSeries(name,d).forEach(function(p){var t=new Date(p.date).getTime();if(!p.top||t>now)return;
    last={kg:p.top.kg,date:p.date,src:'latest'};if(t>=from&&(!best||p.top.kg>best.kg))best={kg:p.top.kg,date:p.date,src:'recent'};});
  return best||last;
}
// Date of the first session since the goal's start day whose top set reached the target, or null.
// Reaching it is an event: it still counts after that session drops out of the 14-day window.
function goalHit(g,d,now){now=now==null?Date.now():+now;var r=null;
  exerciseSeries(g.exercise,d).some(function(p){if(p.top&&new Date(p.date).getTime()<=now&&lday(p.date)>=g.startDate&&p.top.kg>=+g.targetKg){r=p.date;return true;}return false;});
  return r;}
// Everything a goal card shows, as of `now`. The pace is a straight line from (start day, start kg) to (target day,
// target kg) that moves once a day. Status is 'done' once the target is hit, else current vs expected kg:
// 'ahead', 'on' (within ±tol) or 'behind'. With no weighted sets logged at all, current is the start kg.
function goalStatus(g,d,now){
  now=now==null?Date.now():+now;d=d||gd();
  var today=lday(now),s=+g.startKg||0,t=+g.targetKg||0,gap=t-s;
  var total=Math.max(1,gDays(g.startDate,g.targetDate)),el=Math.min(total,Math.max(0,gDays(g.startDate,today))),left=gDays(today,g.targetDate);
  var exp=s+gap*el/total,tol=Math.max(GT.TOL_KG,Math.abs(gap)*GT.TOL_PCT/100);
  var c=goalCur(g.exercise,d,now),cur=c?c.kg:s,hit=goalHit(g,d,now),diff=cur-exp;
  var st=hit?'done':diff>tol+1e-9?'ahead':diff< -tol-1e-9?'behind':'on';
  return{cur:cur,src:c?c.src:null,curDate:c?c.date:null,exp:exp,tol:tol,diff:diff,status:st,hit:hit,daysLeft:left,
    pct:st==='done'?1:gap>0?Math.min(1,Math.max(0,(cur-s)/gap)):0,expPct:el/total,
    perWk:hit?0:left>0?Math.max(0,(t-cur)*7/left):null};  // kg per week still needed; null once the date has passed
}
// Why a new goal can't be saved, or '' when it can. f = {exercise, startKg, targetKg, targetDate}
function goalErr(f,d,now){
  now=now==null?Date.now():+now;d=d||gd();var x=String(f.exercise||'').trim().toLowerCase();
  if(!x)return'Pick an exercise';
  if(!(f.startKg>=0))return'Enter a start kg';
  if(!(f.targetKg>f.startKg))return'Target must be above the start kg';
  if(!/^\d{4}-\d\d-\d\d$/.test(f.targetDate||'')||f.targetDate<=lday(now))return'Pick a date after today';
  if((d.goals||[]).some(function(g){return!g.archived&&String(g.exercise).toLowerCase()===x;}))return'You already have a goal for this';
  var c=goalCur(f.exercise,d,now);if(c&&c.src==='recent'&&c.kg>=f.targetKg)return'You lifted '+gKg(c.kg)+' lately. Aim higher';
  return'';
}
// A goal's main muscle group, from its exercise: your pick in Progress, else the guess from its name
function goalGroup(g,d){return muscleOf(g.exercise,d).main;}
// The filter's groups (mfGroups: Core and Other only once a goal is in them). [{group, n}], n = how many of `act` are in it.
function goalGroups(all,act,d){
  var of=function(g){return goalGroup(g,d);},has={};all.forEach(function(g){has[of(g)]=1;});
  return mfGroups(has).map(function(k){return{group:k,n:act.filter(function(g){return of(g)===k;}).length};});
}
// ─── Your order ───
// One order for all active goals, which a muscle group filter shows a part of. A goal's place is its key: the ord you
// gave it by dragging, else its target date as a day number, so goals never dragged keep the old target-date order and
// a drag slots in between them. ord is a plain field on the goal, so it syncs with it (newest mt wins).
function goalKey(g){if(typeof g.ord==='number'&&isFinite(g.ord))return g.ord;var p=String(g.targetDate).split('-');return Date.UTC(+p[0],p[1]-1,+p[2])/864e5||0;}
// Goals in your order; equal keys keep the list's order, as the target-date sort did
function goalSort(l){return l.map(function(g,i){return{g:g,i:i,k:goalKey(g)};}).sort(function(a,b){return a.k-b.k||a.i-b.i;}).map(function(o){return o.g;});}
// A new goal's ord: below every active goal
function goalEnd(d){return Math.max.apply(null,[0].concat((d.goals||[]).filter(function(g){return!g.archived;}).map(goalKey)))+1;}
// Dragging goal `id` to index `to` of the list on screen. vis: the ids on screen before the drag (every active goal, or one
// group's); act: every active goal, in order. Moving up, it lands just before the goal it now sits above; moving down,
// just after the one it now sits below, so goals hidden by the filter keep their places. Returns {id: ord} to save: the
// moved goal's key, between its new neighbours'. With no room there (neighbours with equal keys, such as two goals with the
// same target date), the goals around it are spaced out too, widening one each side until they fit.
function goalMove(act,vis,id,to){
  var from=vis.indexOf(id),x=act.filter(function(g){return g.id===id;})[0];vis=vis.filter(function(v){return v!==id;});
  if(!x||from<0||to===from||to<0||to>vis.length)return{};
  var l=act.filter(function(g){return g!==x;}),at=function(v){for(var i=0;i<l.length;i++)if(l[i].id===v)return i;return -1;};
  var p=to<from?at(vis[to]):at(vis[to-1]);if(p<0)return{};if(to>from)p++;
  l.splice(p,0,x);
  for(var a=p,b=p+1,ks,n;;a=Math.max(0,a-1),b=Math.min(l.length,b+1)){
    var lo=a>0?goalKey(l[a-1]):null,hi=b<l.length?goalKey(l[b]):null;n=b-a;ks=[];
    for(var i=1;i<=n;i++)ks.push(lo==null?(hi==null?i:hi-n-1+i):hi==null?lo+i:lo+(hi-lo)*i/(n+1));
    if(ks.every(function(k,j){return k>(j?ks[j-1]:lo==null?-Infinity:lo)&&(hi==null||k<hi);}))break;
  }
  var out={};for(i=0;i<n;i++)if(l[a+i]===x||goalKey(l[a+i])!==ks[i])out[l[a+i].id]=ks[i];
  return out;
}
// ─── Screen ───
function gLab(st){return{ahead:'Ahead',on:'On track',behind:'Behind',done:'🎉 Reached'}[st];}
function gStatsH(s){
  var cl=s.src==='latest'?'Last · '+fds(s.curDate):s.src?'Now':'Start',wk=s.status==='done'?'✓':s.perWk==null?'—':'+'+gKg(s.perWk);
  return'<div class="gstats"><div><b>'+gKg(s.cur)+'</b><span>'+cl+'</span></div><div><b>'+gKg(s.exp)+'</b><span><i class="gmk"></i>Pace today</span></div><div><b>'+wk+'</b><span>'+(s.status==='done'?'Target hit':s.perWk==null?'Date passed':'Needed/wk')+'</span></div></div>';
}
// dr: show the ⠿ handle that drags it into your order
function gCard(g,s,won,dr){
  return'<div class="gcard'+(won?' won':'')+'" data-id="'+ea(g.id)+'"><div class="gc-top"><div class="gc-name">'+eh(g.exercise)+'</div><span class="gchip '+s.status+'">'+gLab(s.status)+'</span>'+
    (dr?'<span class="gdrag" aria-label="Drag to reorder">⠿</span>':'')+'</div>'+
    '<div class="gc-sub">'+gKg(g.startKg)+' → '+gKg(g.targetKg)+' by '+gFd(g.targetDate)+'</div>'+
    '<div class="gbar"><div class="gbar-f '+s.status+'" style="width:'+Math.round(s.pct*1000)/10+'%"></div><div class="gbar-m" style="left:'+Math.round(s.expPct*1000)/10+'%"></div></div>'+
    gStatsH(s)+'</div>';
}
// open: the tab was just opened. Goals that hit their target are archived here, where you see it happen; they stay
// in the active list, celebrated, until you next open the tab.
function rGoals(open){
  // Not mid-drag (a sync or the app resuming can land then): the drop redraws the list. Opening the tab always draws.
  var c=document.getElementById('glist');if(!c)return;if(open)GDRAG=false;else if(GDRAG)return;gBind();if(open)GJUST={};
  var d=gd(),now=Date.now(),fresh=(d.goals||[]).filter(function(g){return!g.archived&&goalHit(g,d,now);});
  if(fresh.length){fresh.forEach(function(g){GJUST[g.id]=1;archiveGoal(g.id);});d=gd();
    toast(fresh.length>1?'🎉 '+fresh.length+' goals reached!':'🎉 Goal reached!');}
  var all=d.goals||[],act=all.filter(function(g){return!g.archived||GJUST[g.id];}),arc=all.filter(function(g){return g.archived&&!GJUST[g.id];});
  // Muscle group filter: it narrows both lists. A goal reached just now is always shown, so the filter lets go for it.
  var gg=goalGroups(all,act,d),nAct=act.length,inF=function(g){return!GF||goalGroup(g,d)===GF;};
  if(!all.length||!gg.some(function(x){return x.group===GF;})||!fresh.every(inF))GF='';
  act=act.filter(inF);arc=arc.filter(inF);
  // Active goals in your order, with the ones reached just now on top
  var won=goalSort(act.filter(function(g){return GJUST[g.id];})),mv=goalSort(act.filter(function(g){return!GJUST[g.id];}));
  var by=function(a,b){return a.targetDate<b.targetDate?-1:a.targetDate>b.targetDate?1:0;};arc.sort(function(a,b){return by(b,a);});
  var h=all.length?mfChips(gg,nAct,GF):'';
  if(!act.length)h+=GF?'<div class="empty gempty"><h3>No active goals for '+eh(GF)+'</h3><p>Tap All to see your other goals, or set a new one.</p><button class="mbtn pri" id="g-first">New goal</button></div>':
    '<div class="empty gempty"><h3>'+(arc.length?'No active goals':'No goals yet')+'</h3><p>Pick a lift, a target kg and a date. You\'ll see the pace you need and whether you\'re ahead or behind it.</p><button class="mbtn pri" id="g-first">New goal</button></div>';
  won.forEach(function(g){h+=gCard(g,goalStatus(g,d,now),true);});
  // The rest drag into your order, once there are two of them on screen
  var dr=mv.length>1;GVIS=mv.map(function(g){return g.id;});
  if(mv.length)h+='<div class="gact" id="gact">'+mv.map(function(g){return gCard(g,goalStatus(g,d,now),false,dr);}).join('')+'</div>';
  if(arc.length){
    h+='<div class="garch'+(GARC?' open':'')+'"><div class="garch-h"><span>Archived<em>'+arc.length+'</em></span><span class="garch-chv">▾</span></div><div class="garch-b">';
    arc.forEach(function(g){var hit=goalHit(g,d,now);h+='<div class="garow" data-id="'+ea(g.id)+'"><div class="garow-n"><div class="gc-name">'+eh(g.exercise)+'</div><div class="gc-sub">'+gKg(g.startKg)+' → '+gKg(g.targetKg)+'</div></div><span class="garow-st">'+(hit?'🎉 Reached '+fds(hit):'Archived')+'</span></div>';});
    h+='</div></div>';
  }
  if(GSRT){GSRT.destroy();GSRT=null;}
  c.innerHTML=h;
  // Tap a group to show only its goals; tap it again, or All, to show them all
  c.querySelectorAll('.gf-c').forEach(function(b){b.addEventListener('click',function(){GF=GF===b.dataset.g?'':b.dataset.g;rGoals();});});
  // A card opens its goal, but not from a tap on ⠿ or from the click a mouse drag can end with
  c.querySelectorAll('.gcard,.garow').forEach(function(el){el.addEventListener('click',function(){if(Date.now()-GDT>400)openGoal(el.dataset.id);});});
  c.querySelectorAll('.gdrag').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();});});
  var ga=document.getElementById('gact');
  // The list scrolls while you hold a goal over the header or the nav, which cover its top and bottom edges
  if(dr&&window.Sortable)GSRT=Sortable.create(ga,{handle:'.gdrag',animation:150,forceFallback:true,fallbackTolerance:3,ghostClass:'sghost',scrollSensitivity:80,
    onStart:function(){GDRAG=true;},
    onEnd:function(e){GDRAG=false;GDT=Date.now();
      var ch=goalMove(goalSort((gd().goals||[]).filter(function(g){return!g.archived;})),GVIS,e.item.dataset.id,[].indexOf.call(ga.children,e.item));
      Object.keys(ch).forEach(function(k){updGoal(k,{ord:ch[k]});});
      // Redrawn once Sortable is done with the list, which also brings in anything synced during the drag
      setTimeout(function(){rGoals();},0);}});
  var ah=c.querySelector('.garch-h');if(ah)ah.addEventListener('click',function(){GARC=!GARC;ah.parentNode.classList.toggle('open',GARC);});
  var f=document.getElementById('g-first');if(f)f.addEventListener('click',openGoalNew);
  // Celebrate: the card pops and its bar fills from empty
  fresh.forEach(function(g){var el=c.querySelector('.gcard[data-id="'+ea(g.id)+'"]');if(!el)return;var b=el.querySelector('.gbar-f');b.style.width='0%';el.classList.add('pop');
    requestAnimationFrame(function(){requestAnimationFrame(function(){b.style.width='100%';});});});
}
function gBind(){if(gBound)return;gBound=true;var m=document.getElementById('mov-goal');
  document.getElementById('btn-gnew').addEventListener('click',openGoalNew);
  m.addEventListener('click',function(e){if(e.target===m)closeGoalM();});
  // iOS resumes the app rather than reloading it, so redraw an open tab: "pace today" moves once a day
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&CW===null&&document.getElementById('s-goals').classList.contains('active'))rGoals();});}
function closeGoalM(){document.getElementById('mov-goal').classList.remove('active');if(GCI){GCI.destroy();GCI=null;}}
// ─── New goal ───
function openGoalNew(){
  var m=document.getElementById('goal-m'),d=gd(),today=lday(new Date()),mon=3,sEdit=false;
  m.innerHTML='<h3>New goal</h3><input type="text" class="minp" id="gn-ex" placeholder="Exercise" autocomplete="off">'+
    '<div class="gn-row"><label class="gn-f"><span>Start kg</span><input type="number" class="minp" id="gn-s" inputmode="decimal" step="any"></label>'+
    '<label class="gn-f"><span>Target kg</span><input type="number" class="minp" id="gn-t" inputmode="decimal" step="any"></label></div>'+
    '<div class="gn-hint" id="gn-hint">Start kg fills in from your recent sets.</div>'+
    '<div class="gn-l">Reach it by</div><div class="gseg" id="gn-by"><button type="button" data-m="3" class="active">3 months</button><button type="button" data-m="6">6 months</button><button type="button" data-m="0">Custom</button></div>'+
    '<input type="date" class="minp gn-date" id="gn-date" min="'+lday(new Date(Date.now()+864e5))+'" style="display:none">'+
    '<div class="gn-sum" id="gn-sum"></div>'+
    '<div class="macts"><button class="mbtn sec" id="gn-cancel">Cancel</button><button class="mbtn pri" id="gn-save">Save goal</button></div>';
  var ex=document.getElementById('gn-ex'),si=document.getElementById('gn-s'),ti=document.getElementById('gn-t'),di=document.getElementById('gn-date');
  // Match a typed name to one you've logged, ignoring case, so the goal finds its history
  function name(){var v=ex.value.trim(),l=v.toLowerCase();return exNames(d).filter(function(x){return x.toLowerCase()===l;})[0]||v;}
  function when(){return mon?gMonths(today,mon):di.value;}
  function sum(){var s=parseFloat(si.value),t=parseFloat(ti.value),dt=when(),w=dt?gDays(today,dt)/7:0,el=document.getElementById('gn-sum');
    el.textContent=!dt?'Pick a target date':'By '+gFd(dt)+(w>0?' · '+Math.round(w)+' week'+(Math.round(w)!==1?'s':'')+(t>s?' · +'+gKg((t-s)/w)+' a week':''):'');}
  function fill(){var n=name(),c=n?goalCur(n,d):null;if(!sEdit)si.value=c?c.kg:'';
    document.getElementById('gn-hint').textContent=!n?'Start kg fills in from your recent sets.':!c?'No weighted sets logged for this yet. Enter your current kg.':
      c.src==='recent'?'Start kg: your best top set in the last 2 weeks ('+fds(c.date)+').':'Start kg: your latest top set ('+fds(c.date)+').';sum();}
  typeahead(ex,function(){return exNames(d);},fill);
  ex.addEventListener('change',fill);
  si.addEventListener('input',function(){sEdit=si.value!=='';sum();});ti.addEventListener('input',sum);di.addEventListener('input',sum);di.addEventListener('change',sum);
  m.querySelectorAll('#gn-by button').forEach(function(b){b.addEventListener('click',function(){
    // Custom starts from the date the preset gave, to adjust from there
    if(!+b.dataset.m&&!di.value)di.value=gMonths(today,mon||3);
    mon=+b.dataset.m;m.querySelectorAll('#gn-by button').forEach(function(x){x.classList.toggle('active',x===b);});di.style.display=mon?'none':'';sum();});});
  document.getElementById('gn-cancel').addEventListener('click',closeGoalM);
  document.getElementById('gn-save').addEventListener('click',function(){
    var f={exercise:name(),startKg:parseFloat(si.value),targetKg:parseFloat(ti.value),targetDate:when()},e=goalErr(f,gd());
    if(e){toast(e,'var(--orange)');return;}
    addGoal({exercise:f.exercise,startKg:f.startKg,startDate:today,targetKg:f.targetKg,targetDate:f.targetDate,archived:false,ord:goalEnd(gd())});
    // A new goal outside the filter would vanish as it's saved, so show them all
    if(GF&&goalGroup(f,gd())!==GF)GF='';
    closeGoalM();rGoals();toast('Goal set 🎯');});
  sum();document.getElementById('mov-goal').classList.add('active');setTimeout(function(){ex.focus();},100);
}
// ─── Detail ───
function openGoal(id){
  var d=gd(),g=(d.goals||[]).filter(function(x){return x.id===id;})[0];if(!g)return;
  var s=goalStatus(g,d),m=document.getElementById('goal-m'),mu=muscleOf(g.exercise,d);m.dataset.id=g.id;var band='±'+gKg(s.tol).replace(' kg','')+' kg';
  var note=s.status==='done'?'Reached on '+fdf(s.hit)+'.':s.perWk==null?'The target date has passed.':
    s.status==='ahead'?gKg(s.diff)+' ahead of the pace line.':s.status==='behind'?gKg(-s.diff)+' behind the pace line. On track means within '+band+'.':'Within '+band+' of the pace line.';
  if(s.src==='latest')note+=' Not trained in the last 2 weeks, so this uses your latest top set.';
  var act=!g.archived?'<button class="mbtn sec" id="gd-arc">Archive</button>':s.status!=='done'?'<button class="mbtn sec" id="gd-arc">Restore</button>':'';
  m.innerHTML='<div class="gc-top gd-top"><h3>'+eh(g.exercise)+'</h3><span class="gchip '+s.status+'">'+gLab(s.status)+'</span></div>'+
    '<div class="gc-sub">'+gKg(g.startKg)+' on '+gFd(g.startDate)+' → '+gKg(g.targetKg)+' by '+gFd(g.targetDate)+'</div>'+
    '<button class="pg-mus gd-mus" id="gd-mus">'+eh(mu.main)+(mu.sub?' · '+eh(mu.sub):'')+' <span class="pg-dim">✎</span></button>'+
    '<div class="gd-chart"><canvas id="gchart"></canvas></div>'+
    '<div class="gd-leg"><span><i class="lg-top"></i>Top set</span><span><i class="lg-pace"></i>Pace</span><span><i class="lg-zone"></i>On track '+band+'</span></div>'+
    gStatsH(s)+'<div class="gd-note">'+note+'</div>'+
    '<div class="macts"><button class="mbtn sec gd-del" id="gd-del">Delete</button>'+act+'<button class="mbtn pri" id="gd-close">Close</button></div>';
  document.getElementById('mov-goal').classList.add('active');
  gChart(g,d,s);
  document.getElementById('gd-close').addEventListener('click',closeGoalM);
  // The exercise's muscle group, the same picker and setting as in Progress. If the goal leaves the group the list is
  // filtered to, the list shows them all, as when a new goal is set outside it.
  document.getElementById('gd-mus').addEventListener('click',function(){pgMus(g.exercise,function(){
    if(GF&&goalGroup(g,gd())!==GF)GF='';rGoals();openGoal(g.id);});});
  tap2(document.getElementById('gd-del'),function(){delGoal(g.id);closeGoalM();rGoals();toast('Goal deleted','var(--red)');});
  var ab=document.getElementById('gd-arc');if(ab)ab.addEventListener('click',function(){updGoal(g.id,{archived:!g.archived});closeGoalM();rGoals();toast(g.archived?'Goal restored':'Goal archived');});
}
// Month-start ticks between two timestamps, at most ~6 of them
function gTicks(a,b){var d=new Date(a),out=[];d=new Date(d.getFullYear(),d.getMonth()+1,1);while(d.getTime()<=b){out.push(d.getTime());d=new Date(d.getFullYear(),d.getMonth()+1,1);}
  var st=Math.ceil(out.length/6);return out.filter(function(v,i){return i%st===0;});}
// Top sets with the pace line and its on-track band. A linear axis of timestamps (no date adapter needed);
// colours come from the theme when it draws, so it follows light/dark.
function gChart(g,d,s){
  if(typeof Chart==='undefined')return;if(GCI){GCI.destroy();GCI=null;}
  var cs=getComputedStyle(document.documentElement),cv=function(n){return cs.getPropertyValue(n).trim();};
  var now=Date.now(),t0=gDay(g.startDate).getTime(),t1=gDay(g.targetDate).getTime(),x0=t0-GT.LEAD*864e5,x1=Math.max(t1,now);
  var pts=exerciseSeries(g.exercise,d).filter(function(p){return p.top;}).map(function(p){return{x:new Date(p.date).getTime(),y:p.top.kg};}).filter(function(p){return p.x>=x0&&p.x<=x1;});
  var pace=[{x:t0,y:+g.startKg},{x:t1,y:+g.targetKg}];if(x1>t1)pace.push({x:x1,y:+g.targetKg});
  var band=function(k){return pace.map(function(p){return{x:p.x,y:p.y+k*s.tol};});};
  var ticks=gTicks(x0,x1),yrs=new Date(x0).getFullYear()!==new Date(x1).getFullYear(),tc=cv('--t2'),gc=cv('--brd'),bl=cv('--blue'),t1c=cv('--t1');
  GCI=new Chart(document.getElementById('gchart'),{type:'line',data:{datasets:[
    {label:'hi',data:band(1),borderWidth:0,pointRadius:0,pointHoverRadius:0,fill:'+1',backgroundColor:cv('--bdim')},
    {label:'lo',data:band(-1),borderWidth:0,pointRadius:0,pointHoverRadius:0,fill:false},
    {label:'Pace',data:pace,borderColor:bl,borderDash:[6,4],borderWidth:2,pointRadius:0,pointHoverRadius:0,fill:false},
    {label:'Top set',data:pts,borderColor:t1c,backgroundColor:cv('--card'),pointBorderColor:t1c,pointBorderWidth:2,pointRadius:4,pointHoverRadius:6,borderWidth:2,tension:0.3,fill:false},
    {label:'Pace today',data:[{x:now,y:s.exp}],showLine:false,pointStyle:'rectRot',pointRadius:6,pointHoverRadius:7,backgroundColor:bl,borderColor:bl}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},
    plugins:{legend:{display:false},tooltip:{filter:function(i){return i.datasetIndex>2;},callbacks:{
      title:function(i){return i.length?new Date(i[0].parsed.x).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';},
      label:function(i){return i.dataset.label+': '+gKg(i.parsed.y);}}}},
    scales:{
      x:{type:'linear',min:x0,max:x1,grid:{color:gc},afterBuildTicks:function(a){a.ticks=ticks.map(function(v){return{value:v};});},
        ticks:{color:tc,font:{size:10},maxRotation:0,autoSkip:false,callback:function(v,i){var dt=new Date(v),l=dt.toLocaleDateString('en-GB',{month:'short'});return yrs&&(i===0||dt.getMonth()===0)?l+' \''+String(dt.getFullYear()).slice(2):l;}}},
      y:{grace:'6%',grid:{color:gc},ticks:{color:tc,font:{size:10},maxTicksLimit:6,callback:function(v){return v+' kg';}}}}}});
}
