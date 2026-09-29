// Unit tests for Progress v2: the stats behind it (js/stats.js) and the pure helpers in js/progress.js.
// Usage: node tests/progress.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const { progressSeed } = require('./progress-seed');
const J = x => JSON.parse(JSON.stringify(x));
const FILES = ['data.js', 'sync.js', 'stats.js', 'ui.js', 'progress.js'];
const DAY = 864e5;

// A fixed "now" keeps every window check exact: Tue 29 Sep 2026, 20:00 local
const NOW = new Date(2026, 8, 29, 20).getTime();
const at = daysAgo => new Date(NOW - daysAgo * DAY).toISOString();
let sid = 0;
const S = (daysAgo, exercises, workout = 'W') => ({ id: 'x' + (++sid), mt: 1, workout, date: at(daysAgo), exercises });
const W = (kg, ...reps) => reps.map(r => ({ kg, reps: r }));
const B = (...reps) => reps.map(r => ({ kg: 0, reps: r }));
const app = loadApp(FILES, {});
const { exStats, groupStats, groupStatus, groupTrend, pctChange, trainFreq, status, ST, pgTicks, pgRange, pgPace, pgDay } = app;
const pts = vs => vs.map(([d, v]) => ({ t: NOW - d * DAY, v }));

// ── pctChange: latest session vs the last one at least `days` before now ──
assert.strictEqual(pctChange(pts([[40, 100], [30, 104], [2, 110]]), 28, NOW), 5.8, 'baseline is the last session before the window (30 days ago: 104)');
assert.strictEqual(pctChange(pts([[60, 100], [2, 90]]), 28, NOW), -10);
assert.strictEqual(pctChange(pts([[20, 100], [2, 110]]), 28, NOW), null, 'no session before the window');
assert.strictEqual(pctChange(pts([[60, 100], [40, 110]]), 28, NOW), null, 'nothing inside the window');
assert.strictEqual(pctChange(pts([[2, 110]]), 28, NOW), null, 'one session');

// ── exStats: one entry per lift, judged on its current kind ──
let d = {
  sessions: [
    S(70, { 'Bench Press': W(40, 8), 'Leg Raise': B(10) }), S(50, { 'Bench Press': W(42.5, 8), 'Leg Raise': B(12) }), S(30, { 'Bench Press': W(45, 8, 6) }),
    S(20, { 'Bench Press': W(45, 8) }), S(10, { 'Bench Press': W(45, 7), Dips: B(12) }), S(3, { 'Bench Press': W(45, 8), Dips: W(10, 8) }),
    S(5, { 'Session Complete': W(0, 0) }, 'Muay Thai'), S(4, { Placeholder: W(0, 0), Plank: [{ secs: 45 }] }), S(1, { Plank: [{ secs: 60 }] }),
  ],
};
let ex = J(exStats(d, NOW));
assert.deepStrictEqual(Object.keys(ex).sort(), ['Bench Press', 'Dips', 'Leg Raise', 'Plank'], 'activities and all-zero entries left out');
assert.strictEqual(ex['Bench Press'].kind, 'weight'); assert.strictEqual(ex['Bench Press'].cur, 57); assert.strictEqual(ex['Bench Press'].best, 57);
assert.deepStrictEqual(ex['Bench Press'].top, { kg: 45, reps: 8 });
assert.strictEqual(ex['Bench Press'].status, 'stalled', '45x8 first hit 30 days ago, 3 sessions since'); assert.strictEqual(ex['Bench Press'].since, 3);
assert.strictEqual(ex['Bench Press'].bestT, NOW - 30 * DAY);
assert.strictEqual(ex['Bench Press'].change, 0, 'vs 45x8 30 days ago');
assert.strictEqual(ex['Bench Press'].idle, false);
assert.deepStrictEqual([ex['Bench Press'].main, ex['Bench Press'].sub], ['Chest', 'Middle']);
assert.strictEqual(ex['Leg Raise'].kind, 'bodyweight'); assert.strictEqual(ex['Leg Raise'].idle, true, 'not trained for 50 days');
assert.strictEqual(ex.Plank.kind, 'time'); assert.strictEqual(ex.Plank.cur, 60); assert.strictEqual(ex.Plank.status, 'progressing');
// Weighted dips after bodyweight dips: only the weighted session counts, so it's one "new" session, not a drop from 12 reps
assert.strictEqual(ex.Dips.kind, 'weight'); assert.strictEqual(ex.Dips.pts.length, 1); assert.strictEqual(ex.Dips.status, 'new');
assert.strictEqual(status('Dips', d), 'new', 'status() judges the current kind too');

