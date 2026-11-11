// Usage: node tests/backend.test.js  (tests backend/Code.gs against a mock of the Apps Script services)
// Runs backend/Code.gs against an in-memory mock of the Apps Script services it uses.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const LIMIT=50000;
class Sheet{constructor(n){this.name=n;this.cells=new Map();this.fmt=new Map();this.hidden=false;}
  k(r,c){return r+','+c;}
  getLastRow(){let m=0;for(const [k,v] of this.cells)if(v!==''&&v!=null)m=Math.max(m,+k.split(',')[0]);return m;}
  getRange(r,c,nr,nc){if(typeof r==='string'){const m=r.match(/^([A-Z])(\d+)$/);return new Range(this,+m[2],m[1].charCodeAt(0)-64,1,1);}return new Range(this,r,c,nr||1,nc||1);}
  insertRowBefore(row){const cells=new Map(),fmt=new Map();for(const [k,v] of this.cells){let [r,c]=k.split(',').map(Number);cells.set(this.k(r>=row?r+1:r,c),v);}for(const [k,v] of this.fmt){let [r,c]=k.split(',').map(Number);fmt.set(this.k(r>=row?r+1:r,c),v);}this.cells=cells;this.fmt=fmt;}
  deleteRows(start,count){const cells=new Map();for(const [k,v] of this.cells){let [r,c]=k.split(',').map(Number);if(r>=start&&r<start+count)continue;cells.set(this.k(r>=start+count?r-count:r,c),v);}this.cells=cells;}
  clearContents(){this.cells=new Map();}clear(){this.cells=new Map();this.fmt=new Map();this.bold=new Set();}hideSheet(){this.hidden=true;}isSheetHidden(){return this.hidden;}setFrozenRows(){}}
class Range{constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  each(f){for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++)f(this.r+i,this.c+j,i,j);}
  getValues(){const o=[];for(let i=0;i<this.nr;i++){o.push([]);for(let j=0;j<this.nc;j++){const v=this.sh.cells.get(this.sh.k(this.r+i,this.c+j));o[i].push(v==null?'':v);}}return o;}
  getValue(){return this.getValues()[0][0];}
  setValues(v){assert.strictEqual(v.length,this.nr);this.each((r,c,i,j)=>{assert.strictEqual(v[i].length,this.nc);this.put(r,c,v[i][j]);});return this;}
  setValue(v){this.put(this.r,this.c,v);return this;}
  put(r,c,v){if(typeof v==='string'){if(v.length>LIMIT)throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
      // Sheets parses text typed into non-text cells: formulas, numbers
      if(this.sh.fmt.get(this.sh.k(r,c))!=='@'){if(/^[=+\-@]/.test(v))v='#FORMULA';else if(/^\d+(\.\d+)?$/.test(v))v=Number(v);}}
    this.sh.cells.set(this.sh.k(r,c),v);}
  clearContent(){this.each((r,c)=>this.sh.cells.delete(this.sh.k(r,c)));return this;}
  setNumberFormat(f){this.each((r,c)=>this.sh.fmt.set(this.sh.k(r,c),f));return this;}
  setFontWeight(w){this.sh.bold=this.sh.bold||new Set();if(w==='bold')for(let i=0;i<this.nr;i++)this.sh.bold.add(this.r+i);return this;}}
function makeEnv(){const sheets={};let now=new Date('2026-09-29T10:00:00Z');
  const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n))};
  const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({s,setMimeType(){return this;}})},
    Session:{getScriptTimeZone:()=>'Europe/London'},
    Utilities:{formatDate:(d,tz,f)=>new Date(d.getTime()+3600e3).toISOString().slice(0,10)},
    console,JSON,Math,String,Array,Object,Number,
    Date:class extends Date{constructor(...a){a.length?super(...a):super(now);}static now(){return now.getTime();}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../backend/Code.gs'),'utf8'),ctx);
  return {ctx,sheets,setNow:d=>{now=new Date(d);},get:()=>ctx.doGet().s,post:b=>JSON.parse(ctx.doPost({postData:{contents:b}}).s)};}
// realistic payload: ~660 chars/session like the real Sheet
const EX={'Upper Pull':['Lat Pulldown Machine (Uni Lateral)','Chest Supported Seated Row (Grip 1)','Lat Pull Down - Front','Cable Face Pulls','Shrugs - Dumbbell','Hammer Curl - Dumbbell','Faceaway Cable Curl'],'Legs':['Seated Machine Leg Curl','Calf Raise - Seated','Seated Machine Leg Extension','Bulgarian Split Squats','Romanian Deadlift - Dumbbell']};
function payload(n,extra){const ss=[];for(let i=0;i<n;i++){const w=i%2?'Legs':'Upper Pull';const ex={};EX[w].forEach((x,j)=>ex[x]=[{kg:40+j,reps:10},{kg:42.5+j,reps:8},{kg:45+j,reps:6}]);ss.push(Object.assign({workout:w,date:new Date(Date.UTC(2026,3,6)+i*2*864e5).toISOString(),exercises:ex,duration:3400,abs:i%5===0},extra?{id:'m'+(1775500000000+i),mt:0}:{}));}
  return JSON.stringify({sessions:ss,workouts:EX,lastModified:1759098205563});}
