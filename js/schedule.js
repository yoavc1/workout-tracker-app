// Workout Tracker — Schedule: the Today card, weekly plan, your workouts, month calendar and moving a missed day
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
// The first day a planned day can count as missed. Only the current plan is stored, so it only judges days since it
// was last set (wkm). A plan adopted from the old device-only storage (wkm 1) has no real date: it counts from the
// first logged session, but no further back than 28 days. null when nothing has been logged yet.
function planFrom(d,today){
  d=d||gd();today=today||lday(new Date());var f=null,w=(d.schedule||{}).wkm||0;
  d.sessions.forEach(function(s){var x=lday(s.date);if(!f||x<f)f=x;});if(!f)return null;
  var p=w>1?lday(w):addD(today,-28);return p>f?p:f;
}
// Planned but not logged that day, from planFrom on. Earlier days were planned under a plan we no longer know.
function missedOn(day,d,today){
  d=d||gd();var f=planFrom(d,today);
  return f&&day>=f?plannedOn(day,d).filter(function(w){return!isDone(day,w,d);}):[];
}
// Missed days in the last n days (before today) that still need doing, oldest first: [{day, workout}]. A moved day is
// no longer planned there, and a later session of the same workout makes the day up, so there's nothing left to move.
function missedDays(n,d,today){
  d=d||gd();today=today||lday(new Date());var out=[];
  for(var i=n;i>=1;i--){var day=addD(today,-i);missedOn(day,d,today).forEach(function(w){
    if(!d.sessions.some(function(s){var x=lday(s.date);return s.workout===w&&x>day&&x<=today;}))out.push({day:day,workout:w});});}
  return out;
}
// What the old Progress heatmap showed for a day: per session, how many exercises went up or down against the previous
// session of the same workout (top kg or volume, reps for bodyweight: exCmp in js/stats.js)
function dayLog(day,d){
  d=d||gd();var ss=d.sessions.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);}),out=[];
  ss.forEach(function(s,i){if(lday(s.date)!==day)return;var pv=null;for(var j=i-1;j>=0;j--)if(ss[j].workout===s.workout){pv=ss[j];break;}
    var r={workout:s.workout,first:!pv,up:0,down:0,same:0};
    if(pv)Object.keys(s.exercises||{}).forEach(function(x){var b=pv.exercises[x];if(!b)return;var c=exCmp(s.exercises[x],b);if(c>0)r.up++;else if(c<0)r.down++;else r.same++;});
    out.push(r);});
  return out;
}
// A colour per saved workout, by its place in your list (so a rename keeps it); anything else is grey
function wColor(name,w){var i=Object.keys(w||gw()).indexOf(name);return i<0?'var(--t3)':'var(--w'+(i%8+1)+')';}
function dname(day,today){today=today||lday(new Date());var k=[addD(today,-1),today,addD(today,1)].indexOf(day);
  return k>=0?['yesterday','today','tomorrow'][k]:Math.abs(pday(day)-pday(today))<6.5*864e5?DAYL[dow(day)]:fds(pday(day));}

// ═══════ UI ═══════
// SCM: the home calendar's month offset, back to this month whenever the Workouts tab opens. TDAY: the day the Today
// views were drawn for. SDRAG: a week-plan drag is in progress.
var SCM=0,TDAY=null,SSRT=null,SDRAG=false;
function schOpen(){return document.getElementById('sch').classList.contains('active');}
function openSched(){rSched(gd());var s=document.getElementById('sch');s.classList.add('active');s.scrollTop=0;}
function closeSched(){document.getElementById('sch').classList.remove('active');}
// Redraws every Today view: the home card and calendar, and the sheet when it's open. keepWeek leaves the week list as
// a drag left it.
function rToday(keepWeek){var d=gd();TDAY=lday(new Date());document.getElementById('today-sec').innerHTML=todayHTML(d,true);rCal(d);if(schOpen()&&!SDRAG)rSched(d,keepWeek);}
function rSched(d,keepWeek){document.getElementById('sch-td').innerHTML=todayHTML(d);if(!keepWeek)rWeek(d);rWkList();}

