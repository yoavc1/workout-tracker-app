// Workout Tracker — Coach summary: the app's own verdicts as plain tables, sent with each sync for the Sheet's Coach
// tab. A Claude chat that reads the Sheet then answers with the same statuses, trends and flags the app shows, instead
// of working them out again from the Log. See docs/COACH.md.
// coachSummary(d, now) -> {v, asOf, today, blocks: [{title, note, header: [...], rows: [[...]]}]}. Pure: depends only on
// d and now. Every cell is a string or a number; the Sheet shows them exactly as sent, so the app decides the content
// and changing it never needs the Apps Script redeployed.
var CO={
  RECENT:12,      // recent workouts listed
  WEEKS:8,        // weeks of sets per muscle group
  MISSED:14       // planned workouts missed (and not made up) in the last 14 days are flagged
};
var CO_LBL={progressing:'Progressing',stalled:'Stalled',regressing:'Regressing','new':'New',steady:'Steady',idle:'Not trained lately'};
var CO_FLAG={neg:'Neglected',slow:'Slow progress',goal:'Goal behind',stall:'Stalled',core:'Core',pr:'New best',streak:'Streak'};
// Alert text is built for the page (escaped, sometimes tagged); the Sheet wants it plain
function coTxt(s){return String(s==null?'':s).replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');}
function coR(x){return x==null||!isFinite(x)?'':Math.round(x*10)/10;}
function coMus(m){return m.sub?m.main+' · '+m.sub:m.main;}
function coKind(k){return k==='weight'?'e1RM kg':k==='time'?'hold secs':'reps';}
function coBest(p){return p.kind==='weight'?'e1RM '+p.v+' kg (was '+p.prev+')':p.kind==='time'?p.v+' s hold (was '+p.prev+')':p.v+' reps (was '+p.prev+')';}
function coN(n,one,many){return n+' '+(n===1?one:many);}
function coLocal(t){var x=new Date(t);return lday(x)+' '+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0');}

function coachSummary(d,now){
  d=d||gd();now=now==null?Date.now():+now;
  var today=lday(now),ex=exStats(d,now),groups=groupStats(ex,d,now),blocks=[],mon=addD(today,-dow(today));
  var lifts=d.sessions.filter(function(s){return!isActivity(s);}),first=d.sessions.reduce(function(a,s){var x=lday(s.date);return!a||x<a?x:a;},null);
  var f4=trainFreq(d,28,now),core4=Object.keys(d.core||{}).filter(function(k){var r=d.core[k];return r&&r.done&&r.date>addD(today,-28)&&r.date<=today;}).length;

  blocks.push({title:'About',header:['Item','Value'],rows:[
    ['Updated',coLocal(now)+' (phone time). Refreshed at every save, and once a day the app is opened.'],
    ['Today',today+' ('+DAYL[dow(today)]+')'],
    ['Logged',coN(d.sessions.length,'workout','workouts')+(first?' since '+first:'')+' ('+lifts.length+' lifting, '+coN(d.sessions.length-lifts.length,'activity','activities')+' such as Muay Thai)'],
    ['Last 4 weeks',coN(f4.lifts,'lifting workout','lifting workouts')+', '+coN(f4.acts,'activity','activities')+', '+coN(core4,'core day','core days')],
    ['e1RM','Estimated 1-rep max, kg × (1 + reps/30) with reps capped at '+ST.REP_CAP+'. Weighted exercises are judged on e1RM, bodyweight ones on reps, holds on seconds.'],
    ['Exercise status','Progressing: a new best in the last '+ST.WINDOW+' sessions. Stalled: none in '+ST.WINDOW+'+. Regressing: the last '+ST.WINDOW+' sessions average more than '+ST.REGRESS_PCT+'% below the '+ST.WINDOW+' before. Not trained lately: nothing in '+ST.IDLE_DAYS+' days. New / Steady: too few sessions to judge.'],
    ['Group status','The group\'s exercises trained lately vote: Progressing or Regressing when more than half are, otherwise Stalled.']]});

  // Gaps and highlights, as the app's alert engine finds them, plus planned workouts missed and not made up
  var fl=buildAlerts(d,now).map(function(a){return[CO_FLAG[a.id.split(':')[0]]||a.id,coTxt(a.title),coTxt(a.text)];});
  missedDays(CO.MISSED,d,today).forEach(function(m){fl.push(['Missed plan',m.workout,'Planned for '+m.day+' ('+DAYL[dow(m.day)]+'), not done since']);});
  blocks.push({title:'Flags',note:'Gaps and highlights, most important first. Neglected: a muscle sub-group untrained for twice its usual gap (at least '+AL.NEG_MIN+' days). Slow progress: a group gaining under half your average over 6 weeks. Stalled: no new best in '+AL.STALL+'+ sessions.',
    header:['Type','About','Detail'],rows:fl.length?fl:[['None','','Nothing flagged right now']]});

  var gr=[];groups.forEach(function(g){
    gr.push([g.main,'',CO_LBL[g.status]||g.status,coR(g.trend),g.spw,g.last>0?lday(g.last):'',g.ex.join(', ')]);
    g.subs.forEach(function(s){gr.push([g.main,s.sub||'(none)',CO_LBL[s.status]||s.status,coR(s.trend),s.spw,s.last>0?lday(s.last):'',s.ex.join(', ')]);});});
  blocks.push({title:'Muscle groups',note:'Each group, then its sub-groups. Trend: average change of its exercises over 6 weeks. Sets per week: average over the last 4 weeks.',
    header:['Group','Sub-group','Status','6-week trend %','Sets per week','Last trained','Exercises'],rows:gr.length?gr:[['No lifts logged yet','','','','','','']]});

  var mo=Object.keys(MUSCLES).concat('Other'),er=Object.keys(ex).map(function(x){return ex[x];})
    .sort(function(a,b){return mo.indexOf(a.main)-mo.indexOf(b.main)||a.name.localeCompare(b.name);}).map(function(e){
      return[e.name,coMus(e),CO_LBL[e.idle?'idle':e.status]||e.status,coKind(e.kind),coR(e.cur),coR(e.best),lday(e.bestT),e.since,coR(e.change),
        e.top?e.top.kg+' kg × '+e.top.reps:'',lday(e.last),e.pts.length];});
  blocks.push({title:'Exercises',note:'Latest and Best are measured as the "Measured by" column says. 4-week change: the latest session against where it stood 4 weeks before.',
    header:['Exercise','Muscle','Status','Measured by','Latest','Best','Best on','Sessions since best','4-week change %','Latest top set','Last done','Sessions'],rows:er.length?er:[['No lifts logged yet','','','','','','','','','','','']]});

  // Sets per main muscle group for each of the last WEEKS weeks (this week so far last), with workouts and core days
  var wks=[];for(var i=CO.WEEKS-1;i>=0;i--)wks.push(addD(mon,-7*i));
  var cnt={},wo={},cd={};
  d.sessions.forEach(function(s){var day=lday(s.date);if(day>today)return;var w=addD(day,-dow(day));if(wks.indexOf(w)<0)return;wo[w]=(wo[w]||0)+1;if(isActivity(s))return;
    Object.keys(s.exercises||{}).forEach(function(x){var g=muscleOf(x,d).main,n=(s.exercises[x]||[]).filter(function(t){return+t.kg||+t.reps||+t.secs;}).length;
      if(n){cnt[g]=cnt[g]||{};cnt[g][w]=(cnt[g][w]||0)+n;}});});
  Object.keys(d.core||{}).forEach(function(k){var r=d.core[k];if(!r||!r.done||!r.date||r.date>today)return;var w=addD(r.date,-dow(r.date));cd[w]=(cd[w]||0)+1;});
  var wr=[['Workouts'].concat(wks.map(function(w){return wo[w]||0;})),['Core days'].concat(wks.map(function(w){return cd[w]||0;}))];
  mo.forEach(function(g){if(cnt[g]||(g!=='Core'&&g!=='Other'))wr.push([g+' sets'].concat(wks.map(function(w){return(cnt[g]||{})[w]||0;})));});
  blocks.push({title:'Weekly volume',note:'Columns are weeks, by their Monday; the last one is this week so far. Sets count every logged set for that muscle group.',
    header:['Week of'].concat(wks),rows:wr});

  var gl=goalSort((d.goals||[]).filter(function(g){return!g.archived;})).map(function(g){var s=goalStatus(g,d,now);
    return[g.exercise,+g.startKg||0,g.startDate||'',+g.targetKg||0,g.targetDate||'',coR(s.cur),coR(s.exp),s.status==='done'?'Reached':gLab(s.status),s.perWk==null?'':coR(s.perWk),s.daysLeft];});
  var na=(d.goals||[]).filter(function(g){return g.archived;}).length;
  blocks.push({title:'Goals',note:'Current: the best top set of the last '+GT.RECENT+' days. Expected: where a straight line from start to target is today. On track: within ±'+GT.TOL_KG+' kg or '+GT.TOL_PCT+'% of the gap.'+(na?' '+na+' archived goal'+(na!==1?'s':'')+' not listed.':''),
    header:['Exercise','Start kg','Start date','Target kg','Target date','Current kg','Expected kg today','Status','kg per week needed','Days left'],rows:gl.length?gl:[['No active goals','','','','','','','','','']]});

  var pl=(d.schedule||{}).week||{},hasPlan=DAYS.some(function(k){return pl[k];}),tw=[];
  for(var j=0;j<7;j++){var day=addD(mon,j),lg=[];d.sessions.forEach(function(s){if(lday(s.date)===day&&lg.indexOf(s.workout)<0)lg.push(s.workout);});
    var ms=day<today?missedOn(day,d,today):[];
    tw.push([DAYL[j],day,plannedOn(day,d).join(', ')||(hasPlan?'Rest':''),lg.join(', '),coreDone(day,d.core)?'Yes':'',day===today?'Today':ms.length?'Missed: '+ms.join(', '):'']);}
  blocks.push({title:'This week',note:hasPlan?'Planned comes from the weekly plan, with any moved days.':'No weekly plan set in the app.',header:['Day','Date','Planned','Logged','Core','Note'],rows:tw});

  var rr=d.sessions.slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);}).slice(0,CO.RECENT).map(function(s){
    var e=s.exercises||{},ns=0;Object.keys(e).forEach(function(x){ns+=(e[x]||[]).length;});
    if(isActivity(s))return[lday(s.date),s.workout,s.duration?Math.round(s.duration/60):'','Activity','','','','',''];
    var v=vsPrev(s,d),ar=avgRest(e),pb=sessionBests(s,d);
    return[lday(s.date),s.workout,s.duration?Math.round(s.duration/60):'',Object.keys(e).length,ns,Math.round(Object.keys(e).reduce(function(a,x){return a+setVol(e[x]);},0)),
      ar!=null?fmss(ar):'',v.first?'First time':v.up+' up, '+v.down+' down, '+v.same+' same',pb.map(function(p){return p.name+': '+coBest(p);}).join('; ')];});
  blocks.push({title:'Recent workouts',note:'Newest first. Vs last time: exercises that went up, down or stayed the same against the previous session of that workout (top kg or volume; reps for bodyweight). Avg rest needs sets logged live (since 11 Nov 2026).',
    header:['Date','Workout','Minutes','Exercises','Sets','Volume kg','Avg rest','Vs last time','New bests'],rows:rr.length?rr:[['No workouts logged yet','','','','','','','','']]});

  return{v:1,asOf:coLocal(now),today:today,blocks:blocks};
}
