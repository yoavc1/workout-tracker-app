// Workout Tracker — Derived stats: e1RM, activities, per-exercise series and status, muscle groups
// ═══════ STATS ═══════
var ST={
  REP_CAP:12,        // e1RM gets unreliable past ~12 reps, so higher reps count as 12
  WINDOW:3,          // "progressing" = a new best in the last 3 sessions; "stalled" = none in the last 3+
  REGRESS_PCT:5      // "regressing" = last 3 sessions average more than 5% below the 3 before
};
// Estimated 1-rep max (Epley). null when there is no weight to estimate from.
function e1rm(kg,reps){kg=+kg;reps=+reps;if(!(kg>0)||!(reps>0))return null;return Math.round(kg*(1+Math.min(reps,ST.REP_CAP)/30)*10)/10;}
// Muay Thai / Swimming style entries: every set is 0 kg x 0 reps. They count as training days, not lifts.
function isActivity(s){var ex=s.exercises||{};return Object.keys(ex).every(function(x){return(ex[x]||[]).every(function(t){return!(+t.kg)&&!(+t.reps)&&!(+t.secs);});});}
// One point per session that has this exercise, oldest first. kind: weight (e1RM), bodyweight (reps) or time (secs);
// v is the number progress is judged on for that kind.
function exerciseSeries(name,d){
  d=d||gd();
  return d.sessions.filter(function(s){return s.exercises&&s.exercises[name]&&s.exercises[name].length&&!isActivity(s);})
    .sort(function(a,b){return new Date(a.date)-new Date(b.date);})
    .map(function(s){
      var sets=s.exercises[name],top=null,best=null,reps=0,secs=0;
      sets.forEach(function(t){var kg=+t.kg||0,r=+t.reps||0,e=e1rm(kg,r);
        if(kg>0&&(!top||kg>top.kg||(kg===top.kg&&r>top.reps)))top={kg:kg,reps:r};
        if(e!=null&&(best==null||e>best))best=e;
        if(!(kg>0)&&r>reps)reps=r;
        if(+t.secs>secs)secs=+t.secs;});
      var kind=top?'weight':secs?'time':'bodyweight';
      return{id:s.id,date:s.date,workout:s.workout,kind:kind,top:top,e1rm:best,reps:reps,secs:secs,v:kind==='weight'?(best||0):kind==='time'?secs:reps};
    });
}
// Best numbers for an exercise over the last `days` days (e.g. to pre-fill a goal's start kg); null if not trained
function bestRecent(name,days,d){
  var from=Date.now()-days*864e5,r=null;
  exerciseSeries(name,d).forEach(function(p){if(new Date(p.date).getTime()<from)return;r=r||{kg:0,e1rm:null,reps:0,secs:0,sessions:0};r.sessions++;
    if(p.top&&p.top.kg>r.kg)r.kg=p.top.kg;if(p.e1rm!=null&&(r.e1rm==null||p.e1rm>r.e1rm))r.e1rm=p.e1rm;if(p.reps>r.reps)r.reps=p.reps;if(p.secs>r.secs)r.secs=p.secs;});
  return r;
}
// 'new' (one session), 'progressing', 'steady' (too few sessions to call), 'stalled' or 'regressing'; null if never trained
function status(name,d){
  var v=exerciseSeries(name,d).map(function(p){return p.v;}),n=v.length;
  if(!n)return null;if(n===1)return'new';
  for(var i=Math.max(1,n-ST.WINDOW);i<n;i++){if(v[i]>Math.max.apply(null,v.slice(0,i)))return'progressing';}
  var avg=function(a){return a.reduce(function(x,y){return x+y;},0)/a.length;};
  if(n>=2*ST.WINDOW&&avg(v.slice(-ST.WINDOW))<avg(v.slice(-2*ST.WINDOW,-ST.WINDOW))*(1-ST.REGRESS_PCT/100))return'regressing';
  return n>ST.WINDOW?'stalled':'steady';
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
