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
    backup_();
    writeData_(body);
    // The readable tabs are a convenience; a problem there must never fail a save
    try { writeReadable_(data); } catch (err) { console.error(err); }
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

function writeTable_(name, header, rows, dateCols) {
  var sh = sheet_(name);
  var created = sh.getLastRow() === 0;
  sh.clearContents();
  var all = [header].concat(rows);
  sh.getRange(1, 1, all.length, header.length).setValues(all);
  (dateCols || []).forEach(function (c) {
    if (rows.length) sh.getRange(2, c, rows.length, 1).setNumberFormat('d mmm yyyy');
  });
  if (created) {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
}

function writeReadable_(data) {
  var muscles = data.muscleMap || data.muscles || {};
  var sessions = data.sessions.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

  var log = [];
  sessions.forEach(function (s) {
    var day = new Date(s.date);
    Object.keys(s.exercises || {}).forEach(function (ex) {
      (s.exercises[ex] || []).forEach(function (t, i) {
        log.push([day, s.workout, ex, muscles[ex] || '', i + 1,
          t.kg != null ? t.kg : '', t.reps != null ? t.reps : '', t.secs != null ? t.secs : '', e1rm_(t.kg, t.reps)]);
      });
    });
  });
  writeTable_('Log', ['Date', 'Workout', 'Exercise', 'Muscle', 'Set', 'kg', 'Reps', 'Secs', 'e1RM (kg)'], log, [1]);

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
