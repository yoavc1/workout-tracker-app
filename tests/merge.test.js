// Unit tests for the data model (js/data.js) and sync merge (js/sync.js). Usage: node tests/merge.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const APP = ['data.js', 'sync.js', 'stats.js'];
const app = loadApp(APP);
const { sk, mergeD, dsig, normD, lday } = app;
const J = x => JSON.parse(JSON.stringify(x));
const eq = (a, b, msg) => assert.deepStrictEqual(J(a), J(b), msg);

(async () => {
  // ── Sessions (unchanged behaviour from PR #1) ──
  // Legacy data (no ids, no mt) on both sides, cloud has one extra session
  const s1 = { workout: 'Legs', date: '2026-08-30T10:00:00.000Z', exercises: { Squat: [{ kg: 60, reps: 8 }] } };
  const s2 = { workout: 'Upper Pull', date: '2026-09-07T10:00:00.000Z', exercises: { Row: [{ kg: 50, reps: 10 }] } };
  const s3 = { id: 'abc', mt: 500, workout: 'Upper Push', date: '2026-09-10T10:00:00.000Z', exercises: { Dips: [{ kg: 0, reps: 12 }] } };
  let local = { sessions: [J(s1)], lastModified: 100, workouts: { Legs: ['Squat'] } };
  let cloud = { sessions: [J(s1), J(s2)], lastModified: 200, workouts: { Legs: ['Squat', 'Lunge'] } };
  let m = mergeD(J(local), J(cloud));
  eq(m.sessions.map(s => s.workout), ['Legs', 'Upper Pull']);
  eq(m.workouts.Legs, ['Squat', 'Lunge'], 'legacy templates: newer doc wins');
  assert.strictEqual(dsig(m), dsig(cloud), 'nothing new to push');

  // Both devices logged a different workout offline: both kept
  local = { sessions: [J(s1), J(s3)], lastModified: 600 };
  cloud = { sessions: [J(s1), J(s2)], lastModified: 300 };
  m = mergeD(J(local), J(cloud));
  eq(m.sessions.map(s => s.workout).sort(), ['Legs', 'Upper Pull', 'Upper Push']);
  assert.notStrictEqual(dsig(m), dsig(local)); assert.notStrictEqual(dsig(m), dsig(cloud));

  // A delete on one device propagates; an edit made after the delete brings the session back
  const k1 = 'm' + Date.parse(s1.date);
  local = { sessions: [J(s2)], deleted: { [k1]: 700 }, lastModified: 700 };
  cloud = { sessions: [J(s1), J(s2)], lastModified: 300 };
  eq(mergeD(J(local), J(cloud)).sessions.map(s => s.workout), ['Upper Pull']);
  eq(mergeD(J(cloud), J(local)).sessions.map(s => s.workout), ['Upper Pull'], 'order-independent');
  cloud.sessions[0].mt = 800;
  assert.ok(mergeD(J(local), J(cloud)).sessions.some(s => s.workout === 'Legs'));

  // The newer edit of the same session wins, whichever side it is on
  const a = J(s3), b = J(s3); b.mt = 900; b.exercises.Dips[0].reps = 15;
  assert.strictEqual(mergeD({ sessions: [a] }, { sessions: [b] }).sessions[0].exercises.Dips[0].reps, 15);
  assert.strictEqual(mergeD({ sessions: [J(b)] }, { sessions: [J(a)] }).sessions[0].exercises.Dips[0].reps, 15);

  // A template edit with wm beats a legacy copy even if that doc was saved later
  m = mergeD({ sessions: [], workouts: { A: ['x', 'y'] }, wm: 50, lastModified: 50 }, { sessions: [], workouts: { A: ['x'] }, lastModified: 999 });
  eq(m.workouts.A, ['x', 'y']);

  // Empty cloud: merged equals local, and gets pushed
  local = { sessions: [J(s3)], lastModified: 1 }; m = mergeD(J(local), { sessions: [] });
  assert.strictEqual(dsig(m), dsig(local)); assert.notStrictEqual(dsig(m), dsig({ sessions: [] }));
  assert.strictEqual(dsig(mergeD(J(m), J(m))), dsig(m), 'idempotent');
  assert.strictEqual(sk(s1), sk(J(s1))); assert.strictEqual(sk(s3), 'abc');
  // Empty new fields sign the same as missing ones, so upgrading alone never looks like a change
  assert.strictEqual(dsig({ sessions: [] }), dsig(normD({ sessions: [] })));
  assert.strictEqual(dsig({ sessions: [] }), dsig(mergeD({ sessions: [] }, { sessions: [] })));

  // ── Core: one record per day ──
  const day = '2026-09-01', ck = 'c' + day;
  m = mergeD({ sessions: [], core: { [ck]: { id: ck, mt: 100, date: day, done: true, items: [] } } },
             { sessions: [], core: { [ck]: { id: ck, mt: 200, date: day, done: false, items: [{ name: 'Plank', mode: 'time', sets: [{ secs: 60 }] }] } } });
  assert.strictEqual(m.core[ck].done, false, 'newer core edit wins'); assert.strictEqual(m.core[ck].items[0].sets[0].secs, 60);
  m = mergeD({ sessions: [], core: { [ck]: { id: ck, mt: 200, date: day, done: false, items: [] } } },
             { sessions: [], core: { [ck]: { id: ck, mt: 100, date: day, done: true, items: [] } } });
  assert.strictEqual(m.core[ck].done, false, 'order-independent');
  assert.notStrictEqual(dsig({ sessions: [], core: { [ck]: { id: ck, mt: 1 } } }), dsig({ sessions: [], core: { [ck]: { id: ck, mt: 2 } } }), 'core edits change the signature');

  // Migration: ticked sessions become day records, the same on every device (mt 0, id from the local date)
  const legacy = { sessions: [
    { workout: 'Legs', date: '2026-08-30T10:00:00.000Z', abs: true, exercises: {} },
    { workout: 'Upper Pull', date: '2026-08-30T18:00:00.000Z', abs: false, exercises: {} },
    { workout: 'Upper Push', date: '2026-09-03T10:00:00.000Z', abs: true, exercises: {} },
    { workout: 'Muay Thai', date: '2026-09-04T10:00:00.000Z', exercises: {} }] };
  const devA = normD(J(legacy)), devB = normD(J(legacy));
  eq(devA.core, devB.core, 'two devices derive identical core records');
  const d830 = 'c' + lday('2026-08-30T10:00:00.000Z');
  eq(Object.keys(devA.core).sort(), [d830, 'c' + lday('2026-09-03T10:00:00.000Z')].sort());
  eq(devA.core[d830], { id: d830, mt: 0, date: d830.slice(1), done: true, items: [] });
  assert.strictEqual(dsig(mergeD(J(devA), J(devB))), dsig(devA), 'merging the two derivations changes nothing');
  // A real untick on one device beats the derived tick, and the derivation never overrides an existing record
  devB.core[d830] = { id: d830, mt: 5000, date: d830.slice(1), done: false, items: [] };
  assert.strictEqual(mergeD(J(devA), J(devB)).core[d830].done, false);
  assert.strictEqual(normD(J(devB)).core[d830].done, false, 'abs on the session does not re-tick the day');
  // Cloud still in the old format: merge derives its records too, so it converges in one round
  m = mergeD({ sessions: [] }, J(legacy));
  assert.ok(m.core[d830] && m.core[d830].done);
  assert.strictEqual(dsig(mergeD(J(m), J(legacy))), dsig(m));

  // ── Goals ──
  const g1 = { id: 'g1', mt: 100, exercise: 'Incline Chest Press (Smith/Machine)', startKg: 40, startDate: '2026-09-29', targetKg: 65, targetDate: '2027-03-28' };
  const g2 = { id: 'g2', mt: 150, exercise: 'Lat Pulldown Machine (Uni Lateral)', startKg: 45, startDate: '2026-09-29', targetKg: 60, targetDate: '2026-12-29' };
  m = mergeD({ sessions: [], goals: [J(g1)] }, { sessions: [], goals: [J(g2)] });
  eq(m.goals.map(g => g.id).sort(), ['g1', 'g2'], 'goals from both devices kept');
  m = mergeD({ sessions: [], goals: [J(g1)] }, { sessions: [], goals: [Object.assign(J(g1), { mt: 300, targetKg: 70 })] });
  assert.strictEqual(m.goals[0].targetKg, 70, 'newer goal edit wins');

  // ── Weekly plan (document) and one-off moves (records) ──
  m = mergeD({ sessions: [], lastModified: 10, schedule: { week: { Mon: 'Legs' }, wkm: 500, moves: {} } },
             { sessions: [], lastModified: 99, schedule: { week: { Mon: 'Upper Push' }, wkm: 300, moves: {} } });
  eq(m.schedule.week, { Mon: 'Legs' }, 'newest weekly plan wins'); assert.strictEqual(m.schedule.wkm, 500);
  m = mergeD({ sessions: [], lastModified: 10, schedule: { week: { Mon: 'Legs' }, wkm: 1 } },
             { sessions: [], lastModified: 99, schedule: { week: { Mon: 'Upper Push' }, wkm: 1 } });
  eq(m.schedule.week, { Mon: 'Upper Push' }, 'two adopted local plans: the newer document wins, like templates');
  m = mergeD({ sessions: [], schedule: { week: { Mon: 'Legs' }, wkm: 500 } }, { sessions: [] });
  eq(m.schedule.week, { Mon: 'Legs' }, 'plan kept when the other side has none');
  const mv = { id: 'mv1', mt: 100, from: '2026-09-28', to: '2026-09-29', workout: 'Legs' };
  m = mergeD({ sessions: [], schedule: { week: {}, wkm: 0, moves: { mv1: J(mv) } } }, { sessions: [] });
  eq(Object.keys(m.schedule.moves), ['mv1'], 'moves merge like sessions');

  // ── Muscle overrides (document) ──
  m = mergeD({ sessions: [], muscles: { Dips: 'Arms/Triceps' }, mm: 200 }, { sessions: [], muscles: { Dips: 'Chest/Lower' }, mm: 100 });
  eq(m.muscles, { Dips: 'Arms/Triceps' }); assert.strictEqual(m.mm, 200);

  // ── One set of tombstones covers every collection ──
  const del = { deleted: { g1: 400, mv1: 400, [ck]: 400, abc: 600 } };
  m = mergeD(Object.assign({ sessions: [J(s3)], goals: [J(g1), J(g2)], core: { [ck]: { id: ck, mt: 100, date: day, done: true } }, schedule: { week: {}, wkm: 0, moves: { mv1: J(mv) } } }), J(Object.assign({ sessions: [] }, del)));
  eq({ s: m.sessions.length, g: m.goals.map(g => g.id), c: Object.keys(m.core), mv: Object.keys((m.schedule || {}).moves || {}) }, { s: 0, g: ['g2'], c: [], mv: [] });

  // ── Device-local weekly plan is adopted once, with wkm 1 ──
  let dev = loadApp(APP, { ironlog_split: JSON.stringify({ Mon: 'Legs', Wed: 'Upper Pull' }), ironlog_data: JSON.stringify({ sessions: [] }) });
  eq(dev.gSplit(), { Mon: 'Legs', Wed: 'Upper Pull' }); assert.strictEqual(dev.gd().schedule.wkm, 1);
  dev.sSplit({ Mon: 'Upper Push' });
  const saved = JSON.parse(dev.__store.ironlog_data);
  eq(saved.schedule.week, { Mon: 'Upper Push' }); assert.ok(saved.schedule.wkm > 1, 'real edits get a real timestamp');
  assert.ok(dev.__store.ironlog_split, 'old key left in place');
  dev = loadApp(APP, { ironlog_split: JSON.stringify({ Mon: 'Legs' }), ironlog_data: JSON.stringify({ sessions: [], schedule: { week: { Tue: 'Upper Pull' }, wkm: 900 } }) });
  eq(dev.gSplit(), { Tue: 'Upper Pull' }, 'synced plan wins over the old local one');
  dev = loadApp(APP, { ironlog_split: JSON.stringify({ Mon: '', Tue: '' }) });
  assert.strictEqual(dev.gd().schedule, undefined, 'an all-rest local plan is not adopted');

  // ── Core helpers: ticking the day leaves its workouts alone, and core shows on the day's latest workout ──
  const t = new Date(); t.setHours(12, 0, 0, 0);
  dev = loadApp(APP, { ironlog_data: JSON.stringify({ sessions: [{ id: 'x', workout: 'Legs', date: t.toISOString(), exercises: {} }] }) });
  const today = dev.lday(t);
  assert.strictEqual(dev.coreDone(today), false);
  dev.setCoreDone(today, true);
  assert.strictEqual(dev.coreDone(today), true); assert.strictEqual(dev.gs()[0].abs, undefined, 'the session is left alone');
  eq(dev.coreWith(today).map(s => s.id), ['x']);
  dev.setCoreDone('2026-01-05', true);
  assert.strictEqual(dev.coreDone('2026-01-05'), true, 'core can be ticked on a day with no workout');
  // Goal helpers
  const gid = dev.addGoal({ exercise: 'Dips', startKg: 0, targetKg: 10, startDate: today, targetDate: '2027-01-01' });
  dev.updGoal(gid, { targetKg: 12 }); dev.archiveGoal(gid);
  eq((({ targetKg, archived }) => ({ targetKg, archived }))(dev.gGoals()[0]), { targetKg: 12, archived: true });
  dev.delGoal(gid); assert.strictEqual(dev.gGoals().length, 0); assert.ok(dev.gd().deleted[gid]);

  // ── muscleMap rides along on the POST only ──
  dev = loadApp(APP, { ironlog_sync_url: 'https://sync.test/', ironlog_data: JSON.stringify({ sessions: [{ id: 'y', mt: 5, workout: 'Upper Push', date: t.toISOString(), exercises: { 'Incline Chest Press (Smith/Machine)': [{ kg: 25, reps: 8 }] } }] }) });
  let cloudBody = null, posts = 0;
  dev.fetch = (u, o) => {
    if (o && o.method === 'POST') { posts++; cloudBody = o.body; return Promise.resolve({ json: () => ({ success: true }) }); }
    return Promise.resolve({ json: () => (cloudBody ? JSON.parse(cloudBody) : {}) });
  };
  let ok = await new Promise(r => dev.csync(r));
  assert.strictEqual(ok, true); assert.strictEqual(posts, 1);
  assert.strictEqual(JSON.parse(cloudBody).muscleMap['Incline Chest Press (Smith/Machine)'], 'Chest/Upper', 'Sheet gets the muscle column');
  assert.ok(!('muscleMap' in JSON.parse(dev.__store.ironlog_data)), 'never stored on the device');
  ok = await new Promise(r => dev.csync(r));
  assert.strictEqual(ok, true); assert.strictEqual(posts, 1, 'muscleMap coming back from the cloud is not a change');
  assert.ok(!('muscleMap' in JSON.parse(dev.__store.ironlog_data)));

  // A cloud still in the old format (ticks only on sessions) gets the day records and muscle column pushed once
  const oldCloud = JSON.stringify({ sessions: [{ id: 'z', mt: 5, workout: 'Legs', date: t.toISOString(), abs: true, exercises: { Dips: [{ kg: 0, reps: 10 }] } }] });
  dev = loadApp(APP, { ironlog_sync_url: 'https://sync.test/', ironlog_data: oldCloud });
  cloudBody = oldCloud; posts = 0;
  dev.fetch = (u, o) => {
    if (o && o.method === 'POST') { posts++; cloudBody = o.body; return Promise.resolve({ json: () => ({ success: true }) }); }
    return Promise.resolve({ json: () => JSON.parse(cloudBody) });
  };
  await new Promise(r => dev.csync(r));
  assert.strictEqual(posts, 1, 'old-format cloud upgraded once');
  const up = JSON.parse(cloudBody);
  assert.strictEqual(up.core['c' + dev.lday(t)].done, true); assert.strictEqual(up.muscleMap.Dips, 'Chest/Lower');
  await new Promise(r => dev.csync(r));
  assert.strictEqual(posts, 1, 'then quiet');

  console.log('merge tests pass');
})().catch(e => { console.error(e); process.exit(1); });
