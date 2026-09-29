// Workout Tracker — Schedule: the Today card, weekly plan, month calendar and moving a missed day
// ═══════ PLAN ═══════
// Pure functions of the data, so the alerts (Track F) can reuse them. Days are local 'YYYY-MM-DD' strings. The weekly
// plan repeats every week; a move shifts one planned workout to another day ("do Monday's Legs on Tuesday").
var DAYL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function pday(day){var p=day.split('-');return new Date(+p[0],p[1]-1,+p[2]);}
function addD(day,n){var t=pday(day);t.setDate(t.getDate()+n);return lday(t);}
function dow(day){return(pday(day).getDay()+6)%7;}
function plannedOn(day,d){
  d=d||gd();var sc=d.schedule||{},w=(sc.week||{})[DAYS[dow(day)]],out=w?[w]:[],mv=vals(sc.moves);
  // Arrivals before departures, so a workout moved on again (Mon → Tue → Wed) is left only on its last day
  mv.forEach(function(m){if(m.to===day&&out.indexOf(m.workout)<0)out.push(m.workout);});
  mv.forEach(function(m){var i=m.from===day?out.indexOf(m.workout):-1;if(i>=0)out.splice(i,1);});
  return out;
}
// A day counts as done for a workout when a session of it was logged on that local day
function isDone(day,workout,d){d=d||gd();return d.sessions.some(function(s){return s.workout===workout&&lday(s.date)===day;});}
// Planned but not logged that day. Days before the first logged session never count: nothing was being tracked yet.
function missedOn(day,d){
  d=d||gd();var f=null;d.sessions.forEach(function(s){var x=lday(s.date);if(!f||x<f)f=x;});
  return f&&day>=f?plannedOn(day,d).filter(function(w){return!isDone(day,w,d);}):[];
}
// Missed days in the last n days (before today) that still need doing, oldest first: [{day, workout}]. A moved day is
// no longer planned there, and a later session of the same workout makes the day up, so there's nothing left to move.
function missedDays(n,d,today){
  d=d||gd();today=today||lday(new Date());var out=[];
  for(var i=n;i>=1;i--){var day=addD(today,-i);missedOn(day,d).forEach(function(w){
    if(!d.sessions.some(function(s){var x=lday(s.date);return s.workout===w&&x>day&&x<=today;}))out.push({day:day,workout:w});});}
  return out;
}
// What the old Progress heatmap showed for a day: per session, how many exercises went up or down against the previous
// session of the same workout (top kg or volume)
function dayLog(day,d){
  d=d||gd();var ss=d.sessions.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);}),out=[];
  var vol=function(l){return l.reduce(function(a,x){return a+(+x.kg||0)*(+x.reps||0);},0);},top=function(l){return Math.max.apply(null,l.map(function(x){return +x.kg||0;}));};
  ss.forEach(function(s,i){if(lday(s.date)!==day)return;var pv=null;for(var j=i-1;j>=0;j--)if(ss[j].workout===s.workout){pv=ss[j];break;}
    var r={workout:s.workout,first:!pv,up:0,down:0,same:0};
    if(pv)Object.keys(s.exercises||{}).forEach(function(x){var a=s.exercises[x],b=pv.exercises[x];if(!b)return;
      if(top(a)>top(b)||vol(a)>vol(b))r.up++;else if(top(a)<top(b)||vol(a)<vol(b))r.down++;else r.same++;});
    out.push(r);});
  return out;
}
// A colour per saved workout, by its place in your list (so a rename keeps it); anything else is grey
function wColor(name,w){var i=Object.keys(w||gw()).indexOf(name);return i<0?'var(--t3)':'var(--w'+(i%8+1)+')';}
function dname(day,today){today=today||lday(new Date());var k=[addD(today,-1),today,addD(today,1)].indexOf(day);
  return k>=0?['yesterday','today','tomorrow'][k]:Math.abs(pday(day)-pday(today))<6.5*864e5?DAYL[dow(day)]:fds(pday(day));}

