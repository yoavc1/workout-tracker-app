// Workout Tracker — Workout screen: the session's exercise list, sets, drafts, rest timer, finish
// A session starts as a copy of its saved workout (CL). Reordering, adding and removing change only the session, and
// Finish offers to copy the changes back. Sets are keyed by exercise name (CS), so the list can change freely.
// openWK(name) starts today's session; pre/si edit logged session si; day ('YYYY-MM-DD') logs a past day instead.
function openWK(name,pre,si,day){
  var ss=gs(),tpl=(gw()[name]||[]).slice(),dr=pre?null:gDr(name);
  CW=name;ESI=(si!=null&&ss[si])?ss[si].id:null;WDAY=null;OE={};WST=Date.now();
  if(pre){CL=Object.keys(pre);tpl.forEach(function(x){if(CL.indexOf(x)<0)CL.push(x);});
    CS={};CL.forEach(function(x){CS[x]=(pre[x]||[]).map(function(s){var o={kg:String(s.kg),reps:String(s.reps)};if(s.at)o.at=s.at;return o;});});}
  else if(dr){CL=dr.list.slice();CS=dr.sets||{};WDAY=dr.day||null;if(dr.st&&Date.now()-dr.st<6*36e5)WST=dr.st;}
  else{CL=tpl;CS={};WDAY=day||null;}
  CL=CL.filter(function(x,i){return CL.indexOf(x)===i;});CL.forEach(function(x){if(!CS[x])CS[x]=[];});
  // A new session opens on its first exercise, a resumed one on the exercise of its latest set; an edit starts closed
  if(!pre&&CL.length){var lx=CL[0],la=0;CL.forEach(function(x){CS[x].forEach(function(t){if(+t.at>la){la=+t.at;lx=x;}});});OE[lx]=true;}
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('s-wk').classList.add('active');document.getElementById('wk-t').textContent=name;
  document.getElementById('nav-wrap').style.display='none';
  var bb=document.getElementById('bbar');bb.style.display='block';bb.style.visibility='visible';
  document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.remove('active');
  document.getElementById('trow').style.display=ESI!==null||WDAY?'none':'flex';
  var btn=document.getElementById('btn-fin');
  if(ESI!==null){btn.textContent='Update Workout';btn.className='bfin upd';}else{btn.textContent='Finish Workout';btn.className='bfin';}
  rEx();uMeta();uRest();rWkCore();
}
// Elapsed time, or the date when logging a past day. The same tick keeps the rest clock running.
function uMeta(){clearInterval(metaInterval);var e=document.getElementById('wmeta');
  if(WDAY){e.textContent=fds(WDAY+'T12:00');return;}if(!WST)return;
  var t=function(){if(!WST){e.textContent='';clearInterval(metaInterval);return;}var d=Math.floor((Date.now()-WST)/1000);e.textContent=Math.floor(d/60)+'m '+String(d%60).padStart(2,'0')+'s';uRest();};
  t();metaInterval=setInterval(t,1000);}
