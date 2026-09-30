// Workout Tracker — Progress screen: muscle groups at a glance, exercises by muscle, exercise detail with chart
// ═══════ PROGRESS ═══════
// PGX: exercise open in the detail view (null = overview); PGR: chart range; PGO: expanded group cards;
// PGF: the muscle group the overview is filtered to ('' = all of them)
var PGX=null,PGR='3M',PGO={},PGSC=0,PGALL=false,PGMT=null,PGTA=null,pgBound=false,PGF='';
var PG_LBL={progressing:'Progressing',stalled:'Stalled',regressing:'Regressing','new':'New',steady:'Steady',idle:'Not lately'};
var PG_CLS={progressing:'up',stalled:'flat',regressing:'down','new':'new',steady:'new',idle:'idle'};
var PG_RANGES={'1M':1,'3M':3,'6M':6,ALL:0};
function pgCss(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
function pgN(v){return String(Math.round(v*100)/100);} // 46.25 kg plates stay exact; e1RM is already 1 decimal
function pgSecs(s){return s<60?s+' s':Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
// The number an exercise is judged on, with its unit
function pgVal(v,kind){return kind==='weight'?pgN(v)+' kg':kind==='time'?pgSecs(v):v+' reps';}
function pgTop(t){return t?pgN(t.kg)+' × '+t.reps:'—';}
function pgPct(p){if(p==null)return'<span class="pg-pct">—</span>';return'<span class="pg-pct'+(p>0?' up':p<0?' down':'')+'">'+(p>0?'+':p<0?'−':'')+(Math.round(Math.abs(p)*10)/10)+'%</span>';}
function pgSpw(n){n=n>=10?Math.round(n):Math.round(n*10)/10;return n+(n===1?' set':' sets')+'/wk';}
function pgChip(st){return'<span class="pg-chip '+PG_CLS[st]+'">'+PG_LBL[st]+'</span>';}
function pgSt(e){return e.idle?'idle':e.status;}
// "28 Sept", with the year when it isn't this year
function pgDate(t,now){var d=new Date(t);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+(d.getFullYear()!==new Date(now||Date.now()).getFullYear()?' '+d.getFullYear():'');}
// Parses 'YYYY-MM-DD' as a local day (Date.parse would read it as UTC midnight)
function pgDay(s){var m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');return m?new Date(+m[1],m[2]-1,+m[3]).getTime():Date.parse(s);}

// ─── Chart axis (pure) ───
// Visible x-range [from, to] in ms for a range key; All starts at the first session. Padded so edge points aren't cut.
function pgRange(pts,r,now){
  var b=now,a;if(PG_RANGES[r]){var c=new Date(now);c.setMonth(c.getMonth()-PG_RANGES[r]);a=c.getTime();}else a=pts.length?pts[0].t:now;
  if(b-a<14*864e5)a=b-14*864e5;var pad=(b-a)*0.03;return[a-pad,b+pad];
}
// Date ticks for a linear time axis (Chart.js's time scale would need a date adapter): Mondays up to ~6 weeks, else the
// 1st of every month (or every 2nd/3rd month so there are at most ~7). Labels carry the year when the range spans two.
function pgTicks(a,b){
  var span=(b-a)/864e5,yr=new Date(a).getFullYear()!==new Date(b).getFullYear(),out=[],t;
  var yy=function(d){return yr?' ’'+String(d.getFullYear()).slice(2):'';};
  var mon=function(d){return d.toLocaleDateString('en-GB',{month:'short'});};
  if(span<=45){t=new Date(a);t.setHours(0,0,0,0);while(t.getDay()!==1||t.getTime()<a)t.setDate(t.getDate()+1);
    for(;t.getTime()<=b;t.setDate(t.getDate()+7))out.push({v:t.getTime(),l:t.getDate()+' '+mon(t)+yy(t)});return out;}
  var step=Math.max(1,Math.ceil(span/30.4/7));t=new Date(a);t=new Date(t.getFullYear(),t.getMonth(),1);if(t.getTime()<a)t=new Date(t.getFullYear(),t.getMonth()+1,1);
  for(;t.getTime()<=b;t=new Date(t.getFullYear(),t.getMonth()+1,1))if(t.getMonth()%step===0)out.push({v:t.getTime(),l:mon(t)+yy(t)});
  return out;
}
// The goal's straight line from start to target, clipped to [a, b]; null when it doesn't reach into the range
function pgPace(g,a,b){
  var t0=pgDay(g.startDate),t1=pgDay(g.targetDate),k0=+g.startKg,k1=+g.targetKg;
  if(!(t1>t0)||isNaN(k0)||isNaN(k1)||t1<a||t0>b)return null;
  var at=function(t){return Math.round((k0+(k1-k0)*(t-t0)/(t1-t0))*10)/10;},x0=Math.max(a,t0),x1=Math.min(b,t1);
  return[{x:x0,y:at(x0)},{x:x1,y:at(x1)}];
}
function pgGoal(d,name){var g=(d.goals||[]).filter(function(g){return!g.archived&&g.exercise===name;});return g.length?g[g.length-1]:null;}
// The muscle group filter's chips: [{group, n}], n = the exercises listed under the group. Core also counts the ones in
// the daily core record (its card shows them), and shows once there's a core lift or a core day logged.
function pgGroups(ex,d){
  var n={},cs=typeof coreStats==='function'&&d.core?coreStats(d):[];
  Object.keys(ex).forEach(function(x){var m=ex[x].main;n[m]=(n[m]||0)+1;});
  cs.forEach(function(c){if(!ex[c.name]||ex[c.name].main!=='Core')n.Core=(n.Core||0)+1;});
  return mfGroups({Core:n.Core||lastCoreDay(d),Other:n.Other}).map(function(k){return{group:k,n:n[k]||0};});
}

// ─── Merge (Merge into…) ───
// Joins an exercise's history into another (a renamed exercise and its new name become one chart); renameExHist
// moves its goals and muscle override too. Saved workouts switch to the new name without listing it twice.
// Returns how many sessions moved.
function pgMergeEx(from,to){
  var n=renameExHist(from,to),w=gw(),ch=false;
  Object.keys(w).forEach(function(k){var l=w[k]||[];if(l.indexOf(from)<0)return;var o=[];
    l.forEach(function(x){x=x===from?to:x;if(o.indexOf(x)<0)o.push(x);});w[k]=o;ch=true;});
  if(ch)sw(w);
  return n;
}

// ─── Render ───
function rProg(){
  pgBind();var d=gd(),now=Date.now(),ex=exStats(d,now);
  if(PGX&&!ex[PGX])PGX=null;
  document.getElementById('pg-bk').style.display=PGX?'':'none';
  document.getElementById('pg-main').style.display=PGX?'none':'';
  document.getElementById('pg-det').style.display=PGX?'':'none';
  if(PGX)rPDet(d,ex,now);else{if(PCI){PCI.destroy();PCI=null;}rPMain(d,ex,now);}
  if(typeof rCoreProg==='function')rCoreProg(document.getElementById('prog-core'));
}
function pgOpen(x){var s=document.getElementById('s-prog');PGSC=s.scrollTop;PGX=x;PGALL=false;rProg();s.scrollTop=0;}
function pgBack(){PGX=null;rProg();document.getElementById('s-prog').scrollTop=PGSC;}

function rPMain(d,ex,now){
  var gl=document.getElementById('pg-glance'),xl=document.getElementById('pg-exl'),pc=document.getElementById('prog-core'),names=Object.keys(ex);
  if(!names.length){PGF='';pc.style.display='';gl.innerHTML='<div class="empty"><h3>No lifts yet</h3><p>Log a workout and your progress shows up here.</p></div>';xl.innerHTML='';return;}
  var G=groupStats(ex,d,now),f=trainFreq(d,ST.SETS_DAYS,now),gg=pgGroups(ex,d);
  // Muscle group filter: it narrows the cards, the exercises and (unless it's Core) hides the Core card
  if(!gg.some(function(x){return x.group===PGF;}))PGF='';
  G=G.filter(function(g){return!PGF||g.main===PGF;});pc.style.display=!PGF||PGF==='Core'?'':'none';
  var h=mfChips(gg,gg.reduce(function(a,x){return a+x.n;},0),PGF),cards=G.filter(function(g){return g.main!=='Other';});
  if(!G.length&&PGF!=='Core')h+='<div class="empty"><h3>No lifts for '+eh(PGF)+' yet</h3><p>Log one and its progress shows up here, or tap All to see the rest.</p></div>';
  if(cards.length)h+='<h3 class="pg-h">At a glance</h3><div class="pg-sub">Last 4 weeks: '+f.lifts+' workout'+(f.lifts!==1?'s':'')+(f.acts?' · '+f.acts+' activit'+(f.acts!==1?'ies':'y'):'')+'</div><div class="pg-gl">';
  cards.forEach(function(g){
    var meta=g.status==='idle'?'Last trained '+pgDate(g.last,now):pgPct(g.trend)+'<span class="pg-dim">6 wk</span><span class="pg-dot">·</span>'+pgSpw(g.spw);
    h+='<div class="pg-gc'+(PGO[g.main]?' open':'')+'" data-g="'+ea(g.main)+'"><button class="pg-gh"><div class="pg-gt"><span class="pg-gn">'+eh(g.main)+'</span>'+pgChip(g.status)+'</div><div class="pg-gm">'+meta+'<span class="pg-chv">▾</span></div></button><div class="pg-gb">';
    g.subs.forEach(function(s){
      h+='<div class="pg-sr"><div class="pg-sn"><div>'+eh(s.sub||'Other')+'</div><div class="pg-sx">'+s.ex.map(eh).join(' · ')+'</div></div><div class="pg-sv">'+(s.status==='idle'?'<span class="pg-pct">'+pgDate(s.last,now)+'</span>':pgPct(s.trend))+'<div class="pg-dim">'+pgSpw(s.spw)+'</div></div>'+pgChip(s.status)+'</div>';});
    h+='</div></div>';});
  gl.innerHTML=h+(cards.length?'</div>':'');
  // Tap a group to show only its progress; tap it again, or All, to show them all
  gl.querySelectorAll('.gf-c').forEach(function(b){b.addEventListener('click',function(){PGF=PGF===b.dataset.g?'':b.dataset.g;rProg();});});
  gl.querySelectorAll('.pg-gh').forEach(function(b){b.addEventListener('click',function(){var c=b.parentNode,g=c.dataset.g;PGO[g]=!PGO[g];c.classList.toggle('open',PGO[g]);});});
  // Exercises by main group: recently trained first (by sub-group), the ones not trained lately at the bottom
  if(!G.length){xl.innerHTML='';return;}
  h='<h3 class="pg-h">Exercises</h3>';
  G.forEach(function(g){var subs=(MUSCLES[g.main]||[]);
    var l=g.ex.map(function(x){return ex[x];}).sort(function(a,b){return(a.idle-b.idle)||(subs.indexOf(a.sub)-subs.indexOf(b.sub))||(b.last-a.last);});
    h+='<div class="pg-el">'+eh(g.main)+'</div><div class="pg-card">';
    l.forEach(function(e){var st=pgSt(e),m=[];if(e.sub)m.push(eh(e.sub));
      if(e.kind==='weight')m.push(pgN(e.cur)+' kg e1RM',pgTop(e.top));else m.push(pgVal(e.cur,e.kind)+(e.kind==='time'?' hold':''));
      m.push(e.idle?'last '+pgDate(e.last,now):pgPct(e.change)+' <span class="pg-dim">4 wk</span>');
      h+='<button class="pg-xr" data-x="'+ea(e.name)+'"><div class="pg-xm"><div class="pg-xn">'+eh(e.name)+'</div><div class="pg-xs"><span>'+m.join('</span><span class="pg-dot">·</span><wbr><span>')+'</span></div></div><div class="pg-xrr">'+pgSpark(e.pts,PG_CLS[st])+pgChip(st)+'</div></button>';});
    h+='</div>';});
  xl.innerHTML=h;
  xl.querySelectorAll('.pg-xr').forEach(function(b){b.addEventListener('click',function(){pgOpen(b.dataset.x);});});
}
// Sparkline of the last 8 sessions as inline SVG, coloured by status through CSS
function pgSpark(pts,cls){
  var v=pts.slice(-8).map(function(p){return p.v;}),W=64,H=22,mn=Math.min.apply(null,v),r=Math.max.apply(null,v)-mn;
  var xy=v.map(function(y,i){return[v.length>1?2+i*(W-4)/(v.length-1):W/2,r?H-3-(y-mn)/r*(H-6):H/2];});
  var p=xy.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' '),l=xy[xy.length-1];
  return'<svg class="pg-spk '+cls+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+(v.length>1?'<polyline points="'+p+'"/>':'')+'<circle cx="'+l[0].toFixed(1)+'" cy="'+l[1].toFixed(1)+'" r="2.4"/></svg>';
}

function rPDet(d,ex,now){
  var e=ex[PGX],el=document.getElementById('pg-det'),st=pgSt(e),g=e.kind==='weight'?pgGoal(d,e.name):null,why;
  if(st==='idle')why='Not trained since '+pgDate(e.last,now)+'.';
  else if(st==='progressing')why='New best on '+pgDate(e.bestT,now)+'.';
  else if(st==='stalled')why='No new best in '+e.since+' sessions. Best: '+pgVal(e.best,e.kind)+' on '+pgDate(e.bestT,now)+'.';
  else if(st==='regressing')why='Your last 3 sessions average more than '+ST.REGRESS_PCT+'% below the 3 before.';
  else if(st==='new')why='First logged on '+pgDate(e.last,now)+'.';
  else why='Too early to call: no new best after the first session yet.';
  var T=e.kind==='weight'?[['e1RM (kg)',pgN(e.cur)],['Best (kg)',pgN(e.best)],['Top set',pgTop(e.top)],['4 weeks',pgPct(e.change)]]
    :[[e.kind==='time'?'Hold':'Reps',e.kind==='time'?pgSecs(e.cur):e.cur],['Best',e.kind==='time'?pgSecs(e.best):e.best],['Sessions',e.pts.length],['4 weeks',pgPct(e.change)]];
  var h='<div class="pg-dn">'+eh(e.name)+'</div><div class="pg-dm"><button class="pg-mus" id="pg-mus">'+eh(e.main)+(e.sub?' · '+eh(e.sub):'')+' <span class="pg-dim">✎</span></button>'+pgChip(st)+'</div><div class="pg-why">'+why+'</div>';
  h+='<div class="pg-tiles">'+T.map(function(t){return'<div class="pg-tile"><div class="pg-tl">'+t[0]+'</div><div class="pg-tv">'+t[1]+'</div></div>';}).join('')+'</div>';
  h+='<div class="pg-rng">'+Object.keys(PG_RANGES).map(function(r){return'<button class="pg-rb'+(r===PGR?' active':'')+'" data-r="'+r+'">'+(r==='ALL'?'All':r)+'</button>';}).join('')+'</div>';
  var ylab=e.kind==='weight'?'e1RM':e.kind==='time'?'Best hold':'Best reps';
  h+='<div class="pg-cc"><div class="pg-cw" id="pg-cw"><canvas id="pg-chart"></canvas></div><div class="pg-leg"><span><i class="pg-li"></i>'+ylab+'</span>'+(e.kind==='weight'?'<span><i class="pg-lp"></i>Top set (kg)</span>':'')+(g?'<span><i class="pg-lg"></i>Goal pace</span>':'')+'</div>'+(g?'<div class="pg-goal">Goal: '+pgN(+g.targetKg)+' kg by '+pgDate(pgDay(g.targetDate),now)+' (from '+pgN(+g.startKg)+' kg on '+pgDate(pgDay(g.startDate),now)+')</div>':'')+'</div>';
  // Recent sessions in the range, newest first; a trophy marks a new best
  var rg=pgRange(e.pts,PGR,now),rows=[],mx=0;
  e.pts.forEach(function(p,i){var pr=i>0&&p.v>mx;mx=Math.max(mx,p.v);if(p.t>=rg[0])rows.push({p:p,pr:pr});});
  rows.reverse();var W=e.kind==='weight',all=rows.length;if(!PGALL)rows=rows.slice(0,8);
  h+='<h3 class="pg-h" style="margin-top:22px">Sessions</h3>';
  if(!all)h+='<div class="cempty" style="min-height:70px">No sessions in this range.</div>';
  else{h+='<div class="pg-card pg-tbl"><div class="pg-tr'+(W?'':' bw')+' pg-th"><span>Date</span><span>'+(W?'Top set':'Best')+'</span>'+(W?'<span>e1RM</span>':'')+'<span>Sets</span></div>';
    rows.forEach(function(r){var p=r.p,sets=p.sets.map(function(t){return+t.secs?pgSecs(+t.secs):+t.kg?pgN(+t.kg)+'×'+t.reps:t.reps;}).join(', ');
      h+='<div class="pg-tr'+(W?'':' bw')+'"><span>'+pgDate(p.t,now)+'</span><span class="pg-b">'+(W?pgTop(p.top):pgVal(p.v,p.kind))+(r.pr?' <span class="pg-pr" title="New best">🏆</span>':'')+'</span>'+(W?'<span>'+(p.e1rm!=null?pgN(p.e1rm):'—')+'</span>':'')+'<span>'+p.sets.length+'</span><span class="pg-ts">'+eh(sets)+'</span></div>';});
    h+='</div>';if(all>rows.length)h+='<button class="pg-more" id="pg-more">Show all '+all+'</button>';}
  h+='<button class="pg-act" id="pg-merge">Merge into…</button><div class="pg-note">Renamed this exercise? Merge its history into the new name so it becomes one chart.</div>';
  el.innerHTML=h;
  el.querySelectorAll('.pg-rb').forEach(function(b){b.addEventListener('click',function(){PGR=b.dataset.r;PGALL=false;rProg();});});
  document.getElementById('pg-mus').addEventListener('click',function(){pgMus(e.name);});
  document.getElementById('pg-merge').addEventListener('click',function(){pgMerge(e.name);});
  var mo=document.getElementById('pg-more');if(mo)mo.addEventListener('click',function(){PGALL=true;rProg();});
  pgChart(e,g,rg,now);
}

// e1RM (or reps/secs) line, top-set points and the goal's pace line. Colours are read from the theme when drawn.
function pgChart(e,g,rg,now){
  if(PCI){PCI.destroy();PCI=null;}
  var a=rg[0],b=rg[1],inr=e.pts.filter(function(p){return p.t>=a&&p.t<=b;}),cw=document.getElementById('pg-cw');
  if(!inr.length){cw.innerHTML='<div class="cempty">Nothing logged in this range.<br>Last session: '+pgDate(e.last,now)+'</div>';return;}
  // The session just before the range keeps the line running in from the left edge
  var li=inr.slice(),pv=e.pts.filter(function(p){return p.t<a;}).pop();if(pv)li.unshift(pv);
  var C={line:pgCss('--blue'),fill:pgCss('--bdim'),pt:pgCss('--t2'),goal:pgCss('--orange'),grid:pgCss('--brd'),tick:pgCss('--t3'),card:pgCss('--card')};
  var W=e.kind==='weight',unit=function(v){return W?pgN(v)+' kg':e.kind==='time'?pgSecs(v):pgN(v);};
  var ds=[{label:'v',data:li.map(function(p){return{x:p.t,y:p.v};}),borderColor:C.line,backgroundColor:C.fill,fill:'start',tension:0.3,borderWidth:2.5,
    pointRadius:4,pointHoverRadius:6,pointBackgroundColor:C.card,pointBorderColor:C.line,pointBorderWidth:2,order:2}];
  if(W)ds.push({label:'top',data:inr.map(function(p){return{x:p.t,y:p.top.kg,r:p.top.reps};}),showLine:false,pointRadius:3.5,pointHoverRadius:5,
    pointBackgroundColor:C.pt,pointBorderColor:C.pt,order:1});
  var pace=g&&pgPace(g,a,b);
  if(pace)ds.push({label:'goal',data:pace,borderColor:C.goal,borderDash:[6,4],borderWidth:2,pointRadius:0,pointHoverRadius:0,fill:false,order:3});
  var ticks=pgTicks(a,b),tl={};ticks.forEach(function(t){tl[t.v]=t.l;});
  var font={family:'DM Sans',size:10};
  PCI=new Chart(document.getElementById('pg-chart').getContext('2d'),{type:'line',data:{datasets:ds},options:{
    responsive:true,maintainAspectRatio:false,animation:{duration:250},interaction:{mode:'nearest',intersect:false,axis:'x'},
    plugins:{legend:{display:false},tooltip:{filter:function(i){return i.dataset.label!=='goal';},callbacks:{
      title:function(i){return i.length?new Date(i[0].parsed.x).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'';},
      label:function(c){return c.dataset.label==='top'?'Top set: '+pgN(c.raw.y)+' kg × '+c.raw.r:(W?'e1RM: ':e.kind==='time'?'Best hold: ':'Best reps: ')+unit(c.raw.y);}}}},
    scales:{x:{type:'linear',min:a,max:b,afterBuildTicks:function(ax){ax.ticks=ticks.map(function(t){return{value:t.v};});},
        ticks:{color:C.tick,font:font,maxRotation:0,autoSkipPadding:6,callback:function(v){return tl[v]||'';}},grid:{color:C.grid},border:{color:C.grid}},
      y:{grace:'10%',ticks:{color:C.tick,font:font,maxTicksLimit:6,callback:function(v){return unit(v);}},grid:{color:C.grid},border:{display:false}}}}});
}

// ─── Sheets: muscle group picker and Merge into… ───
function pgBind(){
  if(pgBound)return;pgBound=true;
  document.getElementById('pg-bk').addEventListener('click',pgBack);
  ['mov-mus','mov-merge'].forEach(function(id){var m=document.getElementById(id);m.addEventListener('click',function(e){if(e.target===m)m.classList.remove('active');});});
  document.getElementById('mus-cancel').addEventListener('click',function(){document.getElementById('mov-mus').classList.remove('active');});
  document.getElementById('mg-cancel').addEventListener('click',function(){document.getElementById('mov-merge').classList.remove('active');});
  var inp=document.getElementById('mg-inp');
  PGTA=typeahead(inp,pgMergeCands,function(x){PGMT=x;pgMergeConf();});
  inp.addEventListener('input',function(){if(inp.value!==PGMT){PGMT=null;pgMergeConf();}});
  document.getElementById('mg-go').addEventListener('click',pgDoMerge);
}
function pgMus(name){
  var d=gd(),cur=muscleOf(name,d),gu=muscleOf(name,{}),own=!!(d.muscles||{})[name],h='';
  document.getElementById('mus-for').innerHTML='For <b>'+eh(name)+'</b>. '+(own?'You set this; the guess from its name is ':'Guessed from its name: ')+eh(gu.main+(gu.sub?' · '+gu.sub:''))+'.';
  Object.keys(MUSCLES).forEach(function(g){h+='<div class="pg-mg">'+g+'</div><div class="pg-ms">'+MUSCLES[g].map(function(s){
    return'<button class="pg-mb'+(cur.main===g&&cur.sub===s?' on':'')+'" data-m="'+ea(g+'/'+s)+'">'+eh(s)+'</button>';}).join('')+'</div>';});
  var o=document.getElementById('mus-opts');o.innerHTML=h;
  o.querySelectorAll('.pg-mb').forEach(function(b){b.addEventListener('click',function(){
    var m=b.dataset.m,gs=gu.main+'/'+gu.sub;setMuscle(name,m===gs?null:m);
    document.getElementById('mov-mus').classList.remove('active');rProg();toast('Now in '+m.replace('/',' · '));});});
  document.getElementById('mov-mus').classList.add('active');
}
// Candidates: exercises in the same sub-group first, then the same main group, then the rest (each most recent first)
function pgMergeCands(){
  var d=gd(),me=muscleOf(PGX,d),r=function(x){var m=muscleOf(x,d);return m.main!==me.main?2:m.sub!==me.sub?1:0;};
  return exNames(d).filter(function(x){return x!==PGX;}).map(function(x,i){return{x:x,r:r(x),i:i};})
    .sort(function(a,b){return a.r-b.r||a.i-b.i;}).map(function(o){return o.x;});
}
function pgMerge(name){
  var inp=document.getElementById('mg-inp');inp.value='';inp.blur();PGTA.hide();PGMT=null;
  document.getElementById('mg-from').textContent=name;pgMergeConf();
  document.getElementById('mov-merge').classList.add('active');
}
function pgMergeConf(){
  var c=document.getElementById('mg-conf'),go=document.getElementById('mg-go');go.disabled=!PGMT;
  if(!PGMT){c.innerHTML='';return;}
  var n=gs().filter(function(s){return s.exercises&&s.exercises[PGX];}).length;
  c.innerHTML='Move '+n+' session'+(n!==1?'s':'')+' of <b>'+eh(PGX)+'</b> into <b>'+eh(PGMT)+'</b>? Saved workouts will use <b>'+eh(PGMT)+'</b> too. This can’t be undone.';
}
function pgDoMerge(){
  var from=PGX,to=PGMT;if(!from||!to)return;
  // A workout in progress still lists the old name, so finishing it would split the history again
  var dr=gDri();if(dr&&(dr.list||gw()[dr.workout]||[]).indexOf(from)>=0){toast('Finish your '+dr.workout+' workout first','var(--orange)');return;}
  var n=pgMergeEx(from,to);document.getElementById('mov-merge').classList.remove('active');
  PGX=to;PGALL=false;rProg();document.getElementById('s-prog').scrollTop=0;toast('Merged '+n+' session'+(n!==1?'s':'')+' into '+to);
}
