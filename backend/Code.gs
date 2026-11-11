/**
 * Workout Tracker — cloud sync backend (Google Apps Script, attached to the "Workout Tracker App Data" Sheet)
 *
 * The app talks to this script in two ways:
 *   GET  <url>  -> the stored data as JSON ({"sessions":[]} when empty)
 *   POST <url>  -> body is the app's full (already merged) data; stores it and replies {"success":true}
 * The app merges on the phone (by session id, with deletion tombstones), so this side stays a simple, safe store.
 *
 * Tabs it manages:
 *   data      the app's data, split across A1, A2, ... because one cell holds at most 50,000 characters.
 *             B1 holds the time of the last save. Older versions kept everything in A1; that is read as-is.
 *   Log       readable copy, one row per set (newest first). Rewritten on every save; safe to sort and filter.
 *             Sets logged live also have the time they were logged and the rest before them.
 *   Coach     the app's own summary (statuses, trends, flags, goals, this week, recent workouts), written as the app
 *             sends it, so a Claude chat reading this Sheet sees what the app shows. See docs/COACH.md.
 *   Core      days core was trained (and the exercises, once the app logs them). Appears when there is core data.
 *   Goals     appears once the app has goals.
 *   _backups  hidden; the first save each day copies the previous data here. Keeps the last 14 days.
 *
 * Updating an existing deployment (keeps the same URL, so nothing changes in the app):
 *   Extensions -> Apps Script -> replace Code.gs with this file -> Save
 *   -> Deploy -> Manage deployments -> pencil (Edit) -> Version: New version -> Deploy.
 * First-time setup: Deploy -> New deployment -> Web app; Execute as: Me; Who has access: Anyone
 *   -> copy the URL ending in /exec into the app: Settings -> Cloud Sync -> Save URL.
 */
var DATA_SHEET = 'data';
var CHUNK = 40000;
var BACKUP_SHEET = '_backups';
var BACKUP_DAYS = 14;

function doGet() {
  try {
    return ContentService.createTextOutput(readData_() || '{"sessions":[]}')
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ error: err.message });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ error: 'busy, try again' });
  try {
    var body = e.postData.contents;
    var data = JSON.parse(body);
    if (!data || !Array.isArray(data.sessions)) return json_({ error: 'invalid data' });
    // The coach summary is only for the Coach tab: keep it out of the stored data
    var coach = data.coach;
    if (coach) { delete data.coach; body = JSON.stringify(data); }
    backup_();
    writeData_(body);
    // The readable tabs are a convenience; a problem there must never fail a save
    try { writeReadable_(data); } catch (err) { console.error(err); }
    try { if (coach) writeCoach_(coach); } catch (err) { console.error(err); }
    return json_({ success: true });
  } catch (err) {
    return json_({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ─── Stored data ───────────────────────────────────────────────

function readData_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET);
  if (!sh || !sh.getLastRow()) return '';
  return sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).join('');
}

