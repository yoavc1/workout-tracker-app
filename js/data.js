// Workout Tracker — Storage, sessions, drafts, weekly split, shared state and helpers
// ═══════ DATA ═══════
var DW={"Legs":["Seated Machine Leg Curl","Calf Raise - Seated","Seated Machine Leg Extension","Calf Raise - Standing","Bulgarian Split Squats","Romanian Deadlift - Dumbbell","Squat - Dumbbell"],"Upper Pull":["Lat Pulldown Machine (Uni Lateral)","Chest Supported Seated Row (Grip 1)","Chest Supported Seated Row (Grip 2)","Lat Pull Down - Front","Cable Face Pulls","Shrugs - Dumbbell","Hammer Curl - Dumbbell","Faceaway Cable Curl","Bicep Curl - Barbell"],"Upper Push":["Smith Machine Incline Bench Press","Incline Chest Press Machine","Dips","Machine Chest Flys","Triceps Pulldown - Rope","Tricep Extension - Standing - Rope - Pulley Machine","Lateral Shoulder Raise - Dumbbell","Front Shoulder Raise - Dumbbell","Kettlebell Shoulder Raise"]};
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// Every session has a stable id (legacy ones derive it from their date, so all devices agree) and an mt (last-edit time)
function sk(s){return s.id||('m'+(Date.parse(s.date)||0));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
// Synced data (v2): sessions, workouts/wm, schedule {week, wkm, moves}, core {'cYYYY-MM-DD': day record}, goals, muscles/mm, deleted
function lday(d){d=new Date(d);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// Fills in what older data lacks, the same way on every device: session ids from dates, and a core day record
// (mt 0, so any real edit wins) for each day a session was ticked with the old per-session abs flag
function normD(d){
  if(!d||typeof d!=='object')d={};if(!Array.isArray(d.sessions))d.sessions=[];
  if(!d.core||typeof d.core!=='object')d.core={};
  d.sessions.forEach(function(s){if(!s.id)s.id=sk(s);if(s.abs===true){var k='c'+lday(s.date);if(!d.core[k])d.core[k]={id:k,mt:0,date:k.slice(1),done:true,items:[]};}});
  return d;
}
function gd(){var d=null;try{d=JSON.parse(localStorage.getItem('ironlog_data'));}catch(e){}d=normD(d);
  // The weekly plan used to live only on this device; adopt it once with wkm 1 so any synced edit wins
  if(!d.schedule){var ls=null;try{ls=JSON.parse(localStorage.getItem('ironlog_split'));}catch(e){}if(ls&&typeof ls==='object'&&Object.keys(ls).some(function(k){return ls[k];}))d.schedule={week:ls,wkm:1,moves:{}};}
  return d;}
function sd(d){d.lastModified=Date.now();localStorage.setItem('ironlog_data',JSON.stringify(d));cpush();}
function gw(){var d=gd();return d.workouts||JSON.parse(JSON.stringify(DW));}
function sw(w){var d=gd();d.workouts=w;d.wm=Date.now();sd(d);}
function gs(){return gd().sessions;}
function gss(){return gs().slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});}
function sIdx(id){var ss=gs();for(var i=0;i<ss.length;i++)if(ss[i].id===id)return i;return -1;}
function addS(s){var d=gd();s.id=s.id||uid();s.mt=Date.now();d.sessions.push(s);sd(d);}
function updS(i,s){var d=gd();s.mt=Date.now();d.sessions[i]=s;sd(d);}
function delS(i){var d=gd();var s=d.sessions[i];if(s){d.deleted=d.deleted||{};d.deleted[s.id]=Date.now();}d.sessions.splice(i,1);sd(d);}
function svDr(n,s){localStorage.setItem('ironlog_draft',JSON.stringify({workout:n,sets:s,ts:Date.now()}));}
function gDr(n){try{var d=JSON.parse(localStorage.getItem('ironlog_draft'));if(d&&d.workout===n)return d.sets;}catch(e){}return null;}
function clDr(){localStorage.removeItem('ironlog_draft');}
function gDri(){try{return JSON.parse(localStorage.getItem('ironlog_draft'));}catch(e){return null;}}
function gSplit(){var sc=gd().schedule;return(sc&&sc.week)||{};}
function sSplit(s){var d=gd();d.schedule=d.schedule||{moves:{}};d.schedule.week=s;d.schedule.wkm=Date.now();sd(d);}
// One-off schedule changes ("do Monday's Legs on Tuesday"); synced records like sessions
function addMove(from,to,workout){var d=gd();d.schedule=d.schedule||{week:{},wkm:0};d.schedule.moves=d.schedule.moves||{};var id=uid();d.schedule.moves[id]={id:id,mt:Date.now(),from:from,to:to,workout:workout};sd(d);return id;}
function delMove(id){var d=gd();if(d.schedule&&d.schedule.moves&&d.schedule.moves[id]){delete d.schedule.moves[id];d.deleted=d.deleted||{};d.deleted[id]=Date.now();sd(d);}}
// Core is one record per day. Sessions on that day keep the old abs flag in step, so older app versions still see it.
function coreDone(day,cm){cm=cm||gd().core;var r=cm['c'+day];return!!(r&&r.done);}
function coreSet(d,day,v){var k='c'+day,now=Date.now(),r=d.core[k]||{id:k,date:day,items:[]};r.done=!!v;r.mt=now;d.core[k]=r;
  d.sessions.forEach(function(s){if(lday(s.date)===day){s.abs=!!v;s.mt=now;}});}
