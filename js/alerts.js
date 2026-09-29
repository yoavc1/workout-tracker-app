// Workout Tracker — Smart banner: alerts at the top of home, rebuilt from the data on every render
// ═══════ ALERTS ═══════
// Missed planned workouts aren't repeated here: the Today card right above already offers Do it today / Tomorrow.
var AL={
  NEG_X:2,           // a muscle sub-group is neglected at twice its usual gap between sessions...
  NEG_MIN:7,         // ...and never before 7 days
  NEG_MAX:42,        // after 6 weeks without it, it's treated as dropped from the program, not neglected
  NEG_DAYS:3,        // a usual gap needs 3+ training days; it's the median of the last 10 gaps
  SLOW_RATIO:0.5,    // slow overload: a group's 6-week trend below half the average of your groups
  SLOW_DAYS:3,       // ...and only with 3+ sessions of that group in those 6 weeks
  STALL:4,           // stalled: no new best in the last 4 sessions
  CORE_DAYS:4,       // core not done for 4+ days
  STREAK_WEEKS:3,    // a streak: 3+ weeks in a row...
  STREAK_DAYS:2,     // ...each with 2+ training days (activities like Muay Thai count)
  SHOW:3             // alerts shown before "+N more"
};
var ALX=false,ALT=null;
function alDays(a,b){return Math.round((pday(b)-pday(a))/864e5);}
function alMedian(l){var s=l.slice().sort(function(a,b){return a-b;}),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function alPct(v){return(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v*10)/10)+'%';}
function alList(l){return l.map(function(x){return eh(x);}).join(', ');}
// Monday of the week containing day
function alMon(day){return addD(day,-dow(day));}
// A saved workout that includes one of these exercises, to offer "Start …"
function alWorkoutFor(names,d){var w=d.workouts||DW,k=Object.keys(w);
  for(var i=0;i<names.length;i++)for(var j=0;j<k.length;j++)if((w[k[j]]||[]).indexOf(names[i])>=0)return k[j];return null;}