// ── groupStatus: exercises trained lately vote ──
const E = (status, idle = false) => ({ status, idle });
assert.strictEqual(groupStatus([E('progressing'), E('progressing'), E('stalled')]), 'progressing');
assert.strictEqual(groupStatus([E('progressing'), E('regressing')]), 'stalled', 'mixed is not clearly moving');
assert.strictEqual(groupStatus([E('progressing'), E('stalled')]), 'stalled');
assert.strictEqual(groupStatus([E('regressing'), E('regressing'), E('stalled')]), 'regressing');
assert.strictEqual(groupStatus([E('regressing'), E('progressing', true), E('progressing', true)]), 'regressing', 'idle exercises have no vote');
assert.strictEqual(groupStatus([E('progressing', true)]), 'idle');
assert.strictEqual(groupStatus([E('new'), E('steady')]), 'new');
assert.strictEqual(groupStatus([E('progressing'), E('new')]), 'progressing', 'new/steady have no vote');
assert.strictEqual(groupTrend([{ idle: false, pts: pts([[50, 100], [1, 110]]) }, { idle: false, pts: pts([[50, 50], [1, 49]]) }, { idle: true, pts: pts([[50, 10], [30, 20]]) }], NOW), 4, 'mean of +10% and -2%; idle left out');
assert.strictEqual(groupTrend([{ idle: false, pts: pts([[5, 100]]) }], NOW), null);

