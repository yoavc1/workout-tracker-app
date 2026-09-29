// Workout Tracker — Theme, settings screen, export and import
// ═══════ THEME ═══════
// thPref() and thApply() live in index.html's <head>, so <html data-theme> is set before the first paint
var THD={auto:'Follows your iPhone\'s light or dark setting',light:'Always light',dark:'Always dark'};
function uTheme(){var p=thPref();document.querySelectorAll('#theme-seg .seg-b').forEach(function(b){var on=b.dataset.th===p;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});document.getElementById('theme-d').textContent=THD[p];}
// Re-resolve the theme; screens and charts redraw only when the colours actually changed (charts read CSS variables as they draw)
function thSync(){var h=document.documentElement,o=h.getAttribute('data-theme');thApply();uTheme();if(h.getAttribute('data-theme')===o)return;refreshView();
  // An open goal sheet draws its own chart, so draw it again too
  var gm=document.getElementById('goal-m');if(gm&&gm.dataset.id&&typeof openGoal==='function'&&document.getElementById('mov-goal').classList.contains('active'))openGoal(gm.dataset.id);}
function sTheme(p){try{localStorage.setItem('ironlog_theme',p);}catch(e){}thSync();}
// Auto flips live with the phone's appearance. iOS resumes home-screen apps rather than relaunching them, so check on resume too.
function iTheme(){uTheme();if(THQ){if(THQ.addEventListener)THQ.addEventListener('change',thSync);else if(THQ.addListener)THQ.addListener(thSync);}document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')thSync();});}
function goSet(){document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});document.getElementById('s-set').classList.add('active');document.getElementById('nav-wrap').style.display='none';document.getElementById('bbar').style.display='none';document.getElementById('sync-url').value=gSyncUrl();var st=gSt();document.getElementById('sync-st').textContent=st?st.m:'';}
// Settings
function expD(){var d=gd();var b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='workout-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u);toast('Exported!');}
function impD(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{var d=JSON.parse(ev.target.result);if(d.sessions){sd(d);toast('Imported!');goHome();}else toast('Invalid','var(--red)');}catch(err){toast('Failed','var(--red)');}};r.readAsText(f);e.target.value='';}
