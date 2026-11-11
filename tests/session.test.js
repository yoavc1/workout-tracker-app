// Unit tests for one session's numbers (js/stats.js): rest between sets from logged times, the comparison with the
// previous session of the same workout, and new bests for the finish summary. Usage: node tests/session.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const J = x => JSON.parse(JSON.stringify(x));

const T0 = Date.UTC(2026, 10, 9, 17, 0, 0);
const at = s => T0 + s * 1000;
const day = n => new Date(T0 + n * 864e5).toISOString();
const S = (id, n, workout, exercises) => ({ id, mt: 1, workout, date: day(n), exercises });
const sets = (...p) => p.map(([kg, reps, t]) => (t == null ? { kg, reps } : { kg, reps, at: at(t) }));

const sessions = [
  S('a', -14, 'Legs', { Squat: sets([60, 8], [60, 8]), 'Leg Curl': sets([40, 10]), Dips: sets([0, 12]) }),
  S('b', -7, 'Legs', { Squat: sets([62.5, 8], [60, 8]), 'Leg Curl': sets([40, 10]), Dips: sets([0, 10]) }),
  S('m', -6, 'Muay Thai', { 'Session Complete': sets([0, 0]) }),
  // Today: Squat beats both before (e1RM 65x8 = 82.3); Leg Curl the same; Dips more reps than ever; Lunge is new
  S('c', 0, 'Legs', {
    Squat: sets([65, 8, 0], [65, 7, 95]),
    'Leg Curl': sets([40, 10, 260], [40, 10, 262]),
    Dips: sets([0, 14, 400]),
    Lunge: sets([20, 10, 2000]),
  }),
];
const app = loadApp(['data.js', 'sync.js', 'stats.js'], { ironlog_data: JSON.stringify({ sessions }) });
const { setTimes, restBefore, avgRest, exCmp, vsPrev, sessionBests, fmss, setVol, setTop, ST } = app;
const today = sessions[3];

// ── Times and rest ──
assert.deepStrictEqual(J(setTimes(today.exercises)), [0, 95, 260, 262, 400, 2000].map(at), 'every logged time, oldest first, across exercises');
assert.deepStrictEqual(J(setTimes(sessions[0].exercises)), [], 'sets logged before times were kept have none');
assert.strictEqual(restBefore(today.exercises, at(0)), null, 'the first set has no rest before it');
assert.strictEqual(restBefore(today.exercises, at(95)), 95000);
assert.strictEqual(restBefore(today.exercises, at(260)), 165000, 'the gap to the previous set of any exercise');
assert.strictEqual(restBefore(today.exercises, undefined), null, 'a set with no time');
// Average rest leaves out the 2 s gap (sets typed in one go) and the 1600 s one (a long pause): (95 + 165 + 138) / 3
assert.strictEqual(avgRest(today.exercises), 133);
assert.deepStrictEqual([ST.REST_MIN, ST.REST_MAX], [10, 900]);
assert.strictEqual(avgRest(sessions[0].exercises), null, 'no times, no average');
assert.strictEqual(avgRest({ X: sets([10, 5, 0]) }), null, 'one set, no gap');

// ── m:ss ──
assert.deepStrictEqual(['0', '5.9', '59', '60', '95', '600', '3600', '3725'].map(s => fmss(+s)), ['0:00', '0:05', '0:59', '1:00', '1:35', '10:00', '1:00:00', '1:02:05']);
assert.strictEqual(fmss(-4), '0:00');

// ── Against the previous session of the same workout ──
assert.deepStrictEqual([setVol(sets([60, 8], [62.5, 8])), setTop(sets([60, 8], [62.5, 8])), setTop([])], [980, 62.5, 0]);
assert.strictEqual(exCmp(sets([65, 8]), sets([62.5, 8])), 1, 'more top kg is up');
assert.strictEqual(exCmp(sets([60, 8], [60, 8], [60, 8]), sets([60, 8], [60, 8])), 1, 'more volume at the same kg is up');
assert.strictEqual(exCmp(sets([60, 6]), sets([60, 8])), -1);
assert.strictEqual(exCmp(sets([40, 10]), sets([40, 10])), 0);
// Bodyweight: no kg on either side, so total reps decide (volume would always be 0)
assert.deepStrictEqual([exCmp(sets([0, 12], [0, 10]), sets([0, 20])), exCmp(sets([0, 8]), sets([0, 10])), exCmp(sets([0, 10]), sets([0, 10]))], [1, -1, 0]);
assert.strictEqual(exCmp(sets([10, 8]), sets([0, 15])), 1, 'adding weight is up');
// Compared with b (7 days ago), not a: Squat up, Leg Curl one set more is up, Dips more reps is up; Lunge isn't in b
assert.deepStrictEqual(J(vsPrev(today)), { first: false, up: 3, down: 0, same: 0 });
assert.deepStrictEqual(J(vsPrev(sessions[1])), { first: false, up: 1, down: 1, same: 1 }, 'b against a: Squat up, Leg Curl same, Dips fewer reps');
assert.deepStrictEqual(J(vsPrev(sessions[0])), { first: true, up: 0, down: 0, same: 0 });
assert.strictEqual(vsPrev(sessions[2]).first, true, 'another workout is never "last time"');

// ── New bests ──
const pb = J(sessionBests(today));
assert.deepStrictEqual(pb.map(p => p.name), ['Squat', 'Dips'], 'Leg Curl tied, Lunge is a first');
assert.deepStrictEqual(pb[0], { name: 'Squat', kind: 'weight', v: 82.3, prev: 79.2, top: { kg: 65, reps: 8 } });
assert.deepStrictEqual(pb[1], { name: 'Dips', kind: 'bodyweight', v: 14, prev: 12, top: null });
assert.deepStrictEqual(J(sessionBests(sessions[0])), [], 'the first session has nothing to beat');
assert.deepStrictEqual(J(sessionBests(sessions[2])), [], 'activities have no bests');
// A later session doesn't count against an earlier one
assert.deepStrictEqual(J(sessionBests(sessions[1])).map(p => p.name), ['Squat'], 'b: 62.5x8 beat a, whatever came after');

console.log('session tests pass');
