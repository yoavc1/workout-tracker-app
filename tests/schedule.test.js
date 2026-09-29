// Unit tests for the plan logic in js/schedule.js: planned days, moves, done and missed days, workout colours.
// Usage: node tests/schedule.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const APP = ['data.js', 'sync.js', 'stats.js', 'schedule.js'];
const J = x => JSON.parse(JSON.stringify(x));
const eq = (a, b, msg) => assert.deepStrictEqual(J(a), J(b), msg);

// Fixed dates: Monday 21 Sep 2026 to Wednesday 30 Sep 2026, with "today" passed in explicitly where it matters.
// Sessions are stored as ISO timestamps; `at` builds one at a local hour, so the tests hold in any time zone.
const at = (day, h = 12, min = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, h, min).toISOString(); };
const S = (day, workout, exercises = { Squat: [{ kg: 60, reps: 8 }] }, h) => ({ id: 's' + day + workout, mt: 1, workout, date: at(day, h), exercises });
const week = { Mon: 'Legs', Tue: '', Wed: 'Upper Pull', Thu: '', Fri: 'Upper Push', Sat: '', Sun: '' };
const workouts = { Legs: ['Squat'], 'Upper Pull': ['Row'], 'Upper Push': ['Dips'], 'Muay Thai': ['Pads'] };
const base = () => ({
  sessions: [S('2026-09-21', 'Legs'), S('2026-09-23', 'Upper Pull'), S('2026-09-26', 'Upper Push')], // Fri 25 skipped, made up Sat
  workouts, wm: 1, schedule: { week, wkm: 5, moves: {} },
});
const TODAY = '2026-09-29'; // a Tuesday; Monday 28 (Legs) was missed
const app = loadApp(APP, { ironlog_data: JSON.stringify(base()) });
const { plannedOn, isDone, missedOn, missedDays, dayLog, wColor, dname, addD, dow, mergeD } = app;

// Date helpers work on local days
assert.strictEqual(dow('2026-09-28'), 0, '28 Sep 2026 is a Monday'); assert.strictEqual(dow('2026-09-27'), 6);
assert.strictEqual(addD('2026-09-30', 1), '2026-10-01'); assert.strictEqual(addD('2026-03-01', -1), '2026-02-28');
assert.strictEqual(addD('2026-03-28', 1), '2026-03-29', 'across a DST change');

// plannedOn: the weekly plan repeats by weekday; Rest ('') plans nothing
let d = base();
eq(plannedOn('2026-09-28', d), ['Legs']); eq(plannedOn('2026-09-21', d), ['Legs']);
eq(plannedOn('2026-09-29', d), [], 'Tuesday is a rest day'); eq(plannedOn('2026-09-30', d), ['Upper Pull']);
eq(plannedOn('2026-09-28', { sessions: [] }), [], 'no plan at all');

// isDone: a session of that workout on that local day
assert.strictEqual(isDone('2026-09-21', 'Legs', d), true);
assert.strictEqual(isDone('2026-09-21', 'Upper Pull', d), false, 'another workout does not count');
assert.strictEqual(isDone('2026-09-22', 'Legs', d), false, 'another day does not count');
const late = { sessions: [S('2026-09-28', 'Legs', undefined, 23)] }, early = { sessions: [{ id: 'e', workout: 'Legs', date: at('2026-09-29', 0, 30), exercises: {} }] };
assert.strictEqual(isDone('2026-09-28', 'Legs', late), true, '11pm still counts for that day');
assert.strictEqual(isDone('2026-09-28', 'Legs', early), false, '00:30 the next morning is the next day');

// missedOn: planned and not logged that day (what the calendar's red dot shows)
eq(missedOn('2026-09-28', d), ['Legs']);
eq(missedOn('2026-09-25', d), ['Upper Push'], 'Friday was missed, even though Saturday made it up');
eq(missedOn('2026-09-21', d), [], 'done'); eq(missedOn('2026-09-22', d), [], 'rest day');
eq(missedOn('2026-09-14', d), [], 'days before the first logged session never count');
eq(missedOn('2026-09-28', { sessions: [], schedule: { week } }), [], 'nothing logged ever: nothing missed');

// missedDays: the last n days before today that still need doing
eq(missedDays(3, d, TODAY), [{ day: '2026-09-28', workout: 'Legs' }]);
eq(missedDays(4, d, TODAY), [{ day: '2026-09-28', workout: 'Legs' }], 'Friday was made up by the Upper Push on Saturday');
eq(missedDays(3, d, '2026-09-28'), [], 'today itself is never missed');
eq(missedDays(7, d, TODAY).map(x => x.day), ['2026-09-28'], 'Mon 21 and Wed 23 were done');
d.sessions.push(S('2026-09-29', 'Legs'));
eq(missedDays(3, d, TODAY), [], 'doing Legs today makes Monday up');

