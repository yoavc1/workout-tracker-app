// Unit tests for js/coach.js: the summary the app sends for the Sheet's Coach tab. Usage: node tests/coach.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const FILES = ['data.js', 'sync.js', 'stats.js', 'ui.js', 'schedule.js', 'goals.js', 'core.js', 'alerts.js', 'coach.js'];
const J = x => JSON.parse(JSON.stringify(x));

// "Now" is Wednesday 30 Sep 2026 at 18:00; this week started on Monday 28 Sep. Sessions sit at local noon n days back.
const NOW = new Date(2026, 8, 30, 18).getTime(), TODAY = '2026-09-30';
const noon = (n, h = 12) => { const d = new Date(2026, 8, 30, h); d.setDate(d.getDate() - n); return d; };
let sid = 0;
const S = (n, workout, exercises, more) => Object.assign({ id: 's' + sid++, mt: 1, workout, date: noon(n).toISOString(), exercises, duration: 3000 }, more);
const W = (kg, reps = 10, n = 2) => Array.from({ length: n }, () => ({ kg, reps }));
const sessions = [
  // Rear delts every 5 days, the last 12 days ago: neglected (usual gap 5, so flagged from 10 days). No new best since the first.
  ...[12, 17, 22, 27, 32, 37].map(n => S(n, 'Upper Pull', { 'Cable Face Pulls': W(20, 12) })),
  // Squat climbing: progressing. The latest Legs (Saturday) was logged live: rests of 90 s and 2 min.
  S(19, 'Legs', { 'Squat - Dumbbell': W(50) }), S(14, 'Legs', { 'Squat - Dumbbell': W(52.5) }), S(9, 'Legs', { 'Squat - Dumbbell': W(55) }),
  S(4, 'Legs', { 'Squat - Dumbbell': [0, 90, 210].map(t => ({ kg: 57.5, reps: 10, at: noon(4, 18).getTime() + t * 1000 })) }, { duration: 2700 }),
  // Incline press behind its goal; dips (bodyweight) up in reps
  S(14, 'Upper Push', { 'Incline Chest Press (Smith/Machine)': W(40, 8), Dips: W(0, 12) }),
  S(7, 'Upper Push', { 'Incline Chest Press (Smith/Machine)': W(42, 8), Dips: W(0, 14) }),
  // A curl with an ampersand in its name: best first, then four sessions without beating it (stalled)
  ...[[20, 30], [15, 25], [10, 25], [5, 25], [1, 25]].map(([n, kg]) => S(n, 'Arms', { 'Curl & Press': W(kg) })),
  S(3, 'Muay Thai', { 'Session Complete': [{ kg: 0, reps: 0 }] }),
];
const data = {
  sessions, workouts: { Legs: ['Squat - Dumbbell'], 'Upper Pull': ['Cable Face Pulls'], 'Upper Push': ['Incline Chest Press (Smith/Machine)', 'Dips'] },
  // Legs every Monday, set a month ago: Monday 28 Sep was missed
  schedule: { week: { Mon: 'Legs' }, wkm: noon(30).getTime(), moves: {} },
  core: { 'c2026-09-29': { id: 'c2026-09-29', mt: 1, date: '2026-09-29', done: true, items: [] }, 'c2026-09-22': { id: 'c2026-09-22', mt: 1, date: '2026-09-22', done: true, items: [] } },
  goals: [{ id: 'g1', mt: 1, exercise: 'Incline Chest Press (Smith/Machine)', startKg: 40, startDate: '2026-08-31', targetKg: 70, targetDate: '2026-12-29', archived: false },
    { id: 'g2', mt: 1, exercise: 'Dips', startKg: 0, startDate: '2026-08-01', targetKg: 10, targetDate: '2026-09-01', archived: true }],
};
const app = loadApp(FILES, { ironlog_data: JSON.stringify(data) });
app.eh = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // no DOM here
const c = J(app.coachSummary(app.gd(), NOW));
const B = t => c.blocks.filter(b => b.title === t)[0];
const row = (t, first) => B(t).rows.filter(r => r[0] === first)[0];

// ── Shape: what the Apps Script writes as-is ──
assert.deepStrictEqual([c.v, c.today, c.asOf], [1, TODAY, '2026-09-30 18:00']);
assert.deepStrictEqual(c.blocks.map(b => b.title), ['About', 'Flags', 'Muscle groups', 'Exercises', 'Weekly volume', 'Goals', 'This week', 'Recent workouts']);
c.blocks.forEach(b => {
  assert.ok(b.header.length >= 2, b.title);
  b.rows.forEach(r => {
    assert.strictEqual(r.length, b.header.length, b.title + ': every row as wide as its header ' + JSON.stringify(r));
    r.forEach(v => assert.ok(typeof v === 'string' || (typeof v === 'number' && isFinite(v)), b.title + ': plain values only ' + JSON.stringify(r)));
  });
});
assert.ok(!/&amp;|&lt;|<\/?[a-z]/.test(JSON.stringify(c)), 'no HTML: the Sheet shows text as it is');

// ── About ──
assert.deepStrictEqual(row('About', 'Today'), ['Today', '2026-09-30 (Wednesday)']);
assert.deepStrictEqual(row('About', 'Logged'), ['Logged', '18 workouts since 2026-08-24 (17 lifting, 1 activity such as Muay Thai)']);
assert.ok(/^\d+ lifting workouts, 1 activity, 2 core days$/.test(row('About', 'Last 4 weeks')[1]), row('About', 'Last 4 weeks')[1]);

