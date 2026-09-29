// Unit tests for the smart banner's alert engine in js/alerts.js: each alert type, its thresholds on both sides,
// priority order, the old insights bugs it fixes, and snoozes. Usage: node tests/alerts.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const app = loadApp(['data.js', 'sync.js', 'stats.js', 'ui.js', 'schedule.js', 'goals.js', 'core.js', 'alerts.js']);
app.eh = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // no DOM here
const { buildAlerts, muscleOf, addD, snooze, gSnz, AL } = app;
const J = x => JSON.parse(JSON.stringify(x));

// "Now" is Wednesday 30 Sep 2026 at 18:00; this week started on Monday 28 Sep. Sessions sit at local noon n days back.
const NOW = new Date(2026, 8, 30, 18).getTime(), TODAY = '2026-09-30';
const at = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
let sid = 0;
const S = (n, workout, exercises) => ({ id: 's' + sid++, mt: 1, workout, date: at(addD(TODAY, -n)), exercises });
const W = (kg, reps = 10) => [{ kg, reps }, { kg, reps }];
const WK = { 'Upper Pull': ['Cable Face Pulls', 'Lat Pulldown Machine (Uni Lateral)', 'Chest Supported Seated Row (Tucked Elbow)'], 'Upper Push': ['Incline Chest Press (Smith/Machine)', 'Dips'], Legs: ['Seated Machine Leg Extension', 'Seated Hamstring Curl'] };
const D = (sessions, more = {}) => Object.assign({ sessions, workouts: WK, goals: [], core: {}, muscles: {} }, more);
const all = d => J(buildAlerts(d, NOW));
const find = (d, id) => all(d).filter(a => a.id === id)[0];
const ids = d => all(d).map(a => a.id);

assert.deepStrictEqual(all(D([])), [], 'no data, no alerts');

// ── 2 · A muscle sub-group neglected, against your own rhythm for it ──
assert.deepStrictEqual(J(muscleOf('Cable Face Pulls', {})), { main: 'Shoulders', sub: 'Rear' });
const fp = n => S(n, 'Upper Pull', { 'Cable Face Pulls': W(20, 12) });
const every5 = last => [0, 5, 10, 15, 20, 25].map(k => fp(last + 25 - k));   // six sessions 5 days apart, the last `last` days ago
let a = find(D(every5(12)), 'neg:Shoulders/Rear');
assert.deepStrictEqual(a, { id: 'neg:Shoulders/Rear', pri: 2, kind: 'warn', icon: '⚠️', title: 'Shoulders · Rear',
  text: 'No sets in 12 days (usually every 5). Cable Face Pulls', act: { label: 'Start Upper Pull', go: 'start', arg: 'Upper Pull' }, since: 12 }, 'the roadmap example');
assert.ok(!find(D(every5(9)), 'neg:Shoulders/Rear'), 'not before twice the usual gap');
assert.ok(find(D(every5(10)), 'neg:Shoulders/Rear'), 'at twice the usual gap');
assert.ok(!find(D(every5(AL.NEG_MAX + 1)), 'neg:Shoulders/Rear'), 'after 6 weeks it counts as dropped, not neglected');
const every2 = last => [0, 2, 4, 6].map(k => fp(last + 6 - k));
assert.ok(!find(D(every2(6)), 'neg:Shoulders/Rear') && find(D(every2(7)), 'neg:Shoulders/Rear'), 'never before 7 days, even for a short usual gap');
assert.ok(!find(D([fp(30), fp(20)]), 'neg:Shoulders/Rear'), 'a usual gap needs 3+ training days');
// Names the 1–2 exercises behind it, most recent first; with none in a saved workout it offers Progress instead
const rear = (n, x) => S(n, 'Upper Pull', { [x]: W(15, 12) });
a = find(D([rear(40, 'Reverse Cable Fly'), rear(35, 'Cable Face Pulls'), rear(30, 'Rear Delt Row'), rear(25, 'Reverse Cable Fly'), rear(20, 'Cable Face Pulls')], { workouts: {} }), 'neg:Shoulders/Rear');
assert.strictEqual(a.text, 'No sets in 20 days (usually every 5). Cable Face Pulls, Reverse Cable Fly');
assert.deepStrictEqual(a.act, { label: 'See progress', go: 'prog', arg: 'Cable Face Pulls' });
// Activities (Muay Thai, Swimming) never trigger it
const mt = n => S(n, 'Muay Thai', { 'Session Complete': [{ kg: 0, reps: 0 }] });
assert.deepStrictEqual(ids(D([mt(40), mt(30), mt(20), mt(15)])), [], 'activities alone raise nothing');
// Names are escaped
a = find(D(every5(12).map(s => ({ ...s, exercises: { 'Face <b>Pulls</b>': s.exercises['Cable Face Pulls'] } })), { muscles: { 'Face <b>Pulls</b>': 'Shoulders/Rear' } }), 'neg:Shoulders/Rear');
assert.ok(/Face &lt;b&gt;Pulls/.test(a.text), a.text);

