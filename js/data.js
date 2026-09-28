// Workout Tracker — Storage, sessions, drafts, weekly split, shared state and helpers
// ═══════ DATA ═══════
var DW={"Legs":["Seated Machine Leg Curl","Calf Raise - Seated","Seated Machine Leg Extension","Calf Raise - Standing","Bulgarian Split Squats","Romanian Deadlift - Dumbbell","Squat - Dumbbell"],"Upper Pull":["Lat Pulldown Machine (Uni Lateral)","Chest Supported Seated Row (Grip 1)","Chest Supported Seated Row (Grip 2)","Lat Pull Down - Front","Cable Face Pulls","Shrugs - Dumbbell","Hammer Curl - Dumbbell","Faceaway Cable Curl","Bicep Curl - Barbell"],"Upper Push":["Smith Machine Incline Bench Press","Incline Chest Press Machine","Dips","Machine Chest Flys","Triceps Pulldown - Rope","Tricep Extension - Standing - Rope - Pulley Machine","Lateral Shoulder Raise - Dumbbell","Front Shoulder Raise - Dumbbell","Kettlebell Shoulder Raise"]};
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// Every session has a stable id (legacy ones derive it from their date, so all devices agree) and an mt (last-edit time)
function sk(s){return s.id||('m'+(Date.parse(s.date)||0));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function gd(){var d=null;try{d=JSON.parse(localStorage.getItem('ironlog_data'));}catch(e){}if(!d||typeof d!=='object')d={};if(!Array.isArray(d.sessions))d.sessions=[];d.sessions.forEach(function(s){if(!s.id)s.id=sk(s);});return d;}
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
function gSplit(){try{return JSON.parse(localStorage.getItem('ironlog_split'))||{};}catch(e){return{};}}
function sSplit(s){localStorage.setItem('ironlog_split',JSON.stringify(s));}
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