let env=makeEnv();
// 1. Existing Sheet: everything in data!A1 (Automatic format), timestamp in B1
const legacy=payload(66);console.log('legacy payload chars',legacy.length);
const d=env.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet('data');d.getRange('A1').setValue(legacy);d.getRange('B1').setValue('2026-09-28T22:23:25.563Z');
assert.strictEqual(env.get(),legacy,'reads the old single-cell format as-is');
// 2. First save from the new app (ids added) goes over one cell's worth -> split
const b1=payload(66,true);let r=env.post(b1);assert.deepStrictEqual(r,{success:true});
assert.strictEqual(env.get(),b1,'round-trips exactly');
const dataVals=env.sheets.data.getRange(1,1,env.sheets.data.getLastRow(),1).getValues().map(x=>x[0]).filter(Boolean);
console.log('chunks',dataVals.map(x=>x.length));assert.ok(dataVals.length>=2&&dataVals.every(x=>typeof x==='string'&&x.length<=40000));
// 3. Backup of the previous state, hidden, once per day
assert.ok(env.sheets._backups.hidden);assert.strictEqual(env.sheets._backups.getRange(1,1).getValue(),'2026-09-29');
assert.strictEqual(env.sheets._backups.getRange(1,2,1,5).getValues()[0].join(''),legacy,'backup holds the pre-save data');
env.post(b1);assert.strictEqual(env.sheets._backups.getLastRow(),1,'one backup per day');
// 4. Grow a lot, then shrink: leftover pieces are cleared
const big=payload(250,true);env.post(big);assert.strictEqual(env.get(),big);console.log('250 sessions ->',big.length,'chars in',env.sheets.data.getLastRow(),'cells');
const small=payload(10,true);env.post(small);assert.strictEqual(env.get(),small,'shrinking clears leftover cells');
// 5. Readable Log tab
const L=env.sheets.Log;const hdr=L.getRange(1,1,1,9).getValues()[0];assert.strictEqual(hdr[2],'Exercise');
const sets=JSON.parse(small).sessions.reduce((a,s)=>a+Object.values(s.exercises).reduce((x,y)=>x+y.length,0),0);
assert.strictEqual(L.getLastRow()-1,sets,'one row per set');
const row2=L.getRange(2,1,1,9).getValues()[0];console.log('first Log row',row2.map(v=>v instanceof Date?v.toISOString().slice(0,10):v).join(' | '));
assert.ok(new Date(row2[0])>=new Date(L.getRange(L.getLastRow(),1).getValue()),'newest first');
assert.strictEqual(L.getRange(2,9).getValue()>0,true);
// e1RM check: 60kg x 8 = 76
env.post(JSON.stringify({sessions:[{id:'x',workout:'T',date:'2026-09-29T09:00:00Z',exercises:{Bench:[{kg:60,reps:8},{kg:0,reps:12}]}}]}));
assert.strictEqual(env.sheets.Log.getRange(2,9).getValue(),76);assert.strictEqual(env.sheets.Log.getRange(3,9).getValue(),'','bodyweight: no e1RM');
// 6. Core tab from session ticks and from the future per-day log
env.post(small);assert.ok(env.sheets.Core&&env.sheets.Core.getLastRow()>1,'core days from abs');
env.post(JSON.stringify({sessions:[],core:{'c2026-09-28':{id:'c2026-09-28',date:'2026-09-28',done:true,items:[{name:'Plank',mode:'time',sets:[{secs:60},{secs:45}]}]}},goals:[{id:'g',exercise:'Incline Chest Press',startKg:40,startDate:'2026-09-29',targetKg:65,targetDate:'2027-03-28'}]}));
assert.deepStrictEqual(env.sheets.Core.getRange(2,3,1,4).getValues()[0],['Plank',1,'',60]);assert.strictEqual(env.sheets.Goals.getRange(2,1).getValue(),'Incline Chest Press');
// 7. Bad input never touches stored data
const before=env.get();assert.ok(env.post('not json').error);assert.ok(env.post('{"foo":1}').error);assert.strictEqual(env.get(),before);
// 8. Only 14 days of backups are kept
for(let i=1;i<=20;i++){env.setNow(Date.UTC(2026,9,i,10));env.post(small);}assert.strictEqual(env.sheets._backups.getLastRow(),14);
// 9. A piece never starts with something Sheets would reinterpret, even with hostile names
env=makeEnv();const nasty=JSON.stringify({sessions:Array.from({length:400},(_, i)=>({id:'n'+i,workout:'=SUM(A1)',date:'2026-01-01',exercises:{['-5 +3 =x @y 123']:[{kg:1,reps:2}]}}))});
env.post(nasty);assert.strictEqual(env.get(),nasty,'hostile content round-trips');
// 10. Empty sheet
env=makeEnv();assert.strictEqual(env.get(),'{"sessions":[]}');
// 11. Log: sets logged live get the time they were logged and the rest before them (any exercise; none for the first,
// or a set with no time)
const t0=Date.UTC(2026,8,28,17,0,0);
const live={sessions:[{id:'r1',mt:1,workout:'Legs',date:new Date(t0+600e3).toISOString(),exercises:{Squat:[{kg:60,reps:8,at:t0},{kg:60,reps:8,at:t0+95000}],'Leg Curl':[{kg:40,reps:10,at:t0+260000},{kg:40,reps:10}]}}]};
env.post(JSON.stringify(live));
const LH=env.sheets.Log.getRange(1,1,1,11).getValues()[0];assert.deepStrictEqual(LH.slice(9),['Logged at','Rest before (s)']);
assert.ok(env.sheets.Log.bold.has(1),'header bold');
const lr=env.sheets.Log.getRange(2,1,4,11).getValues().map(r=>[r[2],r[9]&&r[9].getTime?r[9].getTime():r[9],r[10]]);
assert.deepStrictEqual(lr,[['Squat',t0,''],['Squat',t0+95000,95],['Leg Curl',t0+260000,165],['Leg Curl','','']]);
assert.strictEqual(env.sheets.Log.fmt.get('2,10'),'hh:mm:ss');
// 12. Coach tab: written exactly as the app sent it (plain text, so nothing turns into a formula, number or date),
// blocks stacked with a blank row; the summary itself is kept out of the stored data
const coach={v:1,asOf:'2026-09-28 18:10',today:'2026-09-28',blocks:[
  {title:'Flags',note:'Gaps first',header:['Type','About','Detail'],rows:[['Neglected','Shoulders · Rear','No sets in 12 days'],['=SUM(1)','+3.1','2026-09-28']]},
  {title:'Weekly volume',header:['Week of','2026-09-21','2026-09-28'],rows:[['Workouts',3,1.5]]}]};