function tdRow(n,sub,btn,w){return'<div class="td-r"><i class="td-bar" style="background:'+wColor(n,w)+'"></i><div class="td-m"><div class="td-n">'+eh(n)+'</div><div class="td-s">'+sub+'</div></div>'+btn+'</div>';}
function undoB(m){return'<button class="td-u" data-act="undo" data-id="'+ea(m.id)+'">Undo</button>';}
function todayHTML(d,home){
  var today=lday(new Date()),tm=addD(today,1),w=gw(),dr=gDri(),pl=plannedOn(today,d),mv=vals((d.schedule||{}).moves),wk=(d.schedule||{}).week||{},done=[];
  d.sessions.forEach(function(s){if(lday(s.date)===today&&done.indexOf(s.workout)<0)done.push(s.workout);});
  // On home the whole card opens the sheet; its buttons keep their own actions (schClick takes the nearest data-act)
  var h='<div class="hsec td"'+(home?' data-act="open"':'')+'><div class="hsec-t">Today · '+fdf(new Date())+(home?'<button class="td-lnk" data-act="open">Schedule ›</button>':'')+'</div>';
  var rows=pl.concat(done.filter(function(x){return pl.indexOf(x)<0;}));
  rows.forEach(function(n){
    var ok=done.indexOf(n)>=0,m=null;mv.forEach(function(x){if(x.to===today&&x.from<today&&x.workout===n)m=x;});
    var sub=ok?'Done':m?'Moved from '+dname(m.from,today)+' · '+undoB(m):w[n]?w[n].length+' exercise'+(w[n].length!==1?'s':''):'No longer one of your workouts';
    var btn=ok?'<span class="td-ok">✓</span>':w[n]?'<button class="td-go" data-act="go" data-w="'+ea(n)+'">'+(dr&&dr.workout===n?'Continue':'Start')+'</button>':'';
    h+=tdRow(n,sub,btn,w);
  });
  if(!pl.length&&!done.length){var hp=DAYS.some(function(k){return wk[k];});
    h+='<div class="td-rest">'+(hp?'Rest day':'No weekly plan yet')+'</div>'+(hp?'':home?'<button class="mbtn sec td-plan" data-act="open">Plan your week</button>':'<div class="td-s">Tap a day below to plan it.</div>');}
  // An unfinished workout that isn't on today's list still shows here, now that home has no workout list to badge it
  if(dr&&w[dr.workout]&&rows.indexOf(dr.workout)<0)h+='<div class="td-h">Unfinished</div>'+tdRow(dr.workout,'Not finished'+(dr.st?' · started '+dname(lday(new Date(dr.st)),today):''),'<button class="td-go" data-act="go" data-w="'+ea(dr.workout)+'">Continue</button>',w);
  // Missed days and their moves live in the sheet only; home keeps to today
  if(home)return h+'</div>';
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
// My Workouts, under the week plan: tap one to start it (or carry on with its draft); ⚙ renames, adds and removes
// workouts and edits their exercises (showManage in js/home.js)
function rWkList(){
  var w=gw(),dr=gDri(),h='<div class="hsec"><div class="hsec-t">My Workouts<button class="ibtn wl-set" data-act="manage" aria-label="Manage workouts">⚙</button></div><div class="wl">';
  Object.keys(w).forEach(function(n){var c=w[n].length,last=gLast(n);
    h+='<button class="wl-r" data-act="go" data-w="'+ea(n)+'"><i class="wp-dot" style="background:'+wColor(n,w)+'"></i><div class="wl-m"><div class="wl-n">'+eh(n)+(dr&&dr.workout===n?'<span class="draft">DRAFT</span>':'')+'</div><div class="wl-s">'+c+' exercise'+(c!==1?'s':'')+(last?' · Last: '+fds(last.date):'')+'</div></div><span class="wl-go">→</span></button>';});
  if(!Object.keys(w).length)h+='<button class="mbtn sec td-plan" data-act="manage">Add a workout</button>';
  document.getElementById('sch-wk').innerHTML=h+'</div></div>';
}
function pickDay(k){
  var w=gw(),sp=gSplit(),o=document.getElementById('sd-opts'),h='<div class="sd-l">';
  document.getElementById('sd-title').textContent=DAYL[DAYS.indexOf(k)];
  [''].concat(Object.keys(w)).forEach(function(n){h+='<button class="mbtn '+((sp[k]||'')===n?'pri':'sec')+' jsd" data-v="'+ea(n)+'">'+(n?'<i class="wp-dot" style="background:'+wColor(n,w)+'"></i>'+eh(n):'Rest')+'</button>';});
  o.innerHTML=h+'</div>';document.getElementById('mov-splitday').classList.add('active');
  o.querySelectorAll('.jsd').forEach(function(b){b.addEventListener('click',function(){sp[k]=b.dataset.v;sSplit(sp);document.getElementById('mov-splitday').classList.remove('active');rToday();});});
}

// Home calendar, under the Today card: only what was logged. Done days filled with the workout's colour, core days
// marked C; the plan stays in the sheet. It shows a week (the default) or a month; the choice stays on this device
// (ironlog_calview), like the theme. SCM counts weeks or months from today's, whichever is showing.
function calView(){try{return localStorage.getItem('ironlog_calview')==='month'?'month':'week';}catch(e){return'week';}}
function wkMon(day){return addD(day,-dow(day));}
// Switching keeps your place: a week opens the month most of its days are in, a month opens its first week
// (or this week, for this month)
function setCalView(v){
  if(v!=='week'&&v!=='month'||v===calView())return;var today=lday(new Date()),t=pday(today);
  if(v==='month'){var th=pday(addD(wkMon(today),7*SCM+3));SCM=(th.getFullYear()-t.getFullYear())*12+th.getMonth()-t.getMonth();}
  else if(SCM)SCM=Math.round((pday(wkMon(lday(new Date(t.getFullYear(),t.getMonth()+SCM,1))))-pday(wkMon(today)))/(7*864e5));
  try{localStorage.setItem('ironlog_calview',v);}catch(e){}
  rCal(gd());
}
// dir: 'n' or 'p' slides the new week or month in from that side
function rCal(d,dir){
  var t=new Date(),today=lday(t),w=gw(),wk=calView()==='week',by={},nd=0,c='',days=[],title,cnt,lbl=wk?'week':'month';
  d.sessions.forEach(function(s){var k=lday(s.date);by[k]=by[k]||[];if(by[k].indexOf(s.workout)<0)by[k].push(s.workout);});
  if(wk){var mon=addD(wkMon(today),7*SCM);for(var i=0;i<7;i++)days.push(addD(mon,i));
    var a=pday(days[0]),b=pday(days[6]);
    title=(a.getMonth()===b.getMonth()?a.getDate():fds(a))+' – '+fds(b)+(b.getFullYear()!==t.getFullYear()?' '+b.getFullYear():'');}
  else{var vd=new Date(t.getFullYear(),t.getMonth()+SCM,1),dim=new Date(vd.getFullYear(),vd.getMonth()+1,0).getDate();
    for(var k=(vd.getDay()+6)%7;k>0;k--)c+='<div></div>';
    for(var dd=1;dd<=dim;dd++)days.push(lday(new Date(vd.getFullYear(),vd.getMonth(),dd)));
    title=vd.toLocaleString('en',{month:'long',year:'numeric'});}
  days.forEach(function(day){
    var dn=by[day]||[],st='';
    // Two workouts on one day split the cell diagonally
    if(dn.length){nd++;st='background:'+(dn.length>1?'linear-gradient(135deg,'+dn.map(function(x,j){return wColor(x,w)+' '+Math.round(j*100/dn.length)+'% '+Math.round((j+1)*100/dn.length)+'%';}).join(',')+')':wColor(dn[0],w));}
    c+='<button class="cal-c'+(dn.length?' done':'')+(day===today?' today':'')+(day>today?' fut':'')+'" data-act="cal" data-day="'+day+'"'+(st?' style="'+st+'"':'')+'>'+(+day.slice(8))+(coreDone(day,d.core)?'<i class="cal-k">C</i>':'')+'</button>';
  });
  var vb=function(v,l){return'<button class="cal-vb'+((wk?'week':'month')===v?' on':'')+'" data-act="cv" data-v="'+v+'" aria-pressed="'+((wk?'week':'month')===v)+'">'+l+'</button>';};
  var h='<div class="hsec cal"><div class="hsec-t">Calendar<div class="cal-hr">'+(SCM?'<button class="cal-0" data-act="c0">Today</button>':'')+
    '<div class="cal-vs" role="group" aria-label="Calendar view">'+vb('week','Week')+vb('month','Month')+'</div></div></div>';
  if(wk){
    // The week's workouts (and core-only days) under the strip, oldest first; each opens its day like the cell does
    var ls=d.sessions.filter(function(s){return days.indexOf(lday(s.date))>=0;}).sort(function(x,y){return new Date(x.date)-new Date(y.date);});
    var co=typeof coreOnlyDays==='function'?coreOnlyDays(d).filter(function(x){return days.indexOf(x)>=0;}):[],nc=days.filter(function(x){return coreDone(x,d.core);}).length;
    var rows=ls.map(function(s){return{day:lday(s.date),t:new Date(s.date).getTime(),s:s};}).concat(co.map(function(x){return{day:x,t:pday(x).getTime()+43200000};})).sort(function(x,y){return x.t-y.t;});
    cnt=(ls.length?ls.length+' workout'+(ls.length!==1?'s':''):'No workouts')+(nc?' · '+nc+' core':'');
    var l='';rows.forEach(function(r){var s=r.s,dl=fdf(r.day+'T12:00');
      if(!s){l+='<button class="cal-wr" data-act="cal" data-day="'+r.day+'"><i class="td-bar cal-wc"></i><div class="td-m"><div class="cal-wn">Core</div><div class="td-s">'+dl+'</div></div><span class="cal-wg">›</span></button>';return;}
      var ne=Object.keys(s.exercises||{}).length,cw=coreWith(r.day,d).some(function(x){return x.id===s.id;});
      l+='<button class="cal-wr" data-act="cal" data-day="'+r.day+'"><i class="td-bar" style="background:'+wColor(s.workout,w)+'"></i><div class="td-m"><div class="cal-wn">'+eh(s.workout)+(cw?'<span class="cal-wco">+ Core</span>':'')+'</div><div class="td-s">'+dl+' · '+ne+' exercise'+(ne!==1?'s':'')+(s.duration>=60?' · '+fdur(s.duration):'')+'</div></div><span class="cal-wg">›</span></button>';});
    // An empty week already says "No workouts" under its dates; this week also says how to log one
    if(!rows.length)l=SCM===0?'<div class="cal-we">Tap a day to log a workout or core</div>':'';
  }else cnt=nd+' workout day'+(nd!==1?'s':'');
  h+='<div class="cal-nav"><button class="cal-nb" data-act="mp" aria-label="Previous '+lbl+'">‹</button><div class="cal-tw"><div class="cal-t">'+title+'</div><div class="hsec-n">'+cnt+'</div></div><button class="cal-nb" data-act="mn" aria-label="Next '+lbl+'">›</button></div>'+
    '<div class="cal-sw'+(dir?' sl-'+dir:'')+'"><div class="cal-dh"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div><div class="cal-g'+(wk?' cal-wkg':'')+'">'+c+'</div>'+(wk?'<div class="cal-wl">'+l+'</div>':'')+'</div>';
  // The week's list names its workouts; the month needs the colour legend
  if(!wk){h+='<div class="cal-leg">';Object.keys(w).forEach(function(n){h+='<span><i style="background:'+wColor(n,w)+'"></i>'+eh(n)+'</span>';});h+='<span><b>C</b>Core</span></div>';}
  document.getElementById('cal-sec').innerHTML=h+'</div>';
}
// Swiping the calendar sideways turns the week or month: left for the next, right for the previous. Only a clearly
// sideways swipe counts, so scrolling the page never turns it.
function calSwipe(el){var x0=null,y0=0;
  el.addEventListener('touchstart',function(e){var t=e.touches[0];x0=e.touches.length===1&&!e.target.closest('.cal-vs,.cal-0')?t.clientX:null;y0=t.clientY;},{passive:true});
  el.addEventListener('touchend',function(e){if(x0==null)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>=50&&Math.abs(dx)>2*Math.abs(dy)){SCM+=dx<0?1:-1;rCal(gd(),dx<0?'n':'p');}},{passive:true});
}
// A day's details in the pop-up: what was logged, like the calendar; on a day up to today with nothing logged, buttons
// to log it
function openDay(day){
  var d=gd(),today=lday(new Date()),w=gw(),lg=dayLog(day,d),pl=plannedOn(day,d),ws=[],h='';
  lg.forEach(function(r){if(ws.indexOf(r.workout)<0)ws.push(r.workout);});
  document.getElementById('hp-date').textContent=pday(day).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})+(day.slice(0,4)!==today.slice(0,4)?' '+day.slice(0,4):'');
  document.getElementById('hp-wk').textContent=ws.length?ws.join(', '):'Nothing logged';
  lg.forEach(function(r){h+='<div>'+(lg.length>1?eh(r.workout)+': ':'')+(r.first?'First session logged':'↑ '+r.up+' improved · ↓ '+r.down+' declined'+(r.same?' · = '+r.same+' same':''))+'</div>';});
  // Core for any day up to today, rest days included (home has no core chip of its own)
  var cd=coreDone(day,d.core);
  if(day<=today)h+='<button class="dp-cb'+(cd?' on':'')+'" data-act="core" data-day="'+day+'">'+(cd?'✓ Core trained':'Log core')+'<span>'+(cd?'Edit':'Add')+' ›</span></button>';
  if(day<=today&&!lg.length){var ns=pl.filter(function(x){return w[x];});Object.keys(w).forEach(function(n){if(ns.indexOf(n)<0)ns.push(n);});
    h+='<div class="dp-acts"><div class="dp-s">'+(day===today?'Start a workout':'Log a workout for this day')+'</div>';
    ns.forEach(function(n){h+='<button class="mbtn '+(pl.indexOf(n)>=0?'pri':'sec')+'" data-act="log" data-day="'+day+'" data-w="'+ea(n)+'"><i class="wp-dot" style="background:'+wColor(n,w)+'"></i>'+eh(n)+'</button>';});
    h+='</div>';}
  document.getElementById('hp-det').innerHTML=h;
  document.getElementById('hmpop-ov').classList.add('active');
}
// One click handler for the home card and calendar, the sheet (Today, week plan, My Workouts) and the day pop-up
// (buttons carry data-act)
function schClick(e){
  var b=e.target.closest('[data-act]');if(!b)return;var a=b.dataset.act,x=b.dataset,today=lday(new Date());
  if(a==='open')openSched();
  else if(a==='go'){closeSched();openWK(x.w);}
  else if(a==='mv'){addMove(x.from,x.to,x.w);rToday();toast(x.w+' moved to '+dname(x.to,today));}
  else if(a==='undo'){delMove(x.id);rToday();toast('Move undone');}
  else if(a==='pick')pickDay(b.closest('.wp-p').dataset.day);
  else if(a==='mp'||a==='mn'){SCM+=a==='mp'?-1:1;rCal(gd(),a==='mp'?'p':'n');}
  else if(a==='c0'){var bk=SCM>0?'p':'n';SCM=0;rCal(gd(),bk);}
  else if(a==='cv')setCalView(x.v);
  else if(a==='cal')openDay(x.day);
  else if(a==='manage')showManage();
  else if(a==='core'){document.getElementById('hmpop-ov').classList.remove('active');openCore(x.day);}
  else if(a==='log'){document.getElementById('hmpop-ov').classList.remove('active');closeSched();if(x.day===today)openWK(x.w);else openWK(x.w,null,null,x.day);}
}
