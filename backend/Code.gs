/**
 * Workout Tracker — cloud sync backend (Google Apps Script)
 *
 * Contract the app relies on:
 *   GET  <url>  -> the stored data as JSON ({"sessions":[]} when empty)
 *   POST <url>  -> body is the app's full (already merged) data; stores it and replies {"success":true}
 * The app merges on the client (by session id, with deletion tombstones), so this side stays a simple, safe store.
 *
 * Data lives in one JSON file in your Google Drive: no 50,000-character limit like a spreadsheet cell,
 * writes are serialized with a lock, and the first save of each day snapshots the previous state into
 * a "Workout Tracker backups" folder (kept for BACKUP_DAYS days).
 *
 * Deploy:
 *   1. script.google.com -> New project -> replace Code.gs with this file -> Save.
 *   2. Deploy -> New deployment -> type "Web app"; Execute as: Me; Who has access: Anyone -> Deploy -> authorize.
 *   3. Copy the URL ending in /exec -> in the app: Settings -> Cloud Sync -> paste -> Save URL.
 *      Do this on the device that has all your workouts: the first sync uploads everything it holds.
 * After changing this code: Deploy -> Manage deployments -> edit (pencil) -> Version: New version -> Deploy.
 * The /exec URL stays the same.
 */
const FILE_NAME = 'workout-tracker-data.json';
const BACKUP_FOLDER_NAME = 'Workout Tracker backups';
const BACKUP_DAYS = 14;

function doGet() {
  return ContentService.createTextOutput(dataFile_().getBlob().getDataAsString() || '{"sessions":[]}')
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ success: false, error: 'busy, try again' });
  try {
    const body = e && e.postData && e.postData.contents;
    const data = JSON.parse(body);
    if (!data || !Array.isArray(data.sessions)) return json_({ success: false, error: 'invalid payload' });
    const file = dataFile_();
    backup_(file);
    file.setContent(body);
    return json_({ success: true });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// The file id is remembered in script properties, so renaming or moving the file in Drive is fine.
function dataFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILE_ID');
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (err) {}
  }
  const file = DriveApp.createFile(FILE_NAME, '{"sessions":[]}', 'application/json');
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function backup_(file) {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty('LAST_BACKUP') === today) return;
  const folder = backupFolder_(props);
  folder.createFile('backup-' + today + '.json', file.getBlob().getDataAsString(), 'application/json');
  props.setProperty('LAST_BACKUP', today);
  const cutoff = Date.now() - BACKUP_DAYS * 86400000;
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true);
  }
}

function backupFolder_(props) {
  const id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) {}
  }
  const folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}
