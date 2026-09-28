// Workout Tracker — History screen
// ═══════ HISTORY ═══════
function gwk(ds){var d=new Date(ds);var dy=d.getDay(),df=d.getDate()-dy+(dy===0?-6:1);var m=new Date(d);m.setDate(df);return m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0')+'-'+String(m.getDate()).padStart(2,'0');}
function fwr(ms){var p=ms.split('-');var m=new Date(p[0],p[1]-1,p[2]);var s=new Date(m);s.setDate(s.getDate()+6);return m.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' – '+s.toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
var editDateId=null;
function rHist(){
  var c=document.getElementById('hlist');var ss=gs();
  if(!ss.length){c.innerHTML='<div class="empty"><h3>No workouts yet</h3><p>Complete a workout first.</p></div>';return;}
  c.innerHTML='';var wgs=[],wm={};
  ss.map(function(s,i){return{s:s,idx:i};}).sort(function(a,b){return new Date(b.s.date)-new Date(a.s.date);}).forEach(function(it){var wk=gwk(it.s.date);if(!wm[wk]){wm[wk]={key:wk,items:[]};wgs.push(wm[wk]);}wm[wk].items.push(it);});
  wgs.forEach(function(g,gi){
    var el=document.createElement('div');el.className='hwg'+(gi===0?' open':'');
    var hdr='<div class="hwh"><div><span class="hwt">'+fwr(g.key)+'</span><span class="hwc">'+g.items.length+' workout'+(g.items.length!==1?'s':'')+'</span></div><span class="hwchv">▾</span></div>';
    var body='<div class="hwb"><div class="hwb-in">';
    g.items.forEach(function(item){var s=item.s;var idx=item.idx;var ee=Object.entries(s.exercises);var ts=ee.reduce(function(a,e){return a+e[1].length;},0);
      var bd=ee.map(function(e){return'<div><strong>'+eh(e[0])+':</strong> '+e[1].map(function(x){return x.kg+'kg×'+x.reps;}).join(', ')+'</div>';}).join('');
      var dur=s.duration?' · '+fdur(s.duration):'';var day=fdf(s.date);
      body+='<div class="hcard"><div class="hcard-top"><div><span class="hcard-name">'+eh(s.workout)+'</span><span class="hcard-date">'+day+'</span></div><div class="hcard-acts"><button class="hcard-btn jdt" data-i="'+idx+'">📅</button><button class="hcard-btn jcore" data-i="'+idx+'" style="'+(s.abs?'color:var(--green)':'')+'">C</button><button class="hcard-btn je" data-i="'+idx+'">Edit</button><button class="hcard-btn jd" data-i="'+idx+'">Delete</button></div></div><div class="hcard-stats">'+ee.length+' exercise'+(ee.length!==1?'s':'')+' · '+ts+' sets'+dur+'</div><div class="hcard-ex">'+bd+'</div>'+(s.abs?'<div class="hcard-core">✓ Core trained</div>':'')+'</div>';
    });
    body+='</div></div>';el.innerHTML=hdr+body;
    el.querySelector('.hwh').addEventListener('click',function(){el.classList.toggle('open');});
    el.querySelectorAll('.je').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var i=parseInt(b.dataset.i);var s=gs()[i];if(s)openWK(s.workout,s.exercises,i);});});
    el.querySelectorAll('.jd').forEach(function(b){tap2(b,function(){delS(parseInt(b.dataset.i));rHist();toast('Deleted','var(--red)');});});
    el.querySelectorAll('.jcore').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var i=parseInt(b.dataset.i);var d=gd();d.sessions[i].abs=!d.sessions[i].abs;d.sessions[i].mt=Date.now();sd(d);rHist();toast(d.sessions[i].abs?'Core added':'Core removed');});});
    el.querySelectorAll('.jdt').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var s=gs()[parseInt(b.dataset.i)];editDateId=s.id;document.getElementById('date-inp').value=new Date(s.date).toISOString().slice(0,10);document.getElementById('mov-date').classList.add('active');});});
    c.appendChild(el);
  });
}