// Every alert that applies right now, most important first: {id, pri, kind (warn|info|pos), icon, title, text, act}
// act: {label, go: 'start'|'goal'|'prog'|'core', arg}. Pure: depends only on d and now.
function buildAlerts(d,now){
  d=d||gd();now=now||Date.now();
  var today=lday(now),ex=exStats(d,now),out=[],named={};
  // 2 · Muscle sub-group neglected, judged against your own rhythm for it
  var days={},last={};
  d.sessions.forEach(function(s){if(isActivity(s))return;var day=lday(s.date);if(day>today)return;
    Object.keys(s.exercises||{}).forEach(function(x){if(!(s.exercises[x]||[]).length)return;var m=muscleOf(x,d);if(!m.sub||m.main==='Core')return;
      var k=m.main+'/'+m.sub;(days[k]=days[k]||{})[day]=1;var l=last[k]=last[k]||{};if(!l[x]||l[x]<day)l[x]=day;});});
  Object.keys(days).forEach(function(k){
    var ds=Object.keys(days[k]).sort();if(ds.length<AL.NEG_DAYS)return;
    var gaps=[];for(var i=1;i<ds.length;i++)gaps.push(alDays(ds[i-1],ds[i]));
    var usual=Math.round(alMedian(gaps.slice(-10))),since=alDays(ds[ds.length-1],today);
    if(since<Math.max(AL.NEG_MIN,AL.NEG_X*usual)||since>AL.NEG_MAX)return;
    var xs=Object.keys(last[k]).sort(function(a,b){return last[k][a]<last[k][b]?1:-1;}).slice(0,2),w=alWorkoutFor(xs,d),p=k.split('/');
    out.push({id:'neg:'+k,pri:2,kind:'warn',icon:'⚠️',title:p[0]+' · '+p[1],
      text:'No sets in '+since+' days (usually every '+usual+'). '+alList(xs),
      act:w?{label:'Start '+w,go:'start',arg:w}:{label:'See progress',go:'prog',arg:xs[0]},since:since});
  });
  out.sort(function(a,b){return b.since-a.since;});
  // 3 · A muscle group progressing well below your average over 6 weeks
  var gs=groupStats(ex,d,now).filter(function(g){return g.main!=='Other'&&g.main!=='Core'&&g.trend!=null;});
  var avg=gs.length>1?gs.reduce(function(a,g){return a+g.trend;},0)/gs.length:0,from=now-ST.TREND_DAYS*864e5;
  if(avg>0)gs.forEach(function(g){
    if(g.trend>=avg*AL.SLOW_RATIO)return;
    var n={};d.sessions.forEach(function(s){var t=new Date(s.date).getTime();if(t<from||t>now||isActivity(s))return;
      if(g.ex.some(function(x){return(s.exercises[x]||[]).length;}))n[lday(s.date)]=1;});
    if(Object.keys(n).length<AL.SLOW_DAYS)return;
    var st=g.ex.filter(function(x){var e=ex[x];return e&&!e.idle&&(e.status==='stalled'||e.status==='regressing');}).slice(0,2);
    st.forEach(function(x){named[x]=1;});
    var r=g.trend/avg,how=g.trend<=0?'Not progressing':'Progressing at '+(r<0.2?'under a fifth':r<0.3?'about a quarter':r<0.4?'about a third':'under half')+' of your average';
    out.push({id:'slow:'+g.main,pri:3,kind:'warn',icon:'📉',title:g.main,
      text:how+' ('+alPct(g.trend)+' vs '+alPct(avg)+' over 6 weeks).'+(st.length?' Stalled: '+alList(st):''),
      act:{label:'See progress',go:'prog',arg:st.length===1?st[0]:null}});
  });
  // 4 · Goal behind its straight-line pace
  (d.goals||[]).forEach(function(g){if(g.archived)return;var s=goalStatus(g,d,now);if(s.status!=='behind')return;
    out.push({id:'goal:'+g.id,pri:4,kind:'warn',icon:'🎯',title:g.exercise,
      text:gKg(s.cur)+' now, should be ~'+gKg(Math.round(s.exp*2)/2)+' by today',act:{label:'View goal',go:'goal',arg:g.id}});});
  // 5 · Exercises with no new best for a while (one alert for all of them), leaving out those named above
  var stall=Object.keys(ex).map(function(x){return ex[x];}).filter(function(e){return!e.idle&&e.since>=AL.STALL&&!named[e.name]&&e.main!=='Other';})
    .sort(function(a,b){return b.since-a.since;});
  if(stall.length)out.push({id:'stall',pri:5,kind:'info',icon:'⏸️',title:stall.length===1?stall[0].name:stall.length+' exercises stalled',
    text:stall.length===1?'No new best in '+stall[0].since+' sessions':'No new best in '+AL.STALL+'+ sessions: '+alList(stall.slice(0,3).map(function(e){return e.name;}))+(stall.length>3?' and '+(stall.length-3)+' more':''),
    act:{label:'See progress',go:'prog',arg:stall.length===1?stall[0].name:null}});
  // 6 · Core not done lately (only once core has been logged at all)
  var lc=lastCoreDay(d);if(lc!=null){var cs=alDays(lday(lc),today);
    if(cs>=AL.CORE_DAYS)out.push({id:'core',pri:6,kind:'info',icon:'💪',title:'Core',text:'Not done in '+cs+' days',act:{label:'Log core',go:'core'}});}
  // 7 · Positive: a real best this week (beating an earlier session), and a streak of training weeks
  var mon=alMon(today),wk0=pday(mon).getTime(),pr=null;
  Object.keys(ex).forEach(function(x){var e=ex[x];if(e.main==='Other')return;var p=e.pts,bi=-1;
    p.forEach(function(q,i){if(bi<0||q.v>p[bi].v)bi=i;});
    if(bi>0&&p[bi].t>=wk0&&p[bi].t<=now){var prev=Math.max.apply(null,p.slice(0,bi).map(function(q){return q.v;}));
      if(!pr||p[bi].t>pr.t)pr={name:x,t:p[bi].t,pt:p[bi],gain:p[bi].v-prev};}});
  if(pr){var q=pr.pt,val=q.kind==='weight'?q.top.kg+' kg × '+q.top.reps+' (e1RM '+q.v+' kg)':q.kind==='time'?q.v+' s hold':q.v+' reps';
    out.push({id:'pr:'+pr.name+':'+mon,pri:7,kind:'pos',icon:'🏆',title:'New best: '+pr.name,text:val,act:{label:'See progress',go:'prog',arg:pr.name}});}
  var tdays={};d.sessions.forEach(function(s){var day=lday(s.date);if(day<=today)(tdays[alMon(day)]=tdays[alMon(day)]||{})[day]=1;});
  var cnt=function(m){return Object.keys(tdays[m]||{}).length;},m=cnt(mon)>=AL.STREAK_DAYS?mon:addD(mon,-7),n=0;
  while(cnt(m)>=AL.STREAK_DAYS){n++;m=addD(m,-7);}
  if(n>=AL.STREAK_WEEKS)out.push({id:'streak',pri:7,kind:'pos',icon:'🔥',title:n+' weeks in a row',text:'with '+AL.STREAK_DAYS+'+ training days each'});
  return out.sort(function(a,b){return a.pri-b.pri;});
}