// ═══════ UI ═══════
// SCM: calendar month offset. TDAY: the day the Today views were drawn for. SDRAG: a week-plan drag is in progress.
var SCM=0,TDAY=null,SSRT=null,SDRAG=false;
function schOpen(){return document.getElementById('sch').classList.contains('active');}
function openSched(){SCM=0;rSched(gd());var s=document.getElementById('sch');s.classList.add('active');s.scrollTop=0;}
function closeSched(){document.getElementById('sch').classList.remove('active');}
// Redraws every Today view: the home card, and the sheet when it's open. keepWeek leaves the week list as a drag left it.
function rToday(keepWeek){var d=gd();TDAY=lday(new Date());document.getElementById('today-sec').innerHTML=todayHTML(d,true);if(schOpen()&&!SDRAG)rSched(d,keepWeek);}
function rSched(d,keepWeek){document.getElementById('sch-td').innerHTML=todayHTML(d);if(!keepWeek)rWeek(d);rCal(d);}

function tdRow(n,sub,btn,w){return'<div class="td-r"><i class="td-bar" style="background:'+wColor(n,w)+'"></i><div class="td-m"><div class="td-n">'+eh(n)+'</div><div class="td-s">'+sub+'</div></div>'+btn+'</div>';}
function undoB(m){return'<button class="td-u" data-act="undo" data-id="'+ea(m.id)+'">Undo</button>';}
function todayHTML(d,home){
  var today=lday(new Date()),tm=addD(today,1),w=gw(),dr=gDri(),pl=plannedOn(today,d),mv=vals((d.schedule||{}).moves),wk=(d.schedule||{}).week||{},done=[];
  d.sessions.forEach(function(s){if(lday(s.date)===today&&done.indexOf(s.workout)<0)done.push(s.workout);});
  var h='<div class="hsec td"><div class="hsec-t">Today · '+fdf(new Date())+(home?'<button class="td-lnk" data-act="open">Schedule ›</button>':'')+'</div>';
  pl.concat(done.filter(function(x){return pl.indexOf(x)<0;})).forEach(function(n){
    var ok=done.indexOf(n)>=0,m=null;mv.forEach(function(x){if(x.to===today&&x.from<today&&x.workout===n)m=x;});
    var sub=ok?'Done':m?'Moved from '+dname(m.from,today)+' · '+undoB(m):w[n]?w[n].length+' exercise'+(w[n].length!==1?'s':''):'No longer one of your workouts';
    var btn=ok?'<span class="td-ok">✓</span>':w[n]?'<button class="td-go" data-act="go" data-w="'+ea(n)+'">'+(dr&&dr.workout===n?'Continue':'Start')+'</button>':'';
    h+=tdRow(n,sub,btn,w);
  });
  if(!pl.length&&!done.length){var hp=DAYS.some(function(k){return wk[k];});
    h+='<div class="td-rest">'+(hp?'Rest day':'No weekly plan yet')+'</div>'+(hp?'':home?'<button class="mbtn sec td-plan" data-act="open">Plan your week</button>':'<div class="td-s">Tap a day below to plan it.</div>');}
  var ms=missedDays(3,d,today);
  if(ms.length){h+='<div class="td-h">Missed</div>';ms.forEach(function(x){var a=' data-from="'+x.day+'" data-w="'+ea(x.workout)+'"';
    h+=tdRow(x.workout,'<span class="td-miss">Missed</span> · planned '+dname(x.day,today),'',w)+'<div class="td-mv"><button class="mbtn sec" data-act="mv" data-to="'+today+'"'+a+'>Do it today</button><button class="mbtn sec" data-act="mv" data-to="'+tm+'"'+a+'>Tomorrow</button></div>';});}
  var tms=mv.filter(function(x){return x.to===tm&&x.from<today;});
  if(tms.length){h+='<div class="td-h">Tomorrow</div>';tms.forEach(function(x){h+=tdRow(x.workout,'Moved from '+dname(x.from,today)+' · '+undoB(x),'',w);});}
  return h+'</div>';
}

