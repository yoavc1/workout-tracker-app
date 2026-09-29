// Workout Tracker — Progress screen: weight chart, exercise overview (the calendar lives in the Schedule sheet)
function tcut(r){var n=new Date(),c=null;if(r==='W'){c=new Date(n);c.setDate(c.getDate()-7);}else if(r==='M'){c=new Date(n);c.setMonth(c.getMonth()-1);}else if(r==='3M'){c=new Date(n);c.setMonth(c.getMonth()-3);}else if(r==='6M'){c=new Date(n);c.setMonth(c.getMonth()-6);}return c;}
// ═══════ PROGRESS ═══════
function rProg(){rPE();rChart();sCT();rOV();sOV();if(typeof rCoreProg==='function')rCoreProg(document.getElementById('prog-core'));}

function rPE(){var sel=document.getElementById('csel');var ss=gs();var ex={};ss.forEach(function(s){Object.keys(s.exercises).forEach(function(e){ex[e]=true;});});var pv=sel.value;sel.innerHTML='';var n=Object.keys(ex).sort();if(!n.length){var o=document.createElement('option');o.textContent='No data yet';o.disabled=true;o.selected=true;sel.appendChild(o);return;}n.forEach(function(e){var o=document.createElement('option');o.value=e;o.textContent=e;if(e===pv)o.selected=true;sel.appendChild(o);});}
var ctBound=false,ovBound=false;
function sCT(){if(ctBound)return;ctBound=true;document.getElementById('cttog').querySelectorAll('.ctbtn').forEach(function(b){b.addEventListener('click',function(){document.getElementById('cttog').querySelectorAll('.ctbtn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');CTR=b.dataset.range;rChart();});});}

function rChart(){
  var sel=document.getElementById('csel');var xn=sel.value;var cc=document.getElementById('ccont');
  if(!xn||(sel.selectedOptions[0]&&sel.selectedOptions[0].disabled)){cc.innerHTML='<div class="cempty">No data yet.</div>';return;}
  var ss=gs(),all=[];ss.forEach(function(s){if(s.exercises[xn])all.push({date:new Date(s.date),sets:s.exercises[xn]});});
  if(!all.length){cc.innerHTML='<div class="cempty">No data for this exercise.</div>';return;}
  var co=tcut(CTR);var fl=co?all.filter(function(s){return s.date>=co;}):all;
  if(!fl.length){cc.innerHTML='<div class="cempty">No data in this range.</div>';return;}
  var dm={};fl.forEach(function(s){var k=s.date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});if(!dm[k])dm[k]={label:k,sets:[]};s.sets.forEach(function(t){dm[k].sets.push(t);});});
  var xs=Object.values(dm);var lb=xs.map(function(s){return s.label;});
  var mw2=xs.map(function(s){return Math.max.apply(null,s.sets.map(function(x){return x.kg;}));});
  var sc=[];xs.forEach(function(s,i){var mx2=mw2[i];var seen={};s.sets.forEach(function(t){if(t.kg<mx2&&!seen[t.kg]){seen[t.kg]=true;sc.push({x:i,y:t.kg});}});});
  // Get all-time PR for this exercise
  var allTimePR=0;
  gs().forEach(function(s){if(s.exercises[xn])s.exercises[xn].forEach(function(t){if(t.kg>allTimePR)allTimePR=t.kg;});});
  var prLine=lb.map(function(){return allTimePR;});
  var il=document.documentElement.getAttribute('data-theme')==='light';
  var gc=il?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.05)';var tc=il?'#6e6e7a':'#9090a0';
  var lc=il?'#4a78e0':'#6ba3ff';var mc=il?'#111':'#fff';var scc=il?'rgba(0,0,0,0.25)':'rgba(255,255,255,0.3)';
  var prc=il?'rgba(240,160,48,0.5)':'rgba(240,160,48,0.4)';
  var aw=[];xs.forEach(function(s){s.sets.forEach(function(t){aw.push(t.kg);});});
  aw.push(allTimePR);
  var yMi=Math.min.apply(null,aw),yMa=Math.max.apply(null,aw),yR=yMa-yMi;
  var yP=yR<10?2:Math.ceil(yR*0.15);var yAMi=Math.max(0,Math.floor(yMi-yP)),yAMa=Math.ceil(yMa+yP);
  var step=yR<=10?1:yR<=30?5:10;
  cc.innerHTML='<canvas id="chart"></canvas>';if(PCI)PCI.destroy();
  PCI=new Chart(document.getElementById('chart').getContext('2d'),{type:'scatter',data:{labels:lb,datasets:[
    {type:'line',label:'PR',data:prLine,borderColor:prc,borderDash:[6,4],borderWidth:2,pointRadius:0,pointHoverRadius:0,fill:false,order:3,hitRadius:0},
    {type:'line',label:'Max',data:mw2,borderColor:lc,backgroundColor:il?'rgba(74,120,224,0.08)':'rgba(107,163,255,0.1)',fill:true,tension:0.35,pointRadius:6,pointBackgroundColor:mc,pointBorderColor:lc,pointBorderWidth:2,pointHoverRadius:10,borderWidth:3,order:1,hitRadius:15},
    {type:'scatter',label:'Set',data:sc,backgroundColor:scc,borderColor:'transparent',pointRadius:4,pointHoverRadius:8,order:2,hitRadius:12}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false,axis:'x'},plugins:{legend:{display:false},tooltip:{filter:function(item){return item.datasetIndex!==0;},callbacks:{title:function(i){return i.length&&i[0].label?i[0].label:'';},label:function(c2){return(c2.datasetIndex===1?'Max: ':'Set: ')+c2.parsed.y+' kg';}}}},scales:{x:{type:'category',labels:lb,title:{display:true,text:'Date',color:tc,font:{size:10,family:'Nunito',weight:'600'}},grid:{color:gc},ticks:{color:tc,font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:6}},y:{min:yAMi,max:yAMa,title:{display:true,text:'Weight',color:tc,font:{size:10,family:'Nunito',weight:'600'}},grid:{color:gc},ticks:{color:tc,font:{size:10},stepSize:step,callback:function(v){return v+' kg';}}}}}});
}