// Roadmap "done when": a missed Monday leg day moved to Tuesday is planned on Tuesday and no longer missed
d = base();
d.schedule.moves.mv1 = { id: 'mv1', mt: 10, from: '2026-09-28', to: '2026-09-29', workout: 'Legs' };
eq(plannedOn('2026-09-29', d), ['Legs']); eq(plannedOn('2026-09-28', d), [], 'moved away from Monday');
eq(missedOn('2026-09-28', d), []); eq(missedDays(3, d, TODAY), []);
eq(missedDays(3, d, '2026-09-30'), [{ day: '2026-09-29', workout: 'Legs' }], 'if Tuesday passes too, Tuesday is the missed day');
d.sessions.push(S('2026-09-29', 'Legs'));
eq(missedDays(3, d, '2026-09-30'), []); assert.strictEqual(isDone('2026-09-29', 'Legs', d), true);

// Moving to a day that already has workouts adds to it, once; moving on again leaves it only on the last day
d = base();
d.schedule.moves.a = { id: 'a', mt: 10, from: '2026-09-28', to: '2026-09-30', workout: 'Legs' };
eq(plannedOn('2026-09-30', d), ['Upper Pull', 'Legs']);
d.schedule.moves.b = { id: 'b', mt: 11, from: '2026-09-28', to: '2026-09-30', workout: 'Legs' };
eq(plannedOn('2026-09-30', d), ['Upper Pull', 'Legs'], 'a double tap does not plan it twice');
d = base();
d.schedule.moves.a = { id: 'a', mt: 10, from: '2026-09-28', to: '2026-09-29', workout: 'Legs' };
d.schedule.moves.b = { id: 'b', mt: 20, from: '2026-09-29', to: '2026-09-30', workout: 'Legs' };
eq([plannedOn('2026-09-28', d), plannedOn('2026-09-29', d), plannedOn('2026-09-30', d)], [[], [], ['Upper Pull', 'Legs']], 'Mon → Tue → Wed');
eq(plannedOn('2026-10-05', d), ['Legs'], 'the next Monday is planned as usual');

// Through the data helpers: addMove syncs as a record, delMove (undo) leaves a tombstone
const dev = loadApp(APP, { ironlog_data: JSON.stringify(base()) });
const id = dev.addMove('2026-09-28', TODAY, 'Legs');
eq(dev.missedDays(3, null, TODAY), []); eq(dev.plannedOn(TODAY), ['Legs']);
const other = mergeD(J(base()), J(dev.gd()));
eq(plannedOn(TODAY, other), ['Legs'], 'another device sees the move after a sync');
dev.delMove(id);
eq(dev.missedDays(3, null, TODAY), [{ day: '2026-09-28', workout: 'Legs' }], 'undo');
assert.ok(dev.gd().deleted[id]);
eq(plannedOn(TODAY, mergeD(J(other), J(dev.gd()))), [], 'the undo reaches the other device too');

// dayLog: what the old heatmap pop-up showed, per session
d = { sessions: [
  S('2026-09-21', 'Legs', { Squat: [{ kg: 60, reps: 8 }], Curl: [{ kg: 30, reps: 10 }], Calf: [{ kg: 50, reps: 12 }], Lunge: [{ kg: 20, reps: 10 }] }),
  S('2026-09-28', 'Legs', { Squat: [{ kg: 62.5, reps: 8 }], Curl: [{ kg: 30, reps: 8 }], Calf: [{ kg: 50, reps: 12 }], Press: [{ kg: 90, reps: 10 }] }),
  S('2026-09-28', 'Muay Thai', { Pads: [{ kg: 0, reps: 0 }] }, 19),
] };
eq(dayLog('2026-09-28', d), [{ workout: 'Legs', first: false, up: 1, down: 1, same: 1 }, { workout: 'Muay Thai', first: true, up: 0, down: 0, same: 0 }]);
eq(dayLog('2026-09-21', d), [{ workout: 'Legs', first: true, up: 0, down: 0, same: 0 }]);
eq(dayLog('2026-09-22', d), []);

// wColor: by position in the saved workouts, so it's stable and a rename keeps it; unknown names are grey
assert.strictEqual(wColor('Legs', workouts), 'var(--w1)'); assert.strictEqual(wColor('Muay Thai', workouts), 'var(--w4)');
assert.strictEqual(wColor('Leg Day', { 'Leg Day': [], 'Upper Pull': [], 'Upper Push': [], 'Muay Thai': [] }), 'var(--w1)', 'renamed in place');
assert.strictEqual(wColor('Swimming', workouts), 'var(--t3)');
const nine = {}; for (let i = 1; i <= 9; i++) nine['W' + i] = [];
assert.strictEqual(wColor('W8', nine), 'var(--w8)'); assert.strictEqual(wColor('W9', nine), 'var(--w1)', 'wraps after 8');
assert.strictEqual(wColor('Upper Push'), 'var(--w3)', 'reads the saved workouts by default');

// dname: how the Today card names nearby days
eq(['2026-09-28', '2026-09-29', '2026-09-30', '2026-09-26'].map(x => dname(x, TODAY)), ['yesterday', 'today', 'tomorrow', 'Saturday']);

console.log('schedule tests pass');