// Week plan: tap a day to pick a workout or Rest; drag ⠿ to swap two days. The day labels stay put and only the
// workouts move, so after a drag the list order is the new plan.
function rWeek(d){
  var wk=(d.schedule||{}).week||{},w=gw(),td=dow(lday(new Date())),h='<div class="hsec"><div class="hsec-t">Week plan<span class="hsec-n">Tap to change · drag ⠿ to swap</span></div><div class="wp"><div class="wp-d">';
  DAYS.forEach(function(k,i){h+='<div'+(i===td?' class="tdy"':'')+'>'+k+'</div>';});
  h+='</div><div class="wp-l" id="wp-l">';
  DAYS.forEach(function(k){var v=wk[k]||'';h+='<div class="wp-p'+(v?'':' rest')+'" data-day="'+k+'" data-w="'+ea(v)+'"><button class="wp-b" data-act="pick"><i class="wp-dot"'+(v?' style="background:'+wColor(v,w)+'"':'')+'></i><span>'+(v?eh(v):'Rest')+'</span></button><span class="wp-h" aria-label="Drag to swap">⠿</span></div>';});
  if(SSRT){SSRT.destroy();SSRT=null;}
  document.getElementById('sch-wp').innerHTML=h+'</div></div></div>';
  var el=document.getElementById('wp-l');
  // The cdnjs build of SortableJS includes the Swap plugin
  if(window.Sortable)SSRT=Sortable.create(el,{swap:true,swapClass:'wp-sw',handle:'.wp-h',animation:150,forceFallback:true,fallbackOnBody:true,fallbackTolerance:3,ghostClass:'wp-gh',
    onStart:function(){SDRAG=true;},
    onEnd:function(){SDRAG=false;var sp={},old=gSplit(),ch=false;
      [].forEach.call(el.children,function(p,i){p.dataset.day=DAYS[i];sp[DAYS[i]]=p.dataset.w;if((old[DAYS[i]]||'')!==p.dataset.w)ch=true;});
      if(ch){sSplit(sp);rToday(true);toast('Days swapped');}}});
}
function pickDay(k){
  var w=gw(),sp=gSplit(),o=document.getElementById('sd-opts'),h='<div class="sd-l">';
  document.getElementById('sd-title').textContent=DAYL[DAYS.indexOf(k)];
  [''].concat(Object.keys(w)).forEach(function(n){h+='<button class="mbtn '+((sp[k]||'')===n?'pri':'sec')+' jsd" data-v="'+ea(n)+'">'+(n?'<i class="wp-dot" style="background:'+wColor(n,w)+'"></i>'+eh(n):'Rest')+'</button>';});
  o.innerHTML=h+'</div>';document.getElementById('mov-splitday').classList.add('active');
  o.querySelectorAll('.jsd').forEach(function(b){b.addEventListener('click',function(){sp[k]=b.dataset.v;sSplit(sp);document.getElementById('mov-splitday').classList.remove('active');rToday();});});
}

