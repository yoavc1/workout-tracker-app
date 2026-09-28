// Workout Tracker — Workout screen: exercises, sets, drafts, rest timer, finish
function openWK(name,pre,si){
  CW=name;ESI=(si!==undefined)?si:null;var ex=CEL();CS={};OE={};WST=Date.now();
  if(pre){ex.forEach(function(e,i){CS[i]=pre[e]?pre[e].map(function(s){return{kg:String(s.kg),reps:String(s.reps)};}):[];});}
  else{var dr=gDr(name);if(dr){ex.forEach(function(e,i){CS[i]=dr[i]||[];});}else{ex.forEach(function(e,i){CS[i]=[];});}}
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('s-wk').classList.add('active');document.getElementById('wk-t').textContent=name;
  document.getElementById('nav-wrap').style.display='none';
  var bb=document.getElementById('bbar');bb.style.display='block';bb.style.visibility='visible';
  document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.remove('active');
  document.getElementById('trow').style.display=ESI!==null?'none':'flex';
  var btn=document.getElementById('btn-fin');
  if(ESI!==null){btn.textContent='Update Workout';btn.className='bfin upd';}else{btn.textContent='Finish Workout';btn.className='bfin';}
  rEx();uMeta();
}
function uMeta(){if(!WST)return;clearInterval(metaInterval);var e=document.getElementById('wmeta');metaInterval=setInterval(function(){if(!WST){e.textContent='';clearInterval(metaInterval);return;}var d=Math.floor((Date.now()-WST)/1000);e.textContent=Math.floor(d/60)+'m '+String(d%60).padStart(2,'0')+'s';},1000);}
// ═══════ EXERCISES ═══════
function syncInp(){var c=document.getElementById('elist');c.querySelectorAll('.ecard').forEach(function(card){var ei=parseInt(card.dataset.ei);if(isNaN(ei)||!CS[ei])return;card.querySelectorAll('.srow').forEach(function(row){var si=parseInt(row.dataset.si);if(isNaN(si)||!CS[ei][si])return;var k=row.querySelector('.jkg'),r=row.querySelector('.jrp');if(k)CS[ei][si].kg=k.value;if(r)CS[ei][si].reps=r.value;});});}
function autoSave(){if(ESI!==null)return;syncInp();var h=false;Object.keys(CS).forEach(function(k){var s=CS[k];if(s&&s.length>0)s.forEach(function(x){if(x.kg!==''||x.reps!=='')h=true;});});if(h)svDr(CW,CS);else clDr();}