// Cells are formatted as plain text, and each piece starts on a JSON punctuation character, so Sheets never
// reads a piece as a number, date or formula.
function split_(s) {
  var out = [];
  var i = 0;
  while (i < s.length) {
    var end = Math.min(i + CHUNK, s.length);
    while (end < s.length && '{}[]",:'.indexOf(s.charAt(end)) < 0) end--;
    if (end <= i) end = Math.min(i + CHUNK, s.length);
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

function writeData_(body) {
  var sh = sheet_(DATA_SHEET);
  var parts = split_(body);
  var last = sh.getLastRow();
  var rng = sh.getRange(1, 1, parts.length, 1);
  rng.setNumberFormat('@');
  rng.setValues(parts.map(function (p) { return [p]; }));
  if (last > parts.length) sh.getRange(parts.length + 1, 1, last - parts.length, 1).clearContent();
  sh.getRange('B1').setValue(new Date().toISOString());
}

function backup_() {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sh = sheet_(BACKUP_SHEET);
  if (!sh.isSheetHidden()) sh.hideSheet();
  if (sh.getLastRow() && String(sh.getRange(1, 1).getValue()) === today) return;
  var current = readData_();
  if (!current) return;
  var row = [today].concat(split_(current));
  sh.insertRowBefore(1);
  var rng = sh.getRange(1, 1, 1, row.length);
  rng.setNumberFormat('@');
  rng.setValues([row]);
  if (sh.getLastRow() > BACKUP_DAYS) sh.deleteRows(BACKUP_DAYS + 1, sh.getLastRow() - BACKUP_DAYS);
}

// ─── Readable tabs ─────────────────────────────────────────────

function e1rm_(kg, reps) {
  if (!(kg > 0) || !(reps > 0)) return '';
  return Math.round(kg * (1 + Math.min(reps, 12) / 30) * 10) / 10;
}

// fmts: {column: number format} for columns other than dates, e.g. times
function writeTable_(name, header, rows, dateCols, fmts) {
  var sh = sheet_(name);
  var created = sh.getLastRow() === 0;
  sh.clearContents();
  var all = [header].concat(rows);
  sh.getRange(1, 1, all.length, header.length).setValues(all);
  (dateCols || []).forEach(function (c) {
    if (rows.length) sh.getRange(2, c, rows.length, 1).setNumberFormat('d mmm yyyy');
  });
  Object.keys(fmts || {}).forEach(function (c) {
    if (rows.length) sh.getRange(2, +c, rows.length, 1).setNumberFormat(fmts[c]);
  });
  // Bold every time, so columns added later (the Log's rest columns) match the rest of the header
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  if (created) sh.setFrozenRows(1);
}

function writeReadable_(data) {
  var muscles = data.muscleMap || data.muscles || {};
  var sessions = data.sessions.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

  var log = [];
  sessions.forEach(function (s) {
    var day = new Date(s.date);
    // Sets logged live carry at (ms). Rest before a set: the gap since the session's previous logged set, any exercise.
    var times = [];
    Object.keys(s.exercises || {}).forEach(function (ex) {
      (s.exercises[ex] || []).forEach(function (t) { if (t.at > 0) times.push(+t.at); });
    });
    times.sort(function (a, b) { return a - b; });
    Object.keys(s.exercises || {}).forEach(function (ex) {
      (s.exercises[ex] || []).forEach(function (t, i) {
        var at = t.at > 0 ? +t.at : 0, k = at ? times.indexOf(at) : -1;
        log.push([day, s.workout, ex, muscles[ex] || '', i + 1,
          t.kg != null ? t.kg : '', t.reps != null ? t.reps : '', t.secs != null ? t.secs : '', e1rm_(t.kg, t.reps),
          at ? new Date(at) : '', k > 0 ? Math.round((at - times[k - 1]) / 1000) : '']);
      });
    });
  });
  writeTable_('Log', ['Date', 'Workout', 'Exercise', 'Muscle', 'Set', 'kg', 'Reps', 'Secs', 'e1RM (kg)', 'Logged at', 'Rest before (s)'],
    log, [1], { 10: 'hh:mm:ss' });

  // Core: the per-day log once the app has it, plus days ticked on sessions (older app versions)
  var core = {};
  Object.keys(data.core || {}).forEach(function (k) {
    var c = data.core[k];
    if (c && c.date && (c.done || (c.items || []).length)) core[c.date] = c;
  });
  data.sessions.forEach(function (s) {
    if (!s.abs) return;
    var d = Utilities.formatDate(new Date(s.date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!core[d]) core[d] = { date: d, done: true, items: [] };
  });
  var days = Object.keys(core).sort().reverse();
  if (days.length) {
    var rows = [];
    days.forEach(function (d) {
      var c = core[d];
      var dt = new Date(d + 'T12:00:00');
      if (!(c.items || []).length) { rows.push([dt, 'Yes', '', '', '', '']); return; }
      c.items.forEach(function (it) {
        (it.sets || []).forEach(function (t, i) {
          rows.push([dt, 'Yes', it.name, i + 1, t.reps != null ? t.reps : '', t.secs != null ? t.secs : '']);
        });
      });
    });
    writeTable_('Core', ['Date', 'Core done', 'Exercise', 'Set', 'Reps', 'Secs'], rows, [1]);
  }

  if ((data.goals || []).length) {
    var goals = data.goals.map(function (g) {
      return [g.exercise, g.startKg, g.startDate ? new Date(g.startDate) : '', g.targetKg,
        g.targetDate ? new Date(g.targetDate) : '', g.archived ? 'Archived' : 'Active'];
    });
    writeTable_('Goals', ['Exercise', 'Start kg', 'Start date', 'Target kg', 'Target date', 'Status'], goals, [3, 5]);
  }
}

// ─── Coach tab ─────────────────────────────────────────────────
// The app sends {asOf, blocks: [{title, note, header, rows}]} and decides what is in it, so its content can change
// without redeploying this script. Written as plain text, so every value reads exactly as the app sent it and nothing
// is taken for a date, number or formula. Blocks are stacked with a blank row between them.
function writeCoach_(coach) {
  var list = function (x) { return Array.isArray(x) ? x : []; };
  var blocks = list(coach && coach.blocks);
  var rows = [['Workout Tracker · coach summary'], ['Updated ' + (coach.asOf || '') + ' · written by the app at each sync; edits here are overwritten']];
  var bold = [1];
  blocks.forEach(function (b) {
    if (!b || typeof b !== 'object') return;
    rows.push([]);
    rows.push([String(b.title || '')]); bold.push(rows.length);
    if (b.note) rows.push([String(b.note)]);
    rows.push(list(b.header).map(String)); bold.push(rows.length);
    list(b.rows).forEach(function (r) { rows.push(list(r).map(function (v) { return v == null ? '' : String(v); })); });
  });
  var width = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat(1));
  rows = rows.map(function (r) { while (r.length < width) r.push(''); return r; });
  var sh = sheet_('Coach');
  sh.clear();
  var rng = sh.getRange(1, 1, rows.length, width);
  rng.setNumberFormat('@');
  rng.setValues(rows);
  bold.forEach(function (r) { sh.getRange(r, 1, 1, width).setFontWeight('bold'); });
}
