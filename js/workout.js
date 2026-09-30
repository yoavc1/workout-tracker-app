// Workout Tracker — Workout screen: the session's exercise list, sets, drafts, rest timer, finish
// A session starts as a copy of its saved workout (CL). Reordering, adding and removing change only the session, and
// Finish offers to copy the changes back. Sets are keyed by exercise name (CS), so the list can change freely.
// openWK(name) starts today's session; pre/si edit logged session si; day ('YYYY-MM-DD') logs a past day instead.
function openWK(name,pre,si,day){
  var ss=gs(),tpl=(gw()[name]||[]).slice(),dr=pre?null:gDr(name);
  CW=name;ESI=(si!=null&&ss[si])?ss[si].id:null;WDAY=null;OE={};WST=Date.now();
  if(pre){CL=Object.keys(pre);tpl.forEach(function(x){if(CL.indexOf(x)<0)CL.push(x);});
    CS={};CL.forEach(function(x){CS[x]=(pre[x]||[]).map(function(s){return{kg:String(s.kg),reps:String(s.reps)};});});}
  else if(dr){CL=dr.list.slice();CS=dr.sets||{};WDAY=dr.day||null;if(dr.st&&Date.now()-dr.st<6*36e5)WST=dr.st;}
  else{CL=tpl;CS={};WDAY=day||null;}
  CL=CL.filter(function(x,i){return CL.indexOf(x)===i;});CL.forEach(function(x){if(!CS[x])CS[x]=[];});
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('s-wk').classList.add('active');document.getElementById('wk-t').textContent=name;
  document.getElementById('nav-wrap').style.display='none';
  var bb=document.getElementById('bbar');bb.style.display='block';bb.style.visibility='visible';
  document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.remove('active');
  document.getElementById('trow').style.display=ESI!==null||WDAY?'none':'flex';
  var btn=document.getElementById('btn-fin');
  if(ESI!==null){btn.textContent='Update Workout';btn.className='bfin upd';}else{btn.textContent='Finish Workout';btn.className='bfin';}
  rEx();uMeta();rWkCore();
}
// Elapsed time, or the date when logging a past day
function uMeta(){clearInterval(metaInterval);var e=document.getElementById('wmeta');
  if(WDAY){e.textContent=fds(WDAY+'T12:00');return;}if(!WST)return;
  var t=function(){if(!WST){e.textContent='';clearInterval(metaInterval);return;}var d=Math.floor((Date.now()-WST)/1000);e.textContent=Math.floor(d/60)+'m '+String(d%60).padStart(2,'0')+'s';};
  t();metaInterval=setInterval(t,1000);}
// ═══════ EXERCISES ═══════
function syncInp(){document.querySelectorAll('#elist .ecard').forEach(function(card){var sets=CS[card.dataset.x];if(!sets)return;card.querySelectorAll('.srow').forEach(function(row){var t=sets[+row.dataset.si];if(!t)return;t.kg=row.querySelector('.jkg').value;t.reps=row.querySelector('.jrp').value;});});}
function autoSave(){if(ESI!==null)return;syncInp();if(drHas(CS))svDr(CW,CL,CS,WST,WDAY);else clDr();}
function cardOf(x){var k=document.getElementById('elist').children;for(var i=0;i<k.length;i++)if(k[i].dataset.x===x)return k[i];return null;}
var ESRT=null;

function rEx(){
  var c=document.getElementById('elist');c.innerHTML='';var ap=gPRs();
  CL.forEach(function(en){
    var card=document.createElement('div');card.className='ecard';card.dataset.x=en;if(OE[en])card.classList.add('open');
    var sets=CS[en];var sum=sets.length>0?sets.length+' set'+(sets.length!==1?'s':''):'No sets';
    var pd=gLastEx(CW,en,ESI);var ph='';
    if(pd&&pd.sets.length>0){var rows=pd.sets.map(function(s,i){return'<div class="prev-r"><span>Set '+(i+1)+':</span><span>'+s.kg+' kg × '+s.reps+'</span></div>';}).join('');ph='<div class="prev"><div class="prev-t">Previous — '+fds(pd.date)+'</div>'+rows+'</div>';}
    // No PR badge the first time an exercise is ever logged: there's nothing to beat yet
    var cpr=ap[en];var sh='';
    if(sets.length>0){var sr=sets.map(function(s,si){var kv=parseFloat(s.kg)||0;var ip=cpr!=null&&kv>cpr;return'<div class="srow" data-si="'+si+'"><div class="snum">'+(si+1)+'</div><div class="kgw'+(ip?' pr':'')+'"><input type="number" class="sinp jkg" placeholder="kg" value="'+ea(s.kg)+'" inputmode="decimal" step="any"><div class="prb">New PR</div></div><input type="number" class="sinp jrp" placeholder="reps" value="'+ea(s.reps)+'" inputmode="numeric" step="1"><button class="xbtn jrm" data-si="'+si+'">×</button></div>';}).join('');sh='<div class="stbl"><div class="stbl-h"><span></span><span>KG</span><span>REPS</span><span></span></div>'+sr+'</div>';}
    card.innerHTML='<div class="ehdr jtog"><div class="edrag jdrag" aria-label="Drag to reorder">⠿</div><div class="ename">'+eh(en)+'</div><div class="esum">'+sum+'</div><div class="echv">▾</div></div><div class="ebody"><div class="ebody-in">'+ph+sh+'<div class="eftr"><button class="addbtn jadd">+ Add Set</button><button class="delbtn jdel">Remove</button></div></div></div>';
    card.querySelector('.jdrag').addEventListener('click',function(e){e.stopPropagation();});
    card.querySelector('.jtog').addEventListener('click',function(){card.classList.toggle('open');OE[en]=card.classList.contains('open');});
    card.querySelector('.jadd').addEventListener('click',function(){syncInp();CS[en].push({kg:'',reps:''});OE[en]=true;rEx();autoSave();setTimeout(function(){var c2=cardOf(en);if(c2){var ins=c2.querySelectorAll('.jkg');if(ins.length)ins[ins.length-1].focus();}},60);});
    tap2(card.querySelector('.jdel'),function(){syncInp();CL.splice(CL.indexOf(en),1);delete CS[en];delete OE[en];rEx();autoSave();toast('Removed from this session');});
    card.querySelectorAll('.jrm').forEach(function(b){b.addEventListener('click',function(){syncInp();CS[en].splice(parseInt(b.dataset.si),1);OE[en]=true;rEx();autoSave();});});
    card.querySelectorAll('.jkg').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[en][si])CS[en][si].kg=inp.value;autoSave();var v=parseFloat(inp.value)||0;var w=inp.closest('.kgw');if(cpr!=null&&v>cpr)w.classList.add('pr');else w.classList.remove('pr');});});
    card.querySelectorAll('.jrp').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[en][si])CS[en][si].reps=inp.value;autoSave();});});
    c.appendChild(card);
  });
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
  CL.forEach(function(en){var v=CS[en].filter(function(s){return s.kg!==''&&s.reps!=='';});if(v.length>0){ed[en]=v.map(function(s){return{kg:parseFloat(s.kg)||0,reps:parseInt(s.reps)||0};});hd=true;}});
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
  addS({workout:CW,date:dt,exercises:ed,duration:dur,abs:coreDone(day)&&!has});clDr();toast(upd?'Saved · '+CW+' updated':'Saved!');
  goHome();
}
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