function rEx(){
  var c=document.getElementById('elist');c.innerHTML='';var ex=CEL();var ap=gPRs();
  ex.forEach(function(en,ei){
    var card=document.createElement('div');card.className='ecard';card.dataset.ei=ei;if(OE[ei])card.classList.add('open');
    var sets=CS[ei]||[];var sum=sets.length>0?sets.length+' set'+(sets.length!==1?'s':''):'No sets';
    var pd=gLastEx(CW,en,ESI);var ph='';
    if(pd&&pd.sets.length>0){var rows=pd.sets.map(function(s,i){return'<div class="prev-r"><span>Set '+(i+1)+':</span><span>'+s.kg+' kg × '+s.reps+'</span></div>';}).join('');ph='<div class="prev"><div class="prev-t">Previous — '+fds(pd.date)+'</div>'+rows+'</div>';}
    var cpr=ap[en]||0;var sh='';
    if(sets.length>0){var sr=sets.map(function(s,si){var kv=parseFloat(s.kg)||0;var ip=kv>0&&kv>cpr;return'<div class="srow" data-si="'+si+'"><div class="snum">'+(si+1)+'</div><div class="kgw'+(ip?' pr':'')+'"><input type="number" class="sinp jkg" placeholder="kg" value="'+ea(s.kg)+'" inputmode="decimal" step="any"><div class="prb">New PR</div></div><input type="number" class="sinp jrp" placeholder="reps" value="'+ea(s.reps)+'" inputmode="numeric" step="1"><button class="xbtn jrm" data-si="'+si+'">×</button></div>';}).join('');sh='<div class="stbl"><div class="stbl-h"><span></span><span>KG</span><span>REPS</span><span></span></div>'+sr+'</div>';}
    var exCount=ex.length;
    var moveButtons='<button class="exbtn jmup" data-ei="'+ei+'"'+(ei===0?' disabled style="opacity:0.3"':'')+'>↑</button><button class="exbtn jmdn" data-ei="'+ei+'"'+(ei===exCount-1?' disabled style="opacity:0.3"':'')+'>↓</button><button class="exbtn jren" data-ei="'+ei+'">✏️</button>';
    card.innerHTML='<div class="ehdr jtog"><div class="ename">'+eh(en)+'</div><div class="esum">'+sum+'</div><div class="echv">▾</div></div><div class="ebody"><div class="ebody-in">'+ph+sh+'<div class="eftr"><button class="addbtn jadd">+ Add Set</button>'+moveButtons+'<button class="delbtn jdel">Remove</button></div></div></div>';
    card.querySelector('.jtog').addEventListener('click',function(){card.classList.toggle('open');OE[ei]=card.classList.contains('open');});
    card.querySelector('.jadd').addEventListener('click',function(){syncInp();if(!CS[ei])CS[ei]=[];CS[ei].push({kg:'',reps:''});OE[ei]=true;rEx();autoSave();setTimeout(function(){var c2=c.querySelector('[data-ei="'+ei+'"]');if(c2){var ins=c2.querySelectorAll('.jkg');if(ins.length)ins[ins.length-1].focus();}},60);});
    tap2(card.querySelector('.jdel'),function(){syncInp();var w=gw();w[CW].splice(ei,1);sw(w);var ns={},no={};for(var i=0;i<w[CW].length;i++){ns[i]=CS[i<ei?i:i+1]||[];no[i]=OE[i<ei?i:i+1]||false;}CS=ns;OE=no;rEx();autoSave();toast('Removed');});
    card.querySelectorAll('.jrm').forEach(function(b){b.addEventListener('click',function(){syncInp();CS[ei].splice(parseInt(b.dataset.si),1);OE[ei]=true;rEx();autoSave();});});
    // Move up
    var mup=card.querySelector('.jmup');if(mup&&ei>0)mup.addEventListener('click',function(ev){ev.stopPropagation();syncInp();var w=gw();var tmp=w[CW][ei];w[CW][ei]=w[CW][ei-1];w[CW][ei-1]=tmp;sw(w);var ts=CS[ei];CS[ei]=CS[ei-1];CS[ei-1]=ts;var to=OE[ei];OE[ei]=OE[ei-1];OE[ei-1]=to;rEx();autoSave();});
    // Move down
    var mdn=card.querySelector('.jmdn');if(mdn&&ei<exCount-1)mdn.addEventListener('click',function(ev){ev.stopPropagation();syncInp();var w=gw();var tmp=w[CW][ei];w[CW][ei]=w[CW][ei+1];w[CW][ei+1]=tmp;sw(w);var ts=CS[ei];CS[ei]=CS[ei+1];CS[ei+1]=ts;var to=OE[ei];OE[ei]=OE[ei+1];OE[ei+1]=to;rEx();autoSave();});
    // Rename
    card.querySelector('.jren').addEventListener('click',function(ev){ev.stopPropagation();var oldName=en;document.getElementById('rename-inp').value=oldName;document.getElementById('mov-rename').classList.add('active');document.getElementById('rename-inp').focus();document.getElementById('rename-save').onclick=function(){var nw=document.getElementById('rename-inp').value.trim();if(!nw){toast('Enter name','var(--orange)');return;}syncInp();var w=gw();w[CW][ei]=nw;sw(w);document.getElementById('mov-rename').classList.remove('active');rEx();toast('Renamed');};});
    card.querySelectorAll('.jkg').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[ei]&&CS[ei][si])CS[ei][si].kg=inp.value;autoSave();var v=parseFloat(inp.value)||0;var w=inp.closest('.kgw');if(v>0&&v>cpr)w.classList.add('pr');else w.classList.remove('pr');});});
    card.querySelectorAll('.jrp').forEach(function(inp){var si=parseInt(inp.closest('.srow').dataset.si);inp.addEventListener('input',function(){if(CS[ei]&&CS[ei][si])CS[ei][si].reps=inp.value;autoSave();});});
    c.appendChild(card);
  });
}

// Timer
var RE=0;
function startT(s){RE=Date.now()+s*1000;RS=s;clearInterval(RTI);document.getElementById('tdone').classList.remove('active');document.getElementById('tdisp').classList.add('active');uTD();RTI=setInterval(function(){RS=Math.max(0,Math.ceil((RE-Date.now())/1000));if(RS<=0){clearInterval(RTI);RS=0;document.getElementById('tdisp').classList.remove('active');document.getElementById('tdone').classList.add('active');if(navigator.vibrate)navigator.vibrate([200,100,200,100,200]);setTimeout(function(){document.getElementById('tdone').classList.remove('active');},3000);}uTD();},250);}
function uTD(){document.getElementById('ttime').textContent=Math.floor(RS/60)+':'+String(RS%60).padStart(2,'0');}

// Save workout
function finWK(){
  syncInp();var ex=CEL();var ed={};var hd=false;
  ex.forEach(function(en,ei){var sets=CS[ei]||[];var v=sets.filter(function(s){return s.kg!==''&&s.reps!=='';});if(v.length>0){ed[en]=v.map(function(s){return{kg:parseFloat(s.kg)||0,reps:parseInt(s.reps)||0};});hd=true;}});
  if(!hd){toast('Add at least one set','var(--orange)');return;}
  var dur=WST?Math.floor((Date.now()-WST)/1000):0;
  if(ESI!==null){var ex2=gs()[ESI];updS(ESI,{id:ex2.id,workout:CW,date:ex2.date,exercises:ed,duration:ex2.duration||0,abs:ex2.abs||false});toast('Updated!');}
  else{addS({workout:CW,date:new Date().toISOString(),exercises:ed,duration:dur,abs:false});clDr();toast('Saved!');}
  goHome();
}