// Exercise Overview
function rOV(){var sel=document.getElementById('ovsel');var wk=gw();var pv=sel.value;sel.innerHTML='';Object.keys(wk).forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;if(n===pv)o.selected=true;sel.appendChild(o);});renderOV();}
function sOV(){if(ovBound)return;ovBound=true;document.getElementById('ovsel').addEventListener('change',renderOV);document.getElementById('ovtog').querySelectorAll('.ctbtn').forEach(function(b){b.addEventListener('click',function(){document.getElementById('ovtog').querySelectorAll('.ctbtn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');OVTR=b.dataset.range;renderOV();});});}
function renderOV(){
  var wn=document.getElementById('ovsel').value;var c=document.getElementById('ovcont');
  if(!wn){c.innerHTML='';return;}
  var ss=gss();
  var co=tcut(OVTR);if(co)ss=ss.filter(function(s){return new Date(s.date)>=co;});
  var wk=gw();var exercises=wk[wn]||[];
  var sessions=ss.filter(function(s){return s.workout===wn;});
  if(sessions.length<1){c.innerHTML='<div class="cempty" style="min-height:80px">No data for '+eh(wn)+' in this range.</div>';return;}
  var first=sessions[0];var last=sessions[sessions.length-1];
  var prev=sessions.length>=2?sessions[sessions.length-2]:null;
  var h='<div class="ov-card">';
  exercises.forEach(function(ex){
    var ls=last.exercises[ex];
    if(!ls){h+='<div class="ov-row"><div class="ov-name">'+eh(ex)+'</div><div class="ov-detail">No data</div><div class="ov-arrow same">—</div></div>';return;}
    var lm=Math.max.apply(null,ls.map(function(s){return s.kg;}));
    var fs=first.exercises[ex];
    // Period trend (first → last in range)
    var periodText='';var periodCls='same';
    if(!fs||sessions.length<2){periodText=lm+' kg (new)';periodCls='same';}
    else{var fm=Math.max.apply(null,fs.map(function(s){return s.kg;}));var pd=lm-fm;periodCls=pd>0?'up':pd<0?'down':'same';periodText=fm+' → '+lm+' kg';}
    // Last session change (prev → last)
    var lastArrow='—';var lastCls='same';
    if(prev&&prev.exercises[ex]){var pm=Math.max.apply(null,prev.exercises[ex].map(function(s){return s.kg;}));var ld=lm-pm;lastArrow=ld>0?'↑':ld<0?'↓':'→';lastCls=ld>0?'up':ld<0?'down':'same';}
    h+='<div class="ov-row"><div class="ov-name">'+eh(ex)+'</div><div class="ov-detail">'+periodText+'</div><div class="ov-arrow '+lastCls+'">'+lastArrow+'</div></div>';
  });
  h+='</div>';c.innerHTML=h;
}