// ── 3 · Slow overload: a group well below your average progress over 6 weeks ──
// Chest and Legs +10%; Back +1% (lat pulldown +2%, row flat); the baseline session is 7 weeks ago
const CH = 'Incline Chest Press (Smith/Machine)', LE = 'Seated Machine Leg Extension', LAT = 'Lat Pulldown Machine (Uni Lateral)', ROW = 'Chest Supported Seated Row (Tucked Elbow)';
assert.deepStrictEqual([CH, LE, LAT, ROW].map(x => muscleOf(x, {}).main), ['Chest', 'Legs', 'Back', 'Back']);
const trio = (n, ch, le, lat, row) => [S(n, 'Upper Push', { [CH]: W(ch) }), S(n, 'Legs', { [LE]: W(le) }), S(n, 'Upper Pull', { [LAT]: W(lat), [ROW]: W(row) })];
const slow = [...trio(49, 30, 60, 30, 60), ...trio(35, 31, 62, 30.2, 60), ...trio(21, 32, 64, 30.4, 60), ...trio(7, 33, 66, 30.6, 60)];
a = find(D(slow), 'slow:Back');
assert.deepStrictEqual(a, { id: 'slow:Back', pri: 3, kind: 'warn', icon: '📉', title: 'Back',
  text: 'Progressing at under a fifth of your average (+1% vs +7% over 6 weeks). Stalled: ' + ROW, act: { label: 'See progress', go: 'prog', arg: ROW } });
assert.ok(!find(D(slow), 'slow:Chest') && !find(D(slow), 'slow:Legs'), 'groups at or above half the average are fine');
// Needs 3+ days of that group inside the 6 weeks
assert.ok(!find(D(slow.filter(s => !(s.workout === 'Upper Pull' && s.date === at(addD(TODAY, -21))))), 'slow:Back'), 'only 2 days of Back');
// A group gaining 3%+ is doing fine even below half the average: Back +4% (lat +8%, row flat) against Chest +10% and Legs +20%
const fine = [...trio(49, 30, 60, 30, 60), ...trio(35, 31, 64, 31, 60), ...trio(21, 32, 68, 32, 60), ...trio(7, 33, 72, 32.4, 60)];
assert.ok(!ids(D(fine)).some(x => /^slow:/.test(x)), 'no slow alert for +4%: ' + ids(D(fine)));
// One group alone has no average to compare with
assert.ok(!ids(D(slow.filter(s => s.workout === 'Upper Pull'))).some(x => /^slow:/.test(x)));

// ── 4 · Goal behind its straight-line pace ──
// 40 → 65 kg over 183 days, 61 days in: the pace says 48.3 kg today, and "on track" allows ±2.5 kg
const goal = { id: 'g1', mt: 1, exercise: CH, startKg: 40, startDate: addD(TODAY, -61), targetKg: 65, targetDate: addD(TODAY, 122), archived: false };
const top = kg => [S(3, 'Upper Push', { [CH]: W(kg, 8) })];
a = find(D(top(44), { goals: [goal] }), 'goal:g1');
assert.deepStrictEqual(a, { id: 'goal:g1', pri: 4, kind: 'warn', icon: '🎯', title: CH, text: '44 kg now, should be ~48.5 kg by today', act: { label: 'View goal', go: 'goal', arg: 'g1' } });
assert.ok(!find(D(top(46), { goals: [goal] }), 'goal:g1'), 'within 2.5 kg of the pace is on track');
assert.ok(!find(D(top(44), { goals: [{ ...goal, archived: true }] }), 'goal:g1'), 'archived goals stay quiet');

// ── 5 · Stalled: no new best in 4 sessions ──
const HAM = 'Seated Hamstring Curl';
const ham = kgs => kgs.map((kg, i) => S(3 + 3 * (kgs.length - 1 - i), 'Legs', { [HAM]: W(kg) }));
a = find(D(ham([40, 45, 44, 44, 43, 44])), 'stall');
assert.deepStrictEqual(a, { id: 'stall', pri: 5, kind: 'info', icon: '⏸️', title: HAM, text: 'No new best in 4 sessions', act: { label: 'See progress', go: 'prog', arg: HAM } });
assert.ok(!find(D(ham([40, 45, 44, 43, 44])), 'stall'), '3 sessions without a best is not yet stalled');
assert.ok(!find(D(ham([40, 45, 44, 44, 43, 44]).map(s => ({ ...s, date: new Date(new Date(s.date) - 30 * 864e5).toISOString() }))), 'stall'), 'not trained lately: nothing to nag about');
const both = [...ham([40, 45, 44, 44, 43, 44]), ...[50, 55, 54, 54, 54, 53, 54].map((kg, i) => S(4 + 3 * (6 - i), 'Legs', { [LE]: W(kg) }))];
a = find(D(both), 'stall');
assert.strictEqual(a.title, '2 exercises stalled');
assert.strictEqual(a.text, 'No new best in 4+ sessions: ' + LE + ', ' + HAM, 'longest stall first');
assert.strictEqual(a.act.arg, null);