// ═══════ REST ═══════
// A set logged live gets at: the time it was first complete (kg and reps both filled). It keeps that time when edited,
// so fixing a typo doesn't restart the rest. Editing a logged workout or logging a past day records no times.
function wkLive(){return ESI===null&&!WDAY;}
function setDone(t){return t&&t.kg!==''&&t.reps!==''&&t.kg!=null&&t.reps!=null;}
// The session's complete sets, {name: [sets]}: only these count for the rest clock and the rest column
function doneSets(){var o={};CL.forEach(function(x){o[x]=(CS[x]||[]).filter(setDone);});return o;}
function stamp(t){if(wkLive()&&!t.at&&setDone(t)){t.at=Date.now();uRestCells();uRest();}}
// "Resting 1:23 · last set 14:32" in the bottom bar, counting up from the latest logged set
function uRest(){
  var el=document.getElementById('rest');if(!el)return;var a=setTimes(doneSets()),on=wkLive()&&CW!==null&&a.length>0;
  el.classList.toggle('on',on);if(!on)return;var last=a[a.length-1];
  document.getElementById('rest-t').textContent=fmss((Date.now()-last)/1000);
  document.getElementById('rest-s').textContent='last set '+new Date(last).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
// Each set's rest before it, in its row's Rest column
function uRestCells(){var ds=doneSets();document.querySelectorAll('#elist .ecard').forEach(function(card){var sets=CS[card.dataset.x]||[];
  card.querySelectorAll('.srow').forEach(function(row){var c=row.querySelector('.srest');if(c)c.textContent=restTxt(ds,sets[+row.dataset.si]);});});}
function restTxt(ds,t){var r=t&&setDone(t)?restBefore(ds,t.at):null;return r==null?'':fmss(r/1000);}
// What + Add Set fills in: this session's last set again, or for the first set the first set from last time.
// Nothing to copy (a new exercise) leaves it empty.
function nextSet(en){
  var cur=CS[en]||[],l=cur[cur.length-1];if(l&&(l.kg!==''||l.reps!==''))return{kg:l.kg,reps:l.reps};
  var pd=gLastEx(CW,en,ESI),p=pd&&pd.sets[Math.min(cur.length,pd.sets.length-1)];
  return p?{kg:String(p.kg),reps:String(p.reps)}:{kg:'',reps:''};
}
// ═══════ EXERCISES ═══════
function syncInp(){document.querySelectorAll('#elist .ecard').forEach(function(card){var sets=CS[card.dataset.x];if(!sets)return;card.querySelectorAll('.srow').forEach(function(row){var t=sets[+row.dataset.si];if(!t)return;t.kg=row.querySelector('.jkg').value;t.reps=row.querySelector('.jrp').value;});});}
function autoSave(){if(ESI!==null)return;syncInp();if(drHas(CS))svDr(CW,CL,CS,WST,WDAY);else clDr();}
function cardOf(x){var k=document.getElementById('elist').children;for(var i=0;i<k.length;i++)if(k[i].dataset.x===x)return k[i];return null;}
var ESRT=null;

function rEx(){
  var c=document.getElementById('elist');c.innerHTML='';var ap=gPRs(),ds=doneSets();
  // The Rest column shows in a live session, and when editing a workout that was logged with times
  var rt=wkLive()||setTimes(ds).length>0;
  CL.forEach(function(en){
    var card=document.createElement('div');card.className='ecard';card.dataset.x=en;if(OE[en])card.classList.add('open');
    var sets=CS[en];var sum=sets.length>0?sets.length+' set'+(sets.length!==1?'s':''):'No sets';
    var pd=gLastEx(CW,en,ESI);var ph='';
    if(pd&&pd.sets.length>0){var rows=pd.sets.map(function(s,i){return'<div class="prev-r"><span>Set '+(i+1)+':</span><span>'+s.kg+' kg × '+s.reps+'</span></div>';}).join('');ph='<div class="prev"><div class="prev-t">Previous — '+fds(pd.date)+'</div>'+rows+'</div>';}
    // No PR badge the first time an exercise is ever logged: there's nothing to beat yet
    var cpr=ap[en];var sh='';
    if(sets.length>0){var sr=sets.map(function(s,si){var kv=parseFloat(s.kg)||0;var ip=cpr!=null&&kv>cpr;return'<div class="srow" data-si="'+si+'"><div class="snum">'+(si+1)+'</div><div class="kgw'+(ip?' pr':'')+'"><input type="number" class="sinp jkg" placeholder="kg" value="'+ea(s.kg)+'" inputmode="decimal" step="any"><div class="prb">New PR</div></div><input type="number" class="sinp jrp" placeholder="reps" value="'+ea(s.reps)+'" inputmode="numeric" step="1">'+(rt?'<div class="srest">'+restTxt(ds,s)+'</div>':'')+'<button class="xbtn jrm" data-si="'+si+'">×</button></div>';}).join('');sh='<div class="stbl'+(rt?' rt':'')+'"><div class="stbl-h"><span></span><span>KG</span><span>REPS</span>'+(rt?'<span>REST</span>':'')+'<span></span></div>'+sr+'</div>';}
    card.innerHTML='<div class="ehdr jtog"><div class="edrag jdrag" aria-label="Drag to reorder">⠿</div><div class="ename">'+eh(en)+'</div><div class="esum">'+sum+'</div><div class="echv">▾</div></div><div class="ebody"><div class="ebody-in">'+ph+sh+'<div class="eftr"><button class="addbtn jadd">+ Add Set</button><button class="delbtn jdel">Remove</button></div></div></div>';
    card.querySelector('.jdrag').addEventListener('click',function(e){e.stopPropagation();});
    card.querySelector('.jtog').addEventListener('click',function(){card.classList.toggle('open');OE[en]=card.classList.contains('open');});
    // A filled-in set is logged straight away, so the keyboard stays down; a new exercise's empty set gets the focus
    card.querySelector('.jadd').addEventListener('click',function(){syncInp();var t=nextSet(en);CS[en].push(t);if(wkLive()&&setDone(t))t.at=Date.now();OE[en]=true;rEx();autoSave();
      var c2=cardOf(en),rows=c2?c2.querySelectorAll('.srow'):[],row=rows[rows.length-1];if(!row)return;
      if(setDone(t))row.classList.add('snew');else setTimeout(function(){var k=row.querySelector('.jkg');if(k)k.focus();},60);});
    tap2(card.querySelector('.jdel'),function(){syncInp();CL.splice(CL.indexOf(en),1);delete CS[en];delete OE[en];rEx();autoSave();toast('Removed from this session');});
    card.querySelectorAll('.jrm').forEach(function(b){b.addEventListener('click',function(){syncInp();CS[en].splice(parseInt(b.dataset.si),1);OE[en]=true;rEx();autoSave();});});
    card.querySelectorAll('.jkg').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[en][si]){CS[en][si].kg=inp.value;stamp(CS[en][si]);}autoSave();var v=parseFloat(inp.value)||0;var w=inp.closest('.kgw');if(cpr!=null&&v>cpr)w.classList.add('pr');else w.classList.remove('pr');});});
    card.querySelectorAll('.jrp').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[en][si]){CS[en][si].reps=inp.value;stamp(CS[en][si]);}autoSave();});});
    // Tapping a filled-in number selects it, so typing replaces it rather than adding to it
    card.querySelectorAll('.sinp').forEach(function(inp){inp.addEventListener('focus',function(){setTimeout(function(){try{inp.select();}catch(e){}},0);});});
    c.appendChild(card);
  });
  uRest();
  // One Sortable for the list's lifetime; after a drag the DOM order is the session order
  if(!ESRT&&window.Sortable)ESRT=Sortable.create(c,{handle:'.jdrag',animation:150,forceFallback:true,fallbackTolerance:3,ghostClass:'sghost',
    onEnd:function(){CL=[].map.call(c.children,function(k){return k.dataset.x;});autoSave();}});
}
// Adds an exercise to this session only. A name matching a known one in all but case takes the known spelling,
// so its history stays in one place.
function addEx(n){
  n=(n||'').trim();if(!n){toast('Enter name','var(--orange)');return;}
  var lc=n.toLowerCase(),known=CL.concat(exNames()).filter(function(x){return x.toLowerCase()===lc;})[0];if(known)n=known;
  document.getElementById('mov-ex').classList.remove('active');syncInp();
  if(CL.indexOf(n)<0){CL.push(n);CS[n]=[];toast(n+' added');}else toast(n+' is already in this workout','var(--orange)');
  OE[n]=true;rEx();autoSave();
  setTimeout(function(){var c=cardOf(n);if(c)c.scrollIntoView({behavior:'smooth',block:'center'});},60);
}