// ── groupStats on six months of seeded data ──
d = progressSeed(NOW);
ex = exStats(d, NOW);
let G = J(groupStats(ex, d, NOW));
const byMain = Object.fromEntries(G.map(g => [g.main, g]));
assert.deepStrictEqual(G.map(g => g.main), ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'], 'MUSCLES order');
assert.deepStrictEqual(G.map(g => g.status), ['progressing', 'stalled', 'stalled', 'stalled', 'progressing', 'idle']);
assert.deepStrictEqual(byMain.Shoulders.subs.map(s => [s.sub, s.status]), [['Front', 'stalled'], ['Side', 'progressing'], ['Rear', 'regressing']]);
assert.deepStrictEqual(byMain.Back.subs.map(s => s.sub), ['Upper lats', 'Lower lats', 'Mid back', 'Traps'], 'only trained sub-groups, in order');
assert.strictEqual(byMain.Back.subs.find(s => s.sub === 'Traps').status, 'idle', 'shrugs stopped 5 weeks ago');
assert.strictEqual(byMain.Core.trend, null); assert.strictEqual(byMain.Core.spw, 0);
// Sets per week: every set of the group in the last 28 days, divided by 4
const from = NOW - 28 * DAY; let chest = 0;
d.sessions.forEach(s => { if (new Date(s.date).getTime() < from) return; Object.keys(s.exercises).forEach(x => { if (ex[x] && ex[x].main === 'Chest') chest += s.exercises[x].length; }); });
assert.ok(chest > 0); assert.strictEqual(byMain.Chest.spw, Math.round(chest / 4 * 10) / 10);
assert.ok(byMain.Chest.trend > 0 && byMain.Arms.trend < 0, 'trend sign follows the lifts');
// Activities count as sessions, never as sets
assert.deepStrictEqual(J(trainFreq(d, 28, NOW)), { lifts: 12, acts: 6 });
// An override moves an exercise (and its sets) to another group
const dips = d.sessions.filter(s => s.exercises.Dips && new Date(s.date).getTime() >= from).reduce((a, s) => a + s.exercises.Dips.length, 0);
d.muscles = { Dips: 'Arms/Triceps' };
const G2 = J(groupStats(exStats(d, NOW), d, NOW)), arms2 = G2.find(g => g.main === 'Arms');
assert.ok(arms2.subs.find(s => s.sub === 'Triceps').ex.includes('Dips'));
assert.ok(!G2.find(g => g.main === 'Chest').subs.some(s => s.sub === 'Lower'), 'Chest · Lower now empty');
assert.strictEqual(Math.round((arms2.spw - byMain.Arms.spw) * 4), dips, 'dips sets moved to Arms');
// Unknown names go to Other, after the real groups
G = J(groupStats(exStats({ sessions: [S(3, { 'Sled Push': W(80, 10) }), S(2, { Squat: W(60, 5) })] }, NOW), { sessions: [S(3, { 'Sled Push': W(80, 10) }), S(2, { Squat: W(60, 5) })] }, NOW));
assert.deepStrictEqual(G.map(g => g.main), ['Legs', 'Other']);

// ── Chart axis helpers ──
const labels = (a, b) => J(pgTicks(a, b)).map(t => t.l);
const T = (y, m, dd) => new Date(y, m - 1, dd).getTime();
const mon = m => new Date(2026, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
let tk = J(pgTicks(T(2026, 8, 29), T(2026, 9, 29)));
assert.ok(tk.every(t => new Date(t.v).getDay() === 1), '1 month: Mondays'); assert.deepStrictEqual(tk.map(t => t.l), ['31 ' + mon(8), '7 ' + mon(9), '14 ' + mon(9), '21 ' + mon(9), '28 ' + mon(9)]);
assert.deepStrictEqual(labels(T(2026, 6, 20), T(2026, 9, 29)), [mon(7), mon(8), mon(9)], '3 months: month starts, no year');
assert.deepStrictEqual(labels(T(2025, 11, 20), T(2026, 3, 1)), [mon(12) + ' ’25', mon(1) + ' ’26', mon(2) + ' ’26', mon(3) + ' ’26'], 'year added when the range spans two years');
assert.deepStrictEqual(labels(T(2025, 12, 20), T(2026, 1, 20)), ['22 ' + mon(12) + ' ’25', '29 ' + mon(12) + ' ’25', '5 ' + mon(1) + ' ’26', '12 ' + mon(1) + ' ’26', '19 ' + mon(1) + ' ’26']);
tk = J(pgTicks(T(2024, 3, 10), T(2026, 9, 29)));
assert.ok(tk.length <= 8 && tk.length >= 4, 'long ranges thin out to a few ticks: ' + tk.length);
assert.ok(tk.every(t => new Date(t.v).getDate() === 1 && new Date(t.v).getMonth() % 5 === 0), 'every 5th month for 2.5 years');
// Ranges end today, 3M starts 3 calendar months back; All starts at the first session; at least 2 weeks wide
let r = J(pgRange([], '3M', NOW)), pad = (NOW - new Date(2026, 5, 29, 20).getTime()) * 0.03;
assert.deepStrictEqual(r, [new Date(2026, 5, 29, 20).getTime() - pad, NOW + pad]);
r = J(pgRange(pts([[300, 1], [2, 2]]), 'ALL', NOW)); assert.ok(Math.abs(r[0] - (NOW - 300 * DAY) + 9 * DAY) < DAY);
r = J(pgRange(pts([[2, 1]]), 'ALL', NOW)); assert.ok(r[1] - r[0] >= 14 * DAY);
// Goal pace line: straight from start to target, clipped to the visible range
assert.strictEqual(pgDay('2026-09-29'), T(2026, 9, 29), 'YYYY-MM-DD is a local day');
const g = { startKg: 40, startDate: '2026-04-01', targetKg: 65, targetDate: '2026-10-01' };
let pace = J(pgPace(g, T(2026, 7, 1), T(2026, 9, 1)));
const kgAt = t => Math.round((40 + 25 * (t - T(2026, 4, 1)) / (T(2026, 10, 1) - T(2026, 4, 1))) * 10) / 10;
assert.deepStrictEqual(pace, [{ x: T(2026, 7, 1), y: kgAt(T(2026, 7, 1)) }, { x: T(2026, 9, 1), y: kgAt(T(2026, 9, 1)) }]);
assert.deepStrictEqual(J(pgPace(g, T(2026, 1, 1), T(2027, 1, 1))), [{ x: T(2026, 4, 1), y: 40 }, { x: T(2026, 10, 1), y: 65 }]);
assert.strictEqual(pgPace(g, T(2026, 11, 1), T(2027, 1, 1)), null, 'goal ended before the range');
assert.strictEqual(pgPace({ startKg: 40, startDate: '2026-10-01', targetKg: 65, targetDate: '2026-04-01' }, 0, NOW), null);

// ── Merge into… ──
const store = {
  ironlog_data: JSON.stringify({
    sessions: [
      S(40, { 'Seated Machine Leg Curl': W(30, 10), Squat: W(60, 5) }, 'Legs'),
      S(30, { 'Seated Machine Leg Curl': W(32.5, 10) }, 'Legs'),
      S(20, { Squat: W(62.5, 5), 'Seated Hamstring Curl': W(35, 10), 'Seated Machine Leg Curl': W(30, 12) }, 'Legs'),
      S(10, { 'Seated Hamstring Curl': W(37.5, 10) }, 'Legs'),
    ],
    workouts: { Legs: ['Seated Machine Leg Curl', 'Squat', 'Seated Hamstring Curl'], Other: ['Squat', 'Seated Machine Leg Curl'], Arms: ['Curl'] },
    goals: [{ id: 'g1', mt: 1, exercise: 'Seated Machine Leg Curl', startKg: 30, startDate: '2026-08-01', targetKg: 40, targetDate: '2026-12-01' }],
    muscles: { 'Seated Machine Leg Curl': 'Legs/Glutes' }, mm: 5,
  }),
};
const m = loadApp(FILES, store);
assert.strictEqual(m.pgMergeEx('Seated Machine Leg Curl', 'Seated Hamstring Curl'), 3);
const md = J(m.gd());
assert.ok(!md.sessions.some(s => s.exercises['Seated Machine Leg Curl']), 'old name gone from history');
assert.deepStrictEqual(md.sessions[2].exercises, { Squat: W(62.5, 5), 'Seated Hamstring Curl': W(35, 10).concat(W(30, 12)) }, 'a session with both keeps one entry');
assert.deepStrictEqual(md.workouts, { Legs: ['Seated Hamstring Curl', 'Squat'], Other: ['Squat', 'Seated Hamstring Curl'], Arms: ['Curl'] }, 'saved workouts: renamed in place, never listed twice');
assert.ok(md.wm > 5);
assert.strictEqual(md.goals[0].exercise, 'Seated Hamstring Curl', 'goal follows');
assert.deepStrictEqual(md.muscles, { 'Seated Hamstring Curl': 'Legs/Glutes' }, 'override follows when the target has none');
assert.strictEqual(m.exerciseSeries('Seated Hamstring Curl').length, 4, 'one chart');
// Nothing in saved workouts to change: the workouts document keeps its timestamp
const wm = md.wm; m.pgMergeEx('Squat', 'Back Squat');
assert.strictEqual(J(m.gd()).wm >= wm, true); assert.deepStrictEqual(J(m.gd()).workouts.Legs, ['Seated Hamstring Curl', 'Back Squat']);
const wm2 = J(m.gd()).wm; m.pgMergeEx('Nothing Here', 'Squat');
assert.strictEqual(J(m.gd()).wm, wm2, 'no template change, no template write');

console.log('progress tests pass');
