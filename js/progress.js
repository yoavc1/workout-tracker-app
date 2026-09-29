// Workout Tracker — Progress screen: heatmap, weight chart, exercise overview
function tcut(r){var n=new Date(),c=null;if(r==='W'){c=new Date(n);c.setDate(c.getDate()-7);}else if(r==='M'){c=new Date(n);c.setMonth(c.getMonth()-1);}else if(r==='3M'){c=new Date(n);c.setMonth(c.getMonth()-3);}else if(r==='6M'){c=new Date(n);c.setMonth(c.getMonth()-6);}return c;}
// ═══════ PROGRESS ═══════
function rProg(){rHMnav();rHM();rPE();rChart();sCT();rOV();sOV();}

function rHMnav(){var n=document.getElementById('hmnav');var vd=new Date(new Date().getFullYear(),new Date().getMonth()+HMO,1);var mn=vd.toLocaleString('en',{month:'long',year:'numeric'});var fw=HMO<0;n.innerHTML='<button class="hmnav-b" id="hm-p">‹</button><div class="hmnav-t">'+mn+'</div><button class="hmnav-b'+(fw?'':' dis')+'" id="hm-n">›</button>';document.getElementById('hm-p').addEventListener('click',function(){HMO--;rHMnav();rHM();});document.getElementById('hm-n').addEventListener('click',function(){if(HMO<0){HMO++;rHMnav();rHM();}});}

function rHM(){
  var c=document.getElementById('hmrow');var ss=gs();var coreM=gd().core;var today=new Date();var tds=today.toDateString();
  var vd=new Date(today.getFullYear(),today.getMonth()+HMO,1);var yr=vd.getFullYear(),mo=vd.getMonth();
  var dim=new Date(yr,mo+1,0).getDate();var sp=(new Date(yr,mo,1).getDay()+6)%7;
  DWM={};DABS={};DPROG={};
  function ev(s){return s.reduce(function(a,x){return a+x.kg*x.reps;},0);}
  function mx(s){return Math.max.apply(null,s.map(function(x){return x.kg;}));}
  // Sort by date for reliable comparison
  var sorted=ss.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  var dc={};
  sorted.forEach(function(s,si){
    var ds=new Date(s.date).toDateString();dc[ds]=(dc[ds]||0)+1;
    if(!DWM[ds])DWM[ds]=[];DWM[ds].push(s.workout);
    if(coreDone(lday(s.date),coreM))DABS[ds]=true;
    // Find previous session of SAME workout type
    var pv=null;for(var j=si-1;j>=0;j--){if(sorted[j].workout===s.workout){pv=sorted[j];break;}}
    if(pv){
      // Only compare shared exercises
      var shared=Object.keys(s.exercises).filter(function(x){return pv.exercises[x];});
      var inc=0,dec2=0,tot=shared.length;
      shared.forEach(function(x){
        var cm=mx(s.exercises[x]),pm=mx(pv.exercises[x]);
        var cv=ev(s.exercises[x]),pvv=ev(pv.exercises[x]);
        if(cm>pm||cv>pvv)inc++;else if(cm<pm||cv<pvv)dec2++;
      });
      var r=tot>0?inc/tot:0;
      DPROG[ds]={status:r>=0.5?'green':r>0?'blue':'red',workout:s.workout,inc:inc,dec:dec2,tot:tot,same:tot-inc-dec2};
    } else {
      // First session of this workout type
      if(!DPROG[ds]) DPROG[ds]={status:'first',workout:s.workout};
    }
  });
  var mg=0;for(var d=1;d<=dim;d++){var ds=new Date(yr,mo,d).toDateString();if(DPROG[ds]&&DPROG[ds].status==='green')mg++;}
  var dh='<div class="hmdh"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div>';
  var cells='';
  for(var p=0;p<sp;p++)cells+='<div class="hmc empty"></div>';
  for(var d=1;d<=dim;d++){
    var date=new Date(yr,mo,d);var ds=date.toDateString();var it=ds===tds;var fu=date>today;var tc=it?' today':'';
    if(fu){cells+='<div class="hmc" style="opacity:0.15"></div>';}
    else{
      var cnt=dc[ds]||0;var pr=DPROG[ds];var hasC=DABS[ds];
      if(!cnt){cells+='<div class="hmc'+tc+'"></div>';}
      else{
        var cls='hmc';
        if(pr){if(pr.status==='green')cls+=' pg';else if(pr.status==='blue')cls+=' pb';else if(pr.status==='red')cls+=' pr';else if(pr.status==='first')cls+=' first';}
        cls+=tc;var cTag=hasC?'<span class="hmc-c">C</span>':'';
        cells+='<div class="'+cls+' clk" data-ds="'+ds+'">'+cTag+'</div>';
      }
    }
  }
  var h='<div class="hmcard"><div style="font-family:var(--ff);font-size:12px;font-weight:600;margin-bottom:2px">Progression</div><div class="hmsub">'+mg+' improved</div>'+dh+'<div class="hmg">'+cells+'</div><div class="hmleg"><div class="hmleg-i"><div class="hmleg-d" style="background:rgba(61,214,140,0.7)"></div>Vol ↑</div><div class="hmleg-i"><div class="hmleg-d" style="background:rgba(91,140,247,0.5)"></div>Some</div><div class="hmleg-i"><div class="hmleg-d" style="background:rgba(239,95,95,0.55)"></div>None</div><div class="hmleg-i"><div class="hmleg-d" style="border:1.5px solid var(--t3)"></div>1st</div><div class="hmleg-i"><span style="font-size:8px;font-weight:800;color:var(--t2)">C</span> Core</div></div></div>';
  c.innerHTML=h;
  c.querySelectorAll('.hmc.clk').forEach(function(cell){cell.addEventListener('click',function(){
    var ds=cell.dataset.ds;var wks=DWM[ds]||[];var hasC=DABS[ds];var pd=DPROG[ds];
    document.getElementById('hp-date').textContent=new Date(ds).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
    document.getElementById('hp-wk').textContent=wks.join(', ');
    var det='';
    if(pd&&pd.status!=='first')det='↑ '+pd.inc+' improved · ↓ '+pd.dec+' declined'+(pd.same>0?' · = '+pd.same+' same':'');
    else det='First session logged';
    var coreHTML=hasC?'<div style="margin-top:8px;color:var(--green);font-size:13px">✓ Core trained</div>':'';
    document.getElementById('hp-det').innerHTML='<div>'+det+'</div>'+coreHTML;
    document.getElementById('hmpop-ov').classList.add('active');
  });});
}

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