// Timer
var RE=0;
function startT(s){RE=Date.now()+s*1000;RS=s;clearInterval(RTI);document.getElementById('tdone').classList.remove('active');document.getElementById('tdisp').classList.add('active');uTD();RTI=setInterval(function(){RS=Math.max(0,Math.ceil((RE-Date.now())/1000));if(RS<=0){clearInterval(RTI);RS=0;document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.add('active');if(navigator.vibrate)navigator.vibrate([200,100,200,100,200]);setTimeout(function(){document.getElementById('tdone').classList.remove('active');},3000);}uTD();},250);}
function uTD(){document.getElementById('ttime').textContent=Math.floor(RS/60)+':'+String(RS%60).padStart(2,'0');}

// Save workout
function finWK(){
  syncInp();var ed={};var hd=false;
  CL.forEach(function(en){var v=CS[en].filter(function(s){return s.kg!==''&&s.reps!=='';});if(v.length>0){ed[en]=v.map(function(s){var o={kg:parseFloat(s.kg)||0,reps:parseInt(s.reps)||0};if(+s.at>0)o.at=+s.at;return o;});hd=true;}});
  if(!hd){toast('Add at least one set','var(--orange)');return;}
  if(ESI!==null){var i=sIdx(ESI);if(i<0){toast('This workout was deleted on another device','var(--red)');goHome();return;}
    var s=gs()[i];updS(i,{id:s.id,workout:CW,date:s.date,exercises:ed,duration:s.duration||0,abs:s.abs||false});toast('Updated!');goHome();return;}
  var ch=tplDiff();if(!ch){saveWK(ed,false);return;}
  askTpl(ch,function(upd){if(upd){var w=gw();w[CW]=CL.slice();sw(w);}saveWK(ed,upd);});
}
function saveWK(ed,upd){
  var dt=(WDAY?new Date(WDAY+'T12:00'):new Date()).toISOString(),dur=!WDAY&&WST?Math.floor((Date.now()-WST)/1000):0;
  // A new workout takes the day's core unless another workout that day already has it
  var day=lday(dt),has=gs().some(function(s){return s.abs&&lday(s.date)===day;});
  var s={workout:CW,date:dt,exercises:ed,duration:dur,abs:coreDone(day)&&!has};addS(s);clDr();
  goHome();showSum(s,upd);
}
// ═══════ FINISH SUMMARY ═══════
// After a new workout is saved: time, sets, volume and average rest, how it went against last time, and any new
// bests. Tapping anywhere closes it.
function showSum(s,upd){
  var d=gd(),ex=s.exercises,ns=0,act=isActivity(s);Object.keys(ex).forEach(function(x){ns+=ex[x].length;});
  var vol=Math.round(Object.keys(ex).reduce(function(a,x){return a+setVol(ex[x]);},0)),ar=avgRest(ex),vs=vsPrev(s,d),pb=act?[]:sessionBests(s,d);
  var tile=function(v,l){return'<div class="sum-t"><b>'+v+'</b><span>'+l+'</span></div>';},h='';
  h+='<div class="sum-e">'+(pb.length?'🏆':'💪')+'</div><div class="sum-h">'+eh(s.workout)+' done</div>';
  h+='<div class="sum-d">'+fdf(s.date)+(upd?' · '+eh(s.workout)+' updated':'')+'</div><div class="sum-g">';
  if(s.duration)h+=tile(Math.max(1,Math.round(s.duration/60))+'<small>min</small>','Time');
  if(!act)h+=tile(ns,'Set'+(ns!==1?'s':''));
  if(vol)h+=tile(vol>=10000?(vol/1000).toFixed(1)+'<small>t</small>':vol.toLocaleString('en-GB')+'<small>kg</small>','Volume');
  if(ar!=null)h+=tile(fmss(ar),'Avg rest');
  h+='</div>';
  if(!vs.first&&(vs.up||vs.down||vs.same))h+='<div class="sum-vs"><span class="sum-k">vs last '+eh(s.workout)+'</span>'+(vs.up?'<span><b class="up">↑ '+vs.up+'</b> improved</span>':'')+(vs.down?'<span><b class="down">↓ '+vs.down+'</b> declined</span>':'')+(vs.same?'<span><b>= '+vs.same+'</b> same</span>':'')+'</div>';
  if(pb.length){h+='<div class="sum-k sum-pk">New best'+(pb.length!==1?'s':'')+'</div><div class="sum-pb">';
    pb.forEach(function(p){var v=p.kind==='weight'?(p.top?p.top.kg+' kg × '+p.top.reps+' · ':'')+'e1RM '+p.v+' kg':p.kind==='time'?fmss(p.v)+' hold':p.v+' reps';
      var was=p.kind==='weight'?p.prev+' kg':p.kind==='time'?fmss(p.prev):p.prev+' reps';
      h+='<div class="sum-p"><div class="sum-pn">'+eh(p.name)+'</div><div class="sum-pv">'+v+' <span>was '+was+'</span></div></div>';});
    h+='</div>';}
  h+='<button class="mbtn pri sum-x" id="sum-x">Done</button>';
  var m=document.getElementById('mov-sum');document.getElementById('sum-body').innerHTML=h;m.classList.add('active');
}
function closeSum(){document.getElementById('mov-sum').classList.remove('active');}
// How the session's list differs from its saved workout; null when it doesn't, or the workout no longer exists
function tplDiff(){
  var t=gw()[CW];if(!t)return null;
  var add=CL.filter(function(x){return t.indexOf(x)<0;}),rem=t.filter(function(x){return CL.indexOf(x)<0;});
  var ord=CL.filter(function(x){return t.indexOf(x)>=0;}).join('\n')!==t.filter(function(x){return CL.indexOf(x)>=0;}).join('\n');
  return add.length||rem.length||ord?{add:add,rem:rem,ord:ord}:null;
}
// "Also update Legs?" with the changes listed; cb(true) copies the session's list into the saved workout
function askTpl(ch,cb){
  var m=document.getElementById('mov-upd'),h='',ls=function(l){return l.map(function(x){return eh(x);}).join(', ');};
  if(ch.add.length)h+='<div class="upd-k">Added</div><div class="upd-v">'+ls(ch.add)+'</div>';
  if(ch.rem.length)h+='<div class="upd-k">Removed</div><div class="upd-v">'+ls(ch.rem)+'</div>';
  if(ch.ord)h+='<div class="upd-k">New order</div><ol class="upd-v upd-ol">'+CL.map(function(x){return'<li>'+eh(x)+'</li>';}).join('')+'</ol>';
  document.getElementById('upd-t').textContent='Also update '+CW+'?';document.getElementById('upd-body').innerHTML=h;m.classList.add('active');
  document.getElementById('upd-yes').onclick=function(){m.classList.remove('active');cb(true);};
  document.getElementById('upd-no').onclick=function(){m.classList.remove('active');cb(false);};
}