// ─── Snooze: hides an alert until tomorrow, on this device only ───
function gSnz(){try{return JSON.parse(localStorage.getItem('ironlog_snooze'))||{};}catch(e){return{};}}
function snooze(id){var t=lday(new Date()),s=gSnz(),o={};Object.keys(s).forEach(function(k){if(s[k]===t)o[k]=t;});o[id]=t;
  try{localStorage.setItem('ironlog_snooze',JSON.stringify(o));}catch(e){}}

// ─── Banner in #ins-sec ───
function rAlerts(){
  var el=document.getElementById('ins-sec'),t=lday(new Date()),sz=gSnz();
  var all=buildAlerts(gd()).filter(function(a){return sz[a.id]!==t;}),show=ALX?all:all.slice(0,AL.SHOW);
  if(!all.length){el.innerHTML='';return;}
  var h='<div class="al-wrap">';
  show.forEach(function(a,i){h+='<div class="ins al '+a.kind+'"><div class="ins-icon">'+a.icon+'</div><div class="al-m"><div class="al-t">'+eh(a.title)+'</div><div class="al-s">'+a.text+'</div>'+
    (a.act?'<button class="al-b" data-i="'+i+'">'+eh(a.act.label)+'</button>':'')+'</div><button class="al-x" data-i="'+i+'" aria-label="Hide until tomorrow">×</button></div>';});
  if(all.length>AL.SHOW)h+='<button class="al-more">'+(ALX?'Show less':'+'+(all.length-AL.SHOW)+' more')+'</button>';
  el.innerHTML=h+'</div>';
  el.querySelectorAll('.al-b').forEach(function(b){b.addEventListener('click',function(){alGo(show[+b.dataset.i].act);});});
  el.querySelectorAll('.al-x').forEach(function(b){b.addEventListener('click',function(){snooze(show[+b.dataset.i].id);rAlerts();toast('Hidden until tomorrow','var(--t2)');});});
  var mb=el.querySelector('.al-more');if(mb)mb.addEventListener('click',function(){ALX=!ALX;rAlerts();});
}
function alGo(a){
  if(a.go==='start')openWK(a.arg);
  else if(a.go==='goal'){switchTab('goals');openGoal(a.arg);}
  else if(a.go==='prog'){PGX=a.arg||null;switchTab('progress');}
  else if(a.go==='core')openCore(lday(new Date()));
}
// Rebuild just after midnight, so day counts and "this week" roll over even if the app stays open
function alMidnight(){clearTimeout(ALT);var n=new Date(),m=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1,0,0,5);
  ALT=setTimeout(function(){refreshView();alMidnight();},m-n);}