function setCoreDone(day,v){var d=gd();coreSet(d,day,v);sd(d);}
// Goals: target kg by a date (UI comes later)
function gGoals(){return gd().goals||[];}
function addGoal(g){var d=gd();d.goals=d.goals||[];g.id=g.id||uid();g.mt=Date.now();d.goals.push(g);sd(d);return g.id;}
function updGoal(id,patch){var d=gd();(d.goals||[]).forEach(function(g){if(g.id===id){Object.keys(patch).forEach(function(k){g[k]=patch[k];});g.mt=Date.now();}});sd(d);}
function archiveGoal(id){updGoal(id,{archived:true});}
function delGoal(id){var d=gd();d.goals=(d.goals||[]).filter(function(g){return g.id!==id;});d.deleted=d.deleted||{};d.deleted[id]=Date.now();sd(d);}
// Muscle group overrides ('Main/Sub'); defaults are guessed in stats.js
function setMuscle(name,ms){var d=gd();d.muscles=d.muscles||{};if(ms)d.muscles[name]=ms;else delete d.muscles[name];d.mm=Date.now();sd(d);}
function gSyncUrl(){return localStorage.getItem('ironlog_sync_url')||'';}
function sSyncUrl(u){localStorage.setItem('ironlog_sync_url',u);}
function gPRs(){var p={};gss().forEach(function(s){Object.keys(s.exercises).forEach(function(x){s.exercises[x].forEach(function(t){if(!p[x]||t.kg>p[x])p[x]=t.kg;});});});return p;}
// ═══════ STATE ═══════
var CW=null,CS={},OE={},ESI=null,PCI=null,WST=null,RTI=null,RS=0,HMO=0,CTR='W',OVTR='W';
var DWM={},DABS={},DPROG={};
var metaInterval=null;
function CEL(){return(gw()[CW])||[];}
// Helpers
function gLast(n){var s=gss();for(var i=s.length-1;i>=0;i--)if(s[i].workout===n)return s[i];return null;}
function gLastEx(n,x,xi){var s=gss();var orig=gs();for(var i=s.length-1;i>=0;i--){var origIdx=orig.indexOf(s[i]);if(xi!=null&&origIdx===xi)continue;if(s[i].workout===n&&s[i].exercises[x])return{date:s[i].date,sets:s[i].exercises[x]};}return null;}
function tap2(b,fn){var t=null;b.addEventListener('click',function(e){e.stopPropagation();if(!t){var tx=b.textContent;b.textContent='Confirm?';b.style.background='var(--red)';b.style.color='var(--on-color)';t=setTimeout(function(){t=null;b.textContent=tx;b.style.background='';b.style.color='';},3000);return;}clearTimeout(t);t=null;fn();});}
function eh(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function ea(v){return v==null?'':String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;');}
function fds(d){return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function fdf(d){return new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function fdur(s){if(!s)return'';return Math.floor(s/60)+'m';}
var toastTimer=null;
function toast(m,c){var t=document.getElementById('toast');clearTimeout(toastTimer);t.classList.remove('show');t.textContent=m;t.style.background=c||'var(--green)';requestAnimationFrame(function(){requestAnimationFrame(function(){t.classList.add('show');toastTimer=setTimeout(function(){t.classList.remove('show');},2500);});});}
