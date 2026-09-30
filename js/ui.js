// Workout Tracker — Shared UI pieces: exercise names, type-ahead suggestions and the muscle group filter chips
// Every exercise ever logged or saved in a workout, most recently logged first (activities like Muay Thai left out)
function exNames(d){
  d=d||gd();var seen={},out=[];function add(x){if(x&&!seen[x]){seen[x]=1;out.push(x);}}
  d.sessions.slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(s){if(!isActivity(s))Object.keys(s.exercises||{}).forEach(add);});
  var w=d.workouts||DW;Object.keys(w).forEach(function(k){(w[k]||[]).forEach(add);});
  return out;
}
// Muscle group filter chips above a list (Goals, Progress): All with nAll, then each of gg [{group, n}] with its n.
// cur: the group picked ('' = all). The screen binds the clicks: tapping the picked chip again, or All, shows everything.
function mfChips(gg,nAll,cur){
  var chip=function(k,n){return'<button class="gf-c'+(cur===k?' active':'')+'" data-g="'+ea(k)+'" aria-pressed="'+(cur===k)+'">'+(k?eh(k):'All')+'<em>'+n+'</em></button>';};
  return'<div class="gf" role="group" aria-label="Filter by muscle group">'+chip('',nAll)+gg.map(function(x){return chip(x.group,x.n);}).join('')+'</div>';
}
// Suggestions under an input as you type. items() gives the candidates in preferred order; matches at the start of the
// name rank first, then at the start of a word, then anywhere. onPick(name) runs when one is tapped.
function typeahead(inp,items,onPick){
  var box=document.createElement('div');box.className='ta';box.style.display='none';inp.parentNode.insertBefore(box,inp.nextSibling);
  function show(){
    var q=inp.value.trim().toLowerCase();
    var rank=function(x){var l=x.toLowerCase(),i=l.indexOf(q);return i<0?-1:i===0?0:/[^a-z0-9]/.test(l.charAt(i-1))?1:2;};
    var m=items().map(function(x,i){return{x:x,r:q?rank(x):0,i:i};}).filter(function(o){return o.r>=0&&o.x.toLowerCase()!==q;})
      .sort(function(a,b){return a.r-b.r||a.i-b.i;}).slice(0,6);
    box.innerHTML=m.map(function(o){return'<button type="button" class="ta-i" data-v="'+ea(o.x)+'">'+eh(o.x)+'</button>';}).join('');
    box.style.display=m.length?'':'none';
  }
  // Keep focus in the input on desktop, so the list isn't hidden by blur before the click lands
  box.addEventListener('mousedown',function(e){e.preventDefault();});
  box.addEventListener('click',function(e){var b=e.target.closest('.ta-i');if(!b)return;inp.value=b.dataset.v;box.style.display='none';onPick(b.dataset.v);});
  inp.addEventListener('input',show);inp.addEventListener('focus',show);
  inp.addEventListener('blur',function(){setTimeout(function(){box.style.display='none';},200);});
  return{refresh:show,hide:function(){box.style.display='none';}};
}