// ── Flags: the app's alerts, plus planned workouts missed and not made up ──
const fl = B('Flags').rows;
assert.deepStrictEqual(fl.filter(r => r[0] === 'Neglected'), [['Neglected', 'Shoulders · Rear', 'No sets in 12 days (usually every 5). Cable Face Pulls']]);
assert.deepStrictEqual(fl.filter(r => r[0] === 'Goal behind'), [['Goal behind', 'Incline Chest Press (Smith/Machine)', '42 kg now, should be ~47.5 kg by today']]);
assert.deepStrictEqual(fl.filter(r => r[0] === 'Stalled'), [['Stalled', '2 exercises stalled', 'No new best in 4+ sessions: Cable Face Pulls, Curl & Press']], 'escaped names come back plain');
assert.deepStrictEqual(fl.filter(r => r[0] === 'Missed plan'), [['Missed plan', 'Legs', 'Planned for 2026-09-28 (Monday), not done since']]);
assert.ok(fl.findIndex(r => r[0] === 'Neglected') < fl.findIndex(r => r[0] === 'Stalled'), 'most important first');
// Nothing to flag still says so
const quiet = J(loadApp(FILES, { ironlog_data: JSON.stringify({ sessions: [] }) }).coachSummary(null, NOW));
assert.deepStrictEqual(quiet.blocks[1].rows, [['None', '', 'Nothing flagged right now']]);
assert.ok(quiet.blocks.every(b => b.rows.length > 0 && b.rows.every(r => r.length === b.header.length)), 'an empty log still makes every table');

// ── Muscle groups and exercises, with the Progress screen's verdicts ──
assert.deepStrictEqual(B('Muscle groups').header, ['Group', 'Sub-group', 'Status', '6-week trend %', 'Sets per week', 'Last trained', 'Exercises']);
const legs = row('Muscle groups', 'Legs');
assert.deepStrictEqual([legs[1], legs[2], legs[5], legs[6]], ['', 'Progressing', '2026-09-26', 'Squat - Dumbbell']);
assert.ok(B('Muscle groups').rows.some(r => r[0] === 'Legs' && r[1] === 'Quads' && r[2] === 'Progressing'), 'sub-groups listed under their group');
const sq = row('Exercises', 'Squat - Dumbbell');
assert.deepStrictEqual(sq, ['Squat - Dumbbell', 'Legs · Quads', 'Progressing', 'e1RM kg', 76.7, 76.7, '2026-09-26', 0, '', '57.5 kg × 10', '2026-09-26', 4]);
assert.deepStrictEqual(row('Exercises', 'Dips').slice(2, 6), ['Progressing', 'reps', 14, 14], 'bodyweight measured in reps');
assert.deepStrictEqual(row('Exercises', 'Cable Face Pulls').slice(2, 4), ['Stalled', 'e1RM kg']);
assert.deepStrictEqual(B('Exercises').rows.map(r => r[1].split(' · ')[0]), ['Chest', 'Chest', 'Shoulders', 'Arms', 'Legs'], 'in muscle group order');

// ── Weekly volume: 8 weeks by Monday, this week last ──
const wv = B('Weekly volume');
assert.deepStrictEqual(wv.header, ['Week of', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
// Weeks of 14 Sep (n 10-16) and 21 Sep (n 3-9) had five workouts each, Muay Thai included; this week, one so far
assert.deepStrictEqual(row('Weekly volume', 'Workouts').slice(-3), [5, 5, 1]);
assert.deepStrictEqual(row('Weekly volume', 'Core days').slice(-2), [1, 1]);
assert.deepStrictEqual(row('Weekly volume', 'Legs sets').slice(-3), [2, 5, 0], 'two sets on the 21st, three in the live workout on the 26th');
assert.deepStrictEqual(wv.rows.map(r => r[0]), ['Workouts', 'Core days', 'Chest sets', 'Back sets', 'Shoulders sets', 'Arms sets', 'Legs sets'], 'Core and Other only once they have sets');

// ── Goals: active only, with the goal card's numbers ──
assert.deepStrictEqual(B('Goals').rows, [['Incline Chest Press (Smith/Machine)', 40, '2026-08-31', 70, '2026-12-29', 42, 47.5, 'Behind', 2.2, 90]]);
assert.ok(/1 archived goal not listed/.test(B('Goals').note));

// ── This week: plan, what was logged, core, missed ──
assert.deepStrictEqual(B('This week').rows.slice(0, 3), [
  ['Monday', '2026-09-28', 'Legs', '', '', 'Missed: Legs'],
  ['Tuesday', '2026-09-29', 'Rest', 'Arms', 'Yes', ''],
  ['Wednesday', '2026-09-30', 'Rest', '', '', 'Today']]);

// ── Recent workouts: newest first, rest, vs last time, new bests ──
const rw = B('Recent workouts').rows;
assert.deepStrictEqual(rw[0], ['2026-09-29', 'Arms', 50, 1, 2, 500, '', '0 up, 0 down, 1 same', '']);
assert.deepStrictEqual(rw.filter(r => r[1] === 'Muay Thai')[0], ['2026-09-27', 'Muay Thai', 50, 'Activity', '', '', '', '', '']);
assert.deepStrictEqual(rw.filter(r => r[0] === '2026-09-26')[0], ['2026-09-26', 'Legs', 45, 1, 3, 1725, '1:45', '1 up, 0 down, 0 same', 'Squat - Dumbbell: e1RM 76.7 kg (was 73.3)']);
assert.strictEqual(rw.length, 12);

console.log('coach tests pass');