// Month calendar: done days filled with the workout's colour, upcoming planned days outlined, missed planned days
// with a red dot, core days marked C
function rCal(d){
  var t=new Date(),today=lday(t),vd=new Date(t.getFullYear(),t.getMonth()+SCM,1),yr=vd.getFullYear(),mo=vd.getMonth(),w=gw();
  var dim=new Date(yr,mo+1,0).getDate(),by={},nd=0,nm=0,c='';
  d.sessions.forEach(function(s){var k=lday(s.date);by[k]=by[k]||[];if(by[k].indexOf(s.workout)<0)by[k].push(s.workout);});
  for(var i=(vd.getDay()+6)%7;i>0;i--)c+='<div></div>';
  for(var dd=1;dd<=dim;dd++){
    var day=lday(new Date(yr,mo,dd)),dn=by[day]||[],pl=day>=today?plannedOn(day,d).filter(function(x){return dn.indexOf(x)<0;}):[],ms=day<today&&missedOn(day,d).length,st='';
    // Two workouts on one day split the cell diagonally
    if(dn.length){nd++;st='background:'+(dn.length>1?'linear-gradient(135deg,'+dn.map(function(x,j){return wColor(x,w)+' '+Math.round(j*100/dn.length)+'% '+Math.round((j+1)*100/dn.length)+'%';}).join(',')+')':wColor(dn[0],w));}
    else if(pl.length)st='border-color:'+wColor(pl[0],w);
    if(ms)nm++;
    c+='<button class="cal-c'+(dn.length?' done':pl.length?' plan':'')+(day===today?' today':'')+(day>today?' fut':'')+'" data-act="cal" data-day="'+day+'"'+(st?' style="'+st+'"':'')+'>'+dd+(ms?'<i class="cal-m"></i>':'')+(coreDone(day,d.core)?'<i class="cal-k">C</i>':'')+'</button>';
  }
  var lg='';Object.keys(w).forEach(function(n){lg+='<span><i style="background:'+wColor(n,w)+'"></i>'+eh(n)+'</span>';});
  lg+='<span><i class="o"></i>Planned</span><span><i class="m"></i>Missed</span><span><b>C</b>Core</span>';
  document.getElementById('sch-cal').innerHTML='<div class="hsec"><div class="hsec-t">Calendar<span class="hsec-n">'+nd+' workout day'+(nd!==1?'s':'')+(nm?' · '+nm+' missed':'')+'</span></div>'+
    '<div class="cal-nav"><button class="cal-nb" data-act="mp" aria-label="Previous month">‹</button><div class="cal-t">'+vd.toLocaleString('en',{month:'long',year:'numeric'})+'</div><button class="cal-nb" data-act="mn" aria-label="Next month">›</button></div>'+
    '<div class="cal-dh"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div><div class="cal-g">'+c+'</div><div class="cal-leg">'+lg+'</div></div>';
}
// A day's details in the pop-up; on a past day with nothing logged, buttons to log it
function openDay(day){
  var d=gd(),today=lday(new Date()),w=gw(),lg=dayLog(day,d),pl=plannedOn(day,d),mv=vals((d.schedule||{}).moves),ws=[],h='';
  lg.forEach(function(r){if(ws.indexOf(r.workout)<0)ws.push(r.workout);});
  document.getElementById('hp-date').textContent=pday(day).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})+(day.slice(0,4)!==today.slice(0,4)?' '+day.slice(0,4):'');
  document.getElementById('hp-wk').textContent=ws.length?ws.join(', '):day>today?(pl.length?pl.join(', '):'Rest day'):'Nothing logged';
  lg.forEach(function(r){h+='<div>'+(lg.length>1?eh(r.workout)+': ':'')+(r.first?'First session logged':'↑ '+r.up+' improved · ↓ '+r.down+' declined'+(r.same?' · = '+r.same+' same':''))+'</div>';});
  if(day>today){if(pl.length)h+='<div class="dp-s">Planned</div>';}
  else missedOn(day,d).forEach(function(x){h+='<div class="'+(day<today?'dp-miss':'dp-s')+'">'+eh(x)+(day<today?' was planned · missed':' is planned today')+'</div>';});
  mv.forEach(function(m){if(m.from===day&&m.to!==day)h+='<div class="dp-s">'+eh(m.workout)+' moved to '+dname(m.to,today)+'</div>';else if(m.to===day&&m.from!==day)h+='<div class="dp-s">'+eh(m.workout)+' moved here from '+dname(m.from,today)+'</div>';});
  if(coreDone(day,d.core))h+='<div class="dp-core">✓ Core trained</div>';
  if(day<=today&&!lg.length){var ns=pl.filter(function(x){return w[x];});Object.keys(w).forEach(function(n){if(ns.indexOf(n)<0)ns.push(n);});
    h+='<div class="dp-acts"><div class="dp-s">'+(day===today?'Start a workout':'Log a workout for this day')+'</div>';
    ns.forEach(function(n){h+='<button class="mbtn '+(pl.indexOf(n)>=0?'pri':'sec')+'" data-act="log" data-day="'+day+'" data-w="'+ea(n)+'"><i class="wp-dot" style="background:'+wColor(n,w)+'"></i>'+eh(n)+'</button>';});
    h+='</div>';}
  document.getElementById('hp-det').innerHTML=h;
  document.getElementById('hmpop-ov').classList.add('active');
}
// One click handler for the home card, the sheet and the day pop-up (buttons carry data-act)
function schClick(e){
  var b=e.target.closest('[data-act]');if(!b)return;var a=b.dataset.act,x=b.dataset,today=lday(new Date());
  if(a==='open')openSched();
  else if(a==='go'){closeSched();openWK(x.w);}
  else if(a==='mv'){addMove(x.from,x.to,x.w);rToday();toast(x.w+' moved to '+dname(x.to,today));}
  else if(a==='undo'){delMove(x.id);rToday();toast('Move undone');}
  else if(a==='pick')pickDay(b.closest('.wp-p').dataset.day);
  else if(a==='mp'||a==='mn'){SCM+=a==='mp'?-1:1;rCal(gd());}
  else if(a==='cal')openDay(x.day);
  else if(a==='log'){document.getElementById('hmpop-ov').classList.remove('active');closeSched();if(x.day===today)openWK(x.w);else openWK(x.w,null,null,x.day);}
}
