// Workout Tracker — Goals tab: target kg by a date, straight-line pace and status, detail chart, celebrate and archive
// ═══════ GOALS ═══════
var GT={
  TOL_KG:2.5,   // "On track" = within ±2.5 kg or ±10% of the goal's gap (target − start), whichever is larger
  TOL_PCT:10,
  RECENT:14,    // current kg = best top set of the last 14 days, else the latest top set
  LEAD:28       // the detail chart also shows the 4 weeks before the goal started, for context
};
// Goal dates are local days ('YYYY-MM-DD'), so parse them as local midnight rather than UTC
function gDay(s){var p=String(s).split('-');return new Date(+p[0],p[1]-1,+p[2]);}
function gDays(a,b){return Math.round((gDay(b)-gDay(a))/864e5);}
// n calendar months later; the 31st lands on the month's last day
function gMonths(day,n){var d=gDay(day),t=new Date(d.getFullYear(),d.getMonth()+n,1);t.setDate(Math.min(d.getDate(),new Date(t.getFullYear(),t.getMonth()+1,0).getDate()));return lday(t);}
function gKg(x){return Math.round((+x||0)*10)/10+' kg';}
function gFd(day){var d=gDay(day),o={day:'numeric',month:'short'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleDateString('en-GB',o);}
// "Current" kg: the best top-set kg in the last 14 days (what bestRecent(name,14).kg gives), falling back to the latest
// top set when the lift hasn't been done lately. {kg, date, src:'recent'|'latest'}, or null if never done with weight.
function goalCur(name,d,now){
  now=now==null?Date.now():+now;var from=now-GT.RECENT*864e5,best=null,last=null;
  exerciseSeries(name,d).forEach(function(p){var t=new Date(p.date).getTime();if(!p.top||t>now)return;
    last={kg:p.top.kg,date:p.date,src:'latest'};if(t>=from&&(!best||p.top.kg>best.kg))best={kg:p.top.kg,date:p.date,src:'recent'};});
  return best||last;
}
// Date of the first session since the goal's start day whose top set reached the target, or null.
// Reaching it is an event: it still counts after that session drops out of the 14-day window.
function goalHit(g,d,now){now=now==null?Date.now():+now;var r=null;
  exerciseSeries(g.exercise,d).some(function(p){if(p.top&&new Date(p.date).getTime()<=now&&lday(p.date)>=g.startDate&&p.top.kg>=+g.targetKg){r=p.date;return true;}return false;});
  return r;}
// Everything a goal card shows, as of `now`. The pace is a straight line from (start day, start kg) to (target day,
// target kg) that moves once a day. Status is 'done' once the target is hit, else current vs expected kg:
// 'ahead', 'on' (within ±tol) or 'behind'. With no weighted sets logged at all, current is the start kg.
function goalStatus(g,d,now){
  now=now==null?Date.now():+now;d=d||gd();
  var today=lday(now),s=+g.startKg||0,t=+g.targetKg||0,gap=t-s;
  var total=Math.max(1,gDays(g.startDate,g.targetDate)),el=Math.min(total,Math.max(0,gDays(g.startDate,today))),left=gDays(today,g.targetDate);
  var exp=s+gap*el/total,tol=Math.max(GT.TOL_KG,Math.abs(gap)*GT.TOL_PCT/100);
  var c=goalCur(g.exercise,d,now),cur=c?c.kg:s,hit=goalHit(g,d,now),diff=cur-exp;
  var st=hit?'done':diff>tol+1e-9?'ahead':diff< -tol-1e-9?'behind':'on';
  return{cur:cur,src:c?c.src:null,curDate:c?c.date:null,exp:exp,tol:tol,diff:diff,status:st,hit:hit,daysLeft:left,
    pct:st==='done'?1:gap>0?Math.min(1,Math.max(0,(cur-s)/gap)):0,expPct:el/total,
    perWk:hit?0:left>0?Math.max(0,(t-cur)*7/left):null};  // kg per week still needed; null once the date has passed
}
// Why a new goal can't be saved, or '' when it can. f = {exercise, startKg, targetKg, targetDate}
function goalErr(f,d,now){
  now=now==null?Date.now():+now;d=d||gd();var x=String(f.exercise||'').trim().toLowerCase();
  if(!x)return'Pick an exercise';
  if(!(f.startKg>=0))return'Enter a start kg';
  if(!(f.targetKg>f.startKg))return'Target must be above the start kg';
  if(!/^\d{4}-\d\d-\d\d$/.test(f.targetDate||'')||f.targetDate<=lday(now))return'Pick a date after today';
  if((d.goals||[]).some(function(g){return!g.archived&&String(g.exercise).toLowerCase()===x;}))return'You already have a goal for this';
  var c=goalCur(f.exercise,d,now);if(c&&c.src==='recent'&&c.kg>=f.targetKg)return'You lifted '+gKg(c.kg)+' lately. Aim higher';
  return'';
}