// ── 6 · Core not done for 4+ days (only once core has been logged at all) ──
const core = day => ({ ['c' + day]: { id: 'c' + day, mt: 1, date: day, done: true } });
assert.deepStrictEqual(find(D([], { core: core(addD(TODAY, -5)) }), 'core'), { id: 'core', pri: 6, kind: 'info', icon: '💪', title: 'Core', text: 'Not done in 5 days', act: { label: 'Log core', go: 'core' } });
assert.ok(find(D([], { core: core(addD(TODAY, -4)) }), 'core') && !find(D([], { core: core(addD(TODAY, -3)) }), 'core'), '4 days is the line');
assert.ok(!find(D([]), 'core'), 'never logged: no nagging');
assert.ok(!find(D([], { core: { c2026: { id: 'x', mt: 1, date: addD(TODAY, -9), done: false } } }), 'core'), 'an unticked day is not core');

// ── 7 · Positive: a real best this week, and a streak ──
a = find(D([S(10, 'Upper Push', { [CH]: W(40) }), S(2, 'Upper Push', { [CH]: W(42.5) })]), 'pr:' + CH + ':2026-09-28');
assert.deepStrictEqual(a, { id: 'pr:' + CH + ':2026-09-28', pri: 7, kind: 'pos', icon: '🏆', title: 'New best: ' + CH, text: '42.5 kg × 10 (e1RM 56.7 kg)', act: { label: 'See progress', go: 'prog', arg: CH } });
// Old insights bug: the first time you logged an exercise counted as a "New PR"
assert.deepStrictEqual(ids(D([S(1, 'Upper Push', { [CH]: W(42.5) })])).filter(x => /^pr:/.test(x)), [], 'a first session is not a PR');
assert.deepStrictEqual(ids(D([S(10, 'Upper Push', { [CH]: W(40) }), S(3, 'Upper Push', { [CH]: W(42.5) })])).filter(x => /^pr:/.test(x)), [], 'last week is not this week (weeks start on Monday)');
a = all(D([S(10, 'Upper Push', { Dips: W(0, 10) }), S(1, 'Upper Push', { Dips: W(0, 12) })])).filter(x => /^pr:/.test(x.id))[0];
assert.strictEqual(a.text, '12 reps', 'bodyweight bests are in reps');
// Streak: 3 weeks in a row with 2+ training days (activities count); this week counts once it has 2 days
const days = ns => ns.map(n => mt(n));
assert.deepStrictEqual(find(D(days([2, 6, 8, 13, 15, 20, 22])), 'streak'), { id: 'streak', pri: 7, kind: 'pos', icon: '🔥', title: '3 weeks in a row', text: 'with 2+ training days each' });
assert.strictEqual(find(D(days([1, 2, 6, 8, 13, 15, 20, 22])), 'streak').title, '4 weeks in a row', 'this week joins once it has 2 days');
assert.ok(!find(D(days([6, 8, 13, 20, 22])), 'streak'), 'a week with one day breaks it');

// ── Order: warnings first (by type), then info, then positives ──
const mix = D([...every5(12), ...ham([40, 45, 44, 44, 43, 44]), S(10, 'Upper Push', { [CH]: W(40) }), S(2, 'Upper Push', { [CH]: W(42.5) })], { core: core(addD(TODAY, -6)), goals: [{ ...goal, exercise: 'Dips' }] });
assert.deepStrictEqual(ids(mix), ['neg:Shoulders/Rear', 'goal:g1', 'stall', 'core', 'pr:' + CH + ':2026-09-28', 'streak'], 'a Dips goal with no Dips logged is behind; these days also make a 3-week streak');

// ── Snooze: until tomorrow, on this device; only today's snoozes are kept ──
app.__store.ironlog_snooze = JSON.stringify({ core: '2020-01-01', stall: '2020-01-01' });
snooze('neg:Shoulders/Rear');
const today = app.lday(new Date());
assert.deepStrictEqual(J(gSnz()), { 'neg:Shoulders/Rear': today }, 'old snoozes are dropped');
snooze('core');
assert.deepStrictEqual(J(gSnz()), { 'neg:Shoulders/Rear': today, core: today });
app.__store.ironlog_snooze = '{not json';
assert.deepStrictEqual(J(gSnz()), {}, 'bad storage reads as no snoozes');

console.log('alerts tests pass');