assert.deepStrictEqual(env.post(JSON.stringify(Object.assign({},live,{coach}))),{success:true});
assert.deepStrictEqual(JSON.parse(env.get()),live,'stored without the summary');
const C=env.sheets.Coach;
assert.deepStrictEqual(C.getRange(1,1,C.getLastRow(),3).getValues(),[
  ['Workout Tracker · coach summary','',''],['Updated 2026-09-28 18:10 · written by the app at each sync; edits here are overwritten','',''],['','',''],
  ['Flags','',''],['Gaps first','',''],['Type','About','Detail'],['Neglected','Shoulders · Rear','No sets in 12 days'],['=SUM(1)','+3.1','2026-09-28'],['','',''],
  ['Weekly volume','',''],['Week of','2026-09-21','2026-09-28'],['Workouts','3','1.5']]);
assert.deepStrictEqual([...C.bold].sort((a,b)=>a-b),[1,4,6,10,11],'title, block titles and headers bold');
// A shorter summary replaces the old one completely; a save without one leaves the tab as it was
env.post(JSON.stringify(Object.assign({},live,{coach:{asOf:'2026-09-29 08:00',blocks:[{title:'About',header:['Item','Value'],rows:[['Today','2026-09-29']]}]}})));
assert.deepStrictEqual([C.getLastRow(),C.getRange(4,1).getValue(),[...C.bold].sort((a,b)=>a-b)],[6,'About',[1,4,5]]);
env.post(JSON.stringify(live));assert.strictEqual(C.getRange(6,2).getValue(),'2026-09-29');
// A malformed summary never fails the save
for(const bad of [{blocks:'oops'},{blocks:[null,{title:'X',header:'no',rows:[null,[1]]}]}])assert.deepStrictEqual(env.post(JSON.stringify(Object.assign({},live,{coach:bad}))),{success:true});
assert.deepStrictEqual(C.getRange(4,1,4,1).getValues().map(r=>r[0]),['X','','','1'],'title, empty header, empty row, the one good row');
console.log('APPS SCRIPT TESTS PASS');
