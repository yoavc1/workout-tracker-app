// Workout Tracker — Theme, settings screen, export and import
// ═══════ THEME ═══════
function iTheme(){if(localStorage.getItem('ironlog_theme')==='light'){document.documentElement.setAttribute('data-theme','light');document.getElementById('tog').classList.remove('active');}}
function tTheme(){var e=document.getElementById('tog');e.classList.toggle('active');var l=!e.classList.contains('active');document.documentElement.setAttribute('data-theme',l?'light':'');localStorage.setItem('ironlog_theme',l?'light':'dark');}
function goSet(){document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});document.getElementById('s-set').classList.add('active');document.getElementById('nav-wrap').style.display='none';document.getElementById('bbar').style.display='none';document.getElementById('sync-url').value=gSyncUrl();var st=gSt();document.getElementById('sync-st').textContent=st?st.m:'';}
// Settings
function expD(){var d=gd();var b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='workout-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u);toast('Exported!');}
function impD(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{var d=JSON.parse(ev.target.result);if(d.sessions){sd(d);toast('Imported!');goHome();}else toast('Invalid','var(--red)');}catch(err){toast('Failed','var(--red)');}};r.readAsText(f);e.target.value='';}
