// Workout Tracker — Derived stats: e1RM, activities, per-exercise series and status, muscle groups
// ═══════ STATS ═══════
var ST={
  REP_CAP:12,        // e1RM gets unreliable past ~12 reps, so higher reps count as 12
  WINDOW:3,          // "progressing" = a new best in the last 3 sessions; "stalled" = none in the last 3+
  REGRESS_PCT:5,     // "regressing" = last 3 sessions average more than 5% below the 3 before
  IDLE_DAYS:21,      // "not trained lately" = no sets for 3 weeks
  CHANGE_DAYS:28,    // an exercise's change % compares its latest session with where it stood 4 weeks ago
  TREND_DAYS:42,     // a muscle group's trend is the average change of its exercises over 6 weeks
  SETS_DAYS:28       // sets per week are averaged over the last 4 weeks
};
// Estimated 1-rep max (Epley). null when there is no weight to estimate from.
function e1rm(kg,reps){kg=+kg;reps=+reps;if(!(kg>0)||!(reps>0))return null;return Math.round(kg*(1+Math.min(reps,ST.REP_CAP)/30)*10)/10;}
// Muay Thai / Swimming style entries: every set is 0 kg x 0 reps. They count as training days, not lifts.
function isActivity(s){var ex=s.exercises||{};return Object.keys(ex).every(function(x){return(ex[x]||[]).every(function(t){return!(+t.kg)&&!(+t.reps)&&!(+t.secs);});});}
// One session's numbers for one exercise. kind: weight (e1RM), bodyweight (reps) or time (secs);
// v is the number progress is judged on for that kind.
function sPt(s,name){
  var sets=s.exercises[name],top=null,best=null,reps=0,secs=0;
  sets.forEach(function(t){var kg=+t.kg||0,r=+t.reps||0,e=e1rm(kg,r);
    if(kg>0&&(!top||kg>top.kg||(kg===top.kg&&r>top.reps)))top={kg:kg,reps:r};
    if(e!=null&&(best==null||e>best))best=e;
    if(!(kg>0)&&r>reps)reps=r;
    if(+t.secs>secs)secs=+t.secs;});
  var kind=top?'weight':secs?'time':'bodyweight';
  return{id:s.id,date:s.date,t:new Date(s.date).getTime(),workout:s.workout,kind:kind,top:top,e1rm:best,reps:reps,secs:secs,sets:sets,v:kind==='weight'?(best||0):kind==='time'?secs:reps};
}
function liftSessions(d){return d.sessions.filter(function(s){return s.exercises&&!isActivity(s);}).sort(function(a,b){return new Date(a.date)-new Date(b.date);});}
// One point per session that has this exercise, oldest first
function exerciseSeries(name,d){
  d=d||gd();
  return liftSessions(d).filter(function(s){return s.exercises[name]&&s.exercises[name].length;}).map(function(s){return sPt(s,name);});
}
// Every exercise's series from one pass over the sessions: {name: series}
function allSeries(d){
  var o={};liftSessions(d).forEach(function(s){Object.keys(s.exercises).forEach(function(x){if((s.exercises[x]||[]).length)(o[x]=o[x]||[]).push(sPt(s,x));});});
  return o;
}
// Best numbers for an exercise over the last `days` days (e.g. to pre-fill a goal's start kg); null if not trained
function bestRecent(name,days,d){
  var from=Date.now()-days*864e5,r=null;
  exerciseSeries(name,d).forEach(function(p){if(new Date(p.date).getTime()<from)return;r=r||{kg:0,e1rm:null,reps:0,secs:0,sessions:0};r.sessions++;
    if(p.top&&p.top.kg>r.kg)r.kg=p.top.kg;if(p.e1rm!=null&&(r.e1rm==null||p.e1rm>r.e1rm))r.e1rm=p.e1rm;if(p.reps>r.reps)r.reps=p.reps;if(p.secs>r.secs)r.secs=p.secs;});
  return r;
}
// Only the sessions of the exercise's current kind are compared: reps of bodyweight dips say nothing about weighted dips
function sameKind(pts){var k=pts.length&&pts[pts.length-1].kind;return pts.filter(function(p){return p.kind===k;});}
// From the judged numbers, oldest first: 'new' (one session), 'progressing', 'steady' (too few sessions to call),
// 'stalled' or 'regressing'; null if never trained
function statusOf(v){
  var n=v.length;if(!n)return null;if(n===1)return'new';
  for(var i=Math.max(1,n-ST.WINDOW);i<n;i++){if(v[i]>Math.max.apply(null,v.slice(0,i)))return'progressing';}
  var avg=function(a){return a.reduce(function(x,y){return x+y;},0)/a.length;};
  if(n>=2*ST.WINDOW&&avg(v.slice(-ST.WINDOW))<avg(v.slice(-2*ST.WINDOW,-ST.WINDOW))*(1-ST.REGRESS_PCT/100))return'regressing';
  return n>ST.WINDOW?'stalled':'steady';
}
function status(name,d){return statusOf(sameKind(exerciseSeries(name,d)).map(function(p){return p.v;}));}
// % change of the latest session against the last one at least `days` before now. null when there is nothing to
// compare: fewer than 2 sessions, nothing inside the window, or no session before it.
function pctChange(pts,days,now){
  if(pts.length<2)return null;var L=pts[pts.length-1],cut=now-days*864e5,b=null;if(L.t<=cut)return null;
  pts.forEach(function(p){if(p.t<=cut)b=p;});
  return b&&b.v?Math.round((L.v-b.v)/b.v*1000)/10:null;
}
// Everything the Progress screen shows for one exercise. pts: its sessions of the current kind that have a number.
function exStat(name,ser,d,now){
  var pts=sameKind(ser.filter(function(p){return p.v>0;}));if(!pts.length)return null;
  var L=pts[pts.length-1],bi=0;pts.forEach(function(p,i){if(p.v>pts[bi].v)bi=i;});
  var m=muscleOf(name,d);
  return{name:name,main:m.main,sub:m.sub,kind:L.kind,pts:pts,cur:L.v,top:L.top,best:pts[bi].v,bestT:pts[bi].t,since:pts.length-1-bi,
    last:L.t,change:pctChange(pts,ST.CHANGE_DAYS,now),status:statusOf(pts.map(function(p){return p.v;})),idle:now-L.t>ST.IDLE_DAYS*864e5};
}
// {name: exStat} for every exercise with lift data (activities and all-zero entries left out)
function exStats(d,now){
  d=d||gd();now=now||Date.now();var a=allSeries(d),o={};
  Object.keys(a).forEach(function(x){var e=exStat(x,a[x],d,now);if(e)o[x]=e;});
  return o;
}
// A group is 'idle' (not trained lately) when none of its exercises had sets in IDLE_DAYS. Otherwise the exercises
// trained lately vote: 'progressing' or 'regressing' when more than half of those with a verdict are, else 'stalled'
// (a mixed group isn't clearly moving). 'new' while none has enough sessions for a verdict.
function groupStatus(list){
  var act=list.filter(function(e){return!e.idle;});if(!act.length)return'idle';
  var c={progressing:0,stalled:0,regressing:0};act.forEach(function(e){if(e.status in c)c[e.status]++;});
  var j=c.progressing+c.stalled+c.regressing;if(!j)return'new';
  return c.progressing*2>j?'progressing':c.regressing*2>j?'regressing':'stalled';
}
// Average change of the group's recently trained exercises over TREND_DAYS; null when none can be compared
function groupTrend(list,now){
  var ch=[];list.forEach(function(e){if(e.idle)return;var c=pctChange(e.pts,ST.TREND_DAYS,now);if(c!=null)ch.push(c);});
  return ch.length?Math.round(ch.reduce(function(a,b){return a+b;},0)/ch.length*10)/10:null;
}
// The latest day ticked done in the daily core record (noon that local day, in ms); null if none
function lastCoreDay(d){
  var t=null;Object.keys(d.core||{}).forEach(function(k){var r=d.core[k],m=r&&r.done&&/^(\d{4})-(\d\d)-(\d\d)$/.exec(r.date||k.slice(1));
    if(m){var x=new Date(+m[1],m[2]-1,+m[3],12).getTime();if(t==null||x>t)t=x;}});
  return t;
}
// Muscle groups in MUSCLES order (then Other), each with its trained sub-groups:
// {main, status, trend, spw (sets per week), last, ex: [names], subs: [{sub, status, trend, spw, last, ex}]}
function groupStats(ex,d,now){
  d=d||gd();now=now||Date.now();ex=ex||exStats(d,now);var from=now-ST.SETS_DAYS*864e5,sets={},out=[];
  d.sessions.forEach(function(s){var t=new Date(s.date).getTime();if(t<from||t>now||!s.exercises||isActivity(s))return;
    Object.keys(s.exercises).forEach(function(x){var e=ex[x];if(!e)return;
      var n=(s.exercises[x]||[]).filter(function(t){return+t.kg||+t.reps||+t.secs;}).length;
      sets[e.main]=(sets[e.main]||0)+n;sets[e.main+'/'+e.sub]=(sets[e.main+'/'+e.sub]||0)+n;});});
  function agg(list,key,o){o.status=groupStatus(list);o.trend=groupTrend(list,now);o.spw=Math.round((sets[key]||0)*7/ST.SETS_DAYS*10)/10;
    o.last=Math.max.apply(null,list.map(function(e){return e.last;}));o.ex=list.map(function(e){return e.name;});return o;}
  var all=Object.keys(ex).map(function(k){return ex[k];});
  Object.keys(MUSCLES).concat('Other').forEach(function(g){
    var list=all.filter(function(e){return e.main===g;});if(!list.length)return;
    var subs=(MUSCLES[g]||[]).slice();list.forEach(function(e){if(subs.indexOf(e.sub)<0)subs.push(e.sub);});
    var o=agg(list,g,{main:g});
    o.subs=subs.map(function(sb){var l=list.filter(function(e){return e.sub===sb;});return l.length?agg(l,g+'/'+sb,{sub:sb}):null;}).filter(Boolean);
    // Core ticked in the daily core record is Core training too: it keeps the card from reading "not trained lately",
    // while status and trend still come from the lifts (voting on their last verdicts when none was lifted lately)
    var cd=g==='Core'&&lastCoreDay(d);
    if(cd&&cd>o.last){o.last=cd;if(o.status==='idle'&&now-cd<=ST.IDLE_DAYS*864e5)o.status=groupStatus(list.map(function(e){return{status:e.status};}));}
    out.push(o);
  });
  return out;
}
// Sessions in the last `days`: lifts and activities (Muay Thai, Swimming) counted separately
function trainFreq(d,days,now){
  var from=now-days*864e5,r={lifts:0,acts:0};
  d.sessions.forEach(function(s){var t=new Date(s.date).getTime();if(t<from||t>now)return;if(isActivity(s))r.acts++;else r.lifts++;});
  return r;
}
// ─── Muscle groups ───
var MUSCLES={
  Chest:['Upper','Middle','Lower'],
  Back:['Upper lats','Lower lats','Mid back','Traps','Lower back'],
  Shoulders:['Front','Side','Rear'],
  Arms:['Biceps','Triceps','Forearms'],
  Legs:['Quads','Hamstrings','Glutes','Calves','Adductors'],
  Core:['Abs','Obliques']
};
// The groups a muscle group filter offers (Goals, Progress), in MUSCLES order: Chest, Back, Shoulders, Arms and Legs
// always, Core and Other only once something is in them (has[group] truthy)
function mfGroups(has){return Object.keys(MUSCLES).concat('Other').filter(function(k){return(k!=='Core'&&k!=='Other')||has[k];});}
// First match wins, so the specific rules sit above the general ones
// (e.g. "Triceps Pulldown" before pulldowns, "Hamstring Curl" before curls, "Chest Supported Row" before chest).
var MUSCLE_RULES=[
  [/side plank|oblique|russian twist|woodchop/,'Core/Obliques'],
  [/plank|crunch|sit.?up|leg raise|knee raise|ab wheel|hollow|dead ?bug/,'Core/Abs'],
  [/tricep|skull ?crusher|close.?grip bench/,'Arms/Triceps'],
  [/hamstring|leg curl|romanian|\brdl\b|nordic|good morning/,'Legs/Hamstrings'],
  [/calf/,'Legs/Calves'],
  [/forearm|wrist/,'Arms/Forearms'],
  [/curl/,'Arms/Biceps'],
  [/face ?pull|\brear\b|reverse (cable |pec )?fly/,'Shoulders/Rear'],
  [/lateral (shoulder )?raise|side raise|upright row/,'Shoulders/Side'],
  [/front (shoulder )?raise|shoulder raise|shoulder press|overhead press|military|arnold/,'Shoulders/Front'],
  [/shrug/,'Back/Traps'],
  [/(?=.*pull ?down)(?=.*(uni ?lateral|single))/,'Back/Lower lats'],
  [/pull ?down|pull.?up|chin.?up|\blats?\b/,'Back/Upper lats'],
  [/\brow/,'Back/Mid back'],
  [/deadlift|back extension|hyperextension/,'Back/Lower back'],
  [/adductor/,'Legs/Adductors'],
  [/hip thrust|glute|abductor|kickback/,'Legs/Glutes'],
  [/leg extension|squat|lunge|leg press|step.?up|hack/,'Legs/Quads'],
  [/\bdips?\b/,'Chest/Lower'],
  [/incline/,'Chest/Upper'],
  [/decline/,'Chest/Lower'],
  [/fly|flye|pec deck|bench|chest|push.?up/,'Chest/Middle']
];
function muscleOf(name,d){
  var o=((d||gd()).muscles||{})[name],g=o;
  if(!g){var n=String(name).toLowerCase();for(var i=0;i<MUSCLE_RULES.length;i++)if(MUSCLE_RULES[i][0].test(n)){g=MUSCLE_RULES[i][1];break;}}
  if(!g)return{main:'Other',sub:''};
  var p=g.split('/');return{main:p[0],sub:p[1]||''};
}
// Every exercise ever logged or in a saved workout -> 'Main/Sub' (activities -> 'Other'); sent to the Sheet's Muscle column
function muscleMap(d){
  d=d||gd();var names={},out={};
  d.sessions.forEach(function(s){Object.keys(s.exercises||{}).forEach(function(x){names[x]=1;});});
  var w=d.workouts||{};Object.keys(w).forEach(function(k){(w[k]||[]).forEach(function(x){names[x]=1;});});
  Object.keys(names).forEach(function(x){var m=muscleOf(x,d);out[x]=m.sub?m.main+'/'+m.sub:m.main;});
  return out;
}
