// Unit tests for the sync merge (js/sync.js) and session ids (js/data.js). Usage: node tests/merge.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = ['data.js', 'sync.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
const pick = n => { const i = src.indexOf('function ' + n + '('); assert.ok(i >= 0, 'missing ' + n); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] == '{') d++; else if (src[j] == '}' && --d == 0) break; } return src.slice(i, j + 1); };
const { sk, newer, mergeD, dsig } = new Function(['sk', 'newer', 'mergeD', 'dsig'].map(pick).join('\n') + '\nreturn {sk,newer,mergeD,dsig};')();
const J = x => JSON.parse(JSON.stringify(x));

// Legacy data (no ids, no mt) on both sides, cloud has one extra session
const s1 = { workout: 'Legs', date: '2026-08-30T10:00:00.000Z', exercises: { Squat: [{ kg: 60, reps: 8 }] } };
const s2 = { workout: 'Upper Pull', date: '2026-09-07T10:00:00.000Z', exercises: { Row: [{ kg: 50, reps: 10 }] } };
const s3 = { id: 'abc', mt: 500, workout: 'Upper Push', date: '2026-09-10T10:00:00.000Z', exercises: { Dips: [{ kg: 0, reps: 12 }] } };
let local = { sessions: [J(s1)], lastModified: 100, workouts: { Legs: ['Squat'] } };
let cloud = { sessions: [J(s1), J(s2)], lastModified: 200, workouts: { Legs: ['Squat', 'Lunge'] } };
let m = mergeD(J(local), J(cloud));
assert.deepStrictEqual(m.sessions.map(s => s.workout), ['Legs', 'Upper Pull']);
assert.deepStrictEqual(m.workouts.Legs, ['Squat', 'Lunge'], 'legacy templates: newer doc wins');
assert.strictEqual(dsig(m), dsig(cloud), 'nothing new to push');

// Both devices logged a different workout offline: both kept
local = { sessions: [J(s1), J(s3)], lastModified: 600 };
cloud = { sessions: [J(s1), J(s2)], lastModified: 300 };
m = mergeD(J(local), J(cloud));
assert.deepStrictEqual(m.sessions.map(s => s.workout).sort(), ['Legs', 'Upper Pull', 'Upper Push']);
assert.notStrictEqual(dsig(m), dsig(local)); assert.notStrictEqual(dsig(m), dsig(cloud));

// A delete on one device propagates; an edit made after the delete brings the session back
const k1 = 'm' + Date.parse(s1.date);
local = { sessions: [J(s2)], deleted: { [k1]: 700 }, lastModified: 700 };
cloud = { sessions: [J(s1), J(s2)], lastModified: 300 };
assert.deepStrictEqual(mergeD(J(local), J(cloud)).sessions.map(s => s.workout), ['Upper Pull']);
assert.deepStrictEqual(mergeD(J(cloud), J(local)).sessions.map(s => s.workout), ['Upper Pull'], 'order-independent');
cloud.sessions[0].mt = 800;
assert.ok(mergeD(J(local), J(cloud)).sessions.some(s => s.workout === 'Legs'));

// The newer edit of the same session wins, whichever side it is on
const a = J(s3), b = J(s3); b.mt = 900; b.exercises.Dips[0].reps = 15;
assert.strictEqual(mergeD({ sessions: [a] }, { sessions: [b] }).sessions[0].exercises.Dips[0].reps, 15);
assert.strictEqual(mergeD({ sessions: [b] }, { sessions: [a] }).sessions[0].exercises.Dips[0].reps, 15);

// A template edit with wm beats a legacy copy even if that doc was saved later
m = mergeD({ sessions: [], workouts: { A: ['x', 'y'] }, wm: 50, lastModified: 50 }, { sessions: [], workouts: { A: ['x'] }, lastModified: 999 });
assert.deepStrictEqual(m.workouts.A, ['x', 'y']);

// Empty cloud: merged equals local, and gets pushed
local = { sessions: [J(s3)], lastModified: 1 }; m = mergeD(J(local), { sessions: [] });
assert.strictEqual(dsig(m), dsig(local)); assert.notStrictEqual(dsig(m), dsig({ sessions: [] }));

// Idempotent
assert.strictEqual(dsig(mergeD(J(m), J(m))), dsig(m));

// Legacy ids come from the date, so every device derives the same one
assert.strictEqual(sk(s1), sk(J(s1))); assert.strictEqual(sk(s3), 'abc');
console.log('merge tests pass');
