// Workout Tracker — History screen
// ═══════ HISTORY ═══════
function gwk(ds){var d=new Date(ds);var dy=d.getDay(),df=d.getDate()-dy+(dy===0?-6:1);var m=new Date(d);m.setDate(df);return m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0')+'-'+String(m.getDate()).padStart(2,'0');}
function fwr(ms){var p=ms.split('-');var m=new Date(p[0],p[1]-1,p[2]);var s=new Date(m);s.setDate(s.getDate()+6);return m.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' – '+s.toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
var editDateId=null;
function rHist(){
  var c=document.getElementById('hlist');var d=gd(),ss=d.sessions,coreM=d.core,co=coreOnlyDays(d);
  if(!ss.length&&!co.length){c.innerHTML='<div class="empty"><h3>No workouts yet</h3><p>Complete a workout first.</p></div>';return;}
  // Weeks you had open stay open when the list redraws (e.g. after editing a day's core)
  var op={};c.querySelectorAll('.hwg.open').forEach(function(g){op[g.dataset.k]=1;});
  c.innerHTML='';var wgs=[],wm={};
  // Days with core but no workout get a small card of their own in their week
  var its=ss.map(function(s,i){return{s:s,idx:i,t:new Date(s.date)};}).concat(co.map(function(day){return{core:day,t:new Date(day+'T12:00')};}));
  its.sort(function(a,b){return b.t-a.t;}).forEach(function(it){var wk=gwk(it.t);if(!wm[wk]){wm[wk]={key:wk,items:[]};wgs.push(wm[wk]);}wm[wk].items.push(it);});
  wgs.forEach(function(g,gi){
    var el=document.createElement('div');el.className='hwg'+(gi===0||op[g.key]?' open':'');el.dataset.k=g.key;
    var nw=g.items.filter(function(it){return it.s;}).length,cd={};g.items.forEach(function(it){var day=it.core||lday(it.s.date);if(coreDone(day,coreM))cd[day]=1;});var nc=Object.keys(cd).length;
    var cnt=[];if(nw)cnt.push(nw+' workout'+(nw!==1?'s':''));if(nc)cnt.push(nc+' core');
    var hdr='<div class="hwh"><div><span class="hwt">'+fwr(g.key)+'</span><span class="hwc">'+cnt.join(' · ')+'</span></div><span class="hwchv">▾</span></div>';
    var body='<div class="hwb"><div class="hwb-in">';
    g.items.forEach(function(item){
      if(item.core){body+='<div class="hco jhc" data-day="'+item.core+'">'+coreTickB(item.core,true)+'<div class="hco-m"><div><span class="hco-t">Core</span><span class="hcard-date">'+fdf(item.core+'T12:00')+'</span></div><div class="hco-s">'+(eh(coreSum(coreItems(item.core,coreM)))||'Done · tap to add exercises')+'</div></div><span class="hco-go">→</span></div>';return;}
      var s=item.s;var idx=item.idx;var sday=lday(s.date);var ee=Object.entries(s.exercises);var ts=ee.reduce(function(a,e){return a+e[1].length;},0);
      var bd=ee.map(function(e){return'<div><strong>'+eh(e[0])+':</strong> '+e[1].map(function(x){return x.kg+'kg×'+x.reps;}).join(', ')+'</div>';}).join('');
      var dur=s.duration?' · '+fdur(s.duration):'';var day=fdf(s.date);
      // Core is one record per day, yet every workout card shows it, so it's there whichever card of a two-workout day
      // you look at; the day's rows all show the same record and flip together
      var cl=coreLine(sday,coreM);
      body+='<div class="hcard"><div class="hcard-top"><div><span class="hcard-name">'+eh(s.workout)+'</span><span class="hcard-date">'+day+'</span></div><div class="hcard-acts"><button class="hcard-btn jdt" data-i="'+idx+'">📅</button><button class="hcard-btn je" data-i="'+idx+'">Edit</button><button class="hcard-btn jd" data-i="'+idx+'">Delete</button></div></div><div class="hcard-stats">'+ee.length+' exercise'+(ee.length!==1?'s':'')+' · '+ts+' sets'+dur+'</div><div class="hcard-ex">'+bd+'</div>'+cl+'</div>';
    });
    body+='</div></div>';el.innerHTML=hdr+body;
    el.querySelector('.hwh').addEventListener('click',function(){el.classList.toggle('open');});
    el.querySelectorAll('.je').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var i=parseInt(b.dataset.i);var s=gs()[i];if(s)openWK(s.workout,s.exercises,i);});});
    el.querySelectorAll('.jd').forEach(function(b){tap2(b,function(){delS(parseInt(b.dataset.i));rHist();toast('Deleted','var(--red)');});});
    el.querySelectorAll('.jhc').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openCore(b.dataset.day);});});
    // Unticking a rest day's card makes the card go away, so it asks for a second tap like a day with sets does
    el.querySelectorAll('.jhct').forEach(function(b){var day=b.dataset.day;bindTick(b,day,coreDone(day,coreM),!!coreSum(coreItems(day,coreM))||!!b.closest('.hco'),rHist);});
    el.querySelectorAll('.jdt').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var s=gs()[parseInt(b.dataset.i)];editDateId=s.id;document.getElementById('date-inp').value=lday(s.date);document.getElementById('mov-date').classList.add('active');});});
    c.appendChild(el);
  });
  CPOP=null; // the tick's pop plays once, on every card of the day just ticked
}
