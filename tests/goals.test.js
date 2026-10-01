// Unit tests for the goal maths in js/goals.js: straight-line pace, status tolerance, "current" kg, reaching a target,
// date helpers and new-goal validation. Usage: node tests/goals.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const app = loadApp(['data.js', 'sync.js', 'stats.js', 'ui.js', 'goals.js']);
const { goalStatus, goalCur, goalHit, goalErr, goalGroup, goalGroups, goalKey, goalSort, goalEnd, goalMove, gMonths, gDays, bestRecent, lday, setMuscle, gd, GT } = app;
const J = x => JSON.parse(JSON.stringify(x));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ': ' + a + ' ≠ ' + b);

// Local noon on a given day, and a session with one top set of `kg` on that day
const at = (day, h = 12) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const back = (now, days) => new Date(now - days * 864e5).toISOString();
const EX = 'Incline Chest Press (Smith/Machine)';
const S = (date, kg, name = EX) => ({ id: 's' + date + kg + name, mt: 1, workout: 'Upper Push', date, exercises: { [name]: [{ kg, reps: 8 }, { kg: Math.max(0, kg - 5), reps: 10 }] } });
const D = (...sessions) => ({ sessions });

// ── Date helpers ──
assert.strictEqual(gMonths('2026-10-01', 6), '2027-04-01', '6 months');
assert.strictEqual(gMonths('2026-09-29', 3), '2026-12-29', '3 months');
assert.strictEqual(gMonths('2026-08-31', 6), '2027-02-28', 'the 31st lands on the last day of a short month');
assert.strictEqual(gMonths('2027-08-31', 6), '2028-02-29', 'leap year');
assert.strictEqual(gMonths('2026-11-30', 3), '2027-02-28');
assert.strictEqual(gDays('2026-10-01', '2027-04-01'), 182, 'whole days, across a clock change');
assert.strictEqual(gDays('2026-03-01', '2026-04-01'), 31);
assert.strictEqual(gDays('2026-10-02', '2026-10-01'), -1);

// ── Roadmap "Done when": 40 → 65 kg over 6 months ──
const g = { id: 'g1', exercise: EX, startKg: 40, startDate: '2026-10-01', targetKg: 65, targetDate: gMonths('2026-10-01', 6) };
const mid = at('2026-12-31');                     // day 91 of 182: halfway
const withTop = kg => D(S(back(mid, 3), kg));
let s = goalStatus(g, withTop(50), mid);
near(s.exp, 52.5, 'halfway, the pace line expects 52.5 kg');
near(s.tol, 2.5, 'tolerance = max(2.5 kg, 10% of 25 kg)');
assert.strictEqual(s.status, 'on', '50 kg is exactly 2.5 kg under pace: still on track');
near(s.perWk, 15 / 13, 'kg per week still needed: 15 kg in 13 weeks');
near(s.pct, 10 / 25); near(s.expPct, 0.5);
assert.strictEqual(goalStatus(g, withTop(49.5), mid).status, 'behind', 'flips to Behind below the tolerance');
assert.strictEqual(goalStatus(g, withTop(55), mid).status, 'on', 'upper edge is still on track');
assert.strictEqual(goalStatus(g, withTop(57.5), mid).status, 'ahead');
// The expected kg moves once a day along the line
near(goalStatus(g, D(), at('2026-10-01', 7)).exp, 40, 'start day');
near(goalStatus(g, D(), at('2026-10-01', 23)).exp, 40, 'same all day');
near(goalStatus(g, D(), at('2026-10-02')).exp, 40 + 25 / 182, 'next day');
near(goalStatus(g, D(), at('2027-04-01')).exp, 65, 'target day');
s = goalStatus(g, withTop(60), at('2027-05-01'));
near(s.exp, 65, 'after the target date the pace stays at the target');
assert.strictEqual(s.perWk, null, 'no per-week figure once the date has passed');
assert.strictEqual(s.status, 'behind');
near(goalStatus(g, D(), at('2026-09-20')).exp, 40, 'before the start day: start kg');

// The same example, as of today: 91 days into a 6-month goal
const now = Date.now(), start = lday(now - 91 * 864e5), g2 = { exercise: EX, startKg: 40, startDate: start, targetKg: 65, targetDate: gMonths(start, 6) };
const total = gDays(start, g2.targetDate);
s = goalStatus(g2, D(S(back(now, 2), 50)), now);
near(s.exp, 40 + 25 * 91 / total, 'expected kg for today');
assert.strictEqual(s.status, 50 >= s.exp - 2.5 ? 'on' : 'behind');
assert.strictEqual(goalStatus(g2, D(S(back(now, 2), s.exp - 2.6)), now).status, 'behind');

// Tolerance: 10% of the gap once that is more than 2.5 kg
near(goalStatus({ exercise: EX, startKg: 100, startDate: '2026-10-01', targetKg: 150, targetDate: '2027-04-01' }, D(), mid).tol, 5);
near(goalStatus({ exercise: EX, startKg: 20, startDate: '2026-10-01', targetKg: 30, targetDate: '2027-04-01' }, D(), mid).tol, 2.5);

// ── "Current" kg ──
// Best top set in the last 14 days...
let d = D(S(back(mid, 3), 50), S(back(mid, 10), 52.5), S(back(mid, 20), 60));
assert.deepStrictEqual(J(goalCur(EX, d, mid)), { kg: 52.5, date: back(mid, 10), src: 'recent' });
assert.strictEqual(goalStatus(g, d, mid).cur, 52.5);
// ...else the latest top set...
d = D(S(back(mid, 30), 62.5), S(back(mid, 20), 57.5));
assert.deepStrictEqual(J(goalCur(EX, d, mid)), { kg: 57.5, date: back(mid, 20), src: 'latest' });
assert.strictEqual(goalStatus(g, d, mid).src, 'latest');
// ...else the goal's start kg
s = goalStatus(g, D(), mid);
assert.deepStrictEqual([s.cur, s.src], [40, null]);
// Sessions later than `now`, bodyweight sets and 0 × 0 activities are not top sets
d = D(S(back(mid, 2), 50), S(back(mid, -2), 70), { id: 'bw', mt: 1, workout: 'X', date: back(mid, 1), exercises: { [EX]: [{ kg: 0, reps: 12 }] } },
  { id: 'mt', mt: 1, workout: 'Muay Thai', date: back(mid, 1), exercises: { [EX]: [{ kg: 0, reps: 0 }] } });
assert.strictEqual(goalCur(EX, d, mid).kg, 50);
assert.strictEqual(goalCur('Never Done', d, mid), null);
// Matches bestRecent(name, 14) for today
d = D(S(back(now, 1), 47.5), S(back(now, 6), 50), S(back(now, 16), 55));
assert.strictEqual(goalCur(EX, d).kg, bestRecent(EX, 14, d).kg);
assert.strictEqual(goalCur(EX, d).kg, 50);

// ── Reaching the target ──
d = D(S(back(mid, 20), 65), S(back(mid, 3), 62.5));
s = goalStatus(g, d, mid);
assert.strictEqual(s.status, 'done', 'hit 20 days ago still counts, though current (62.5) is lower');
assert.strictEqual(s.hit, back(mid, 20)); assert.strictEqual(s.pct, 1); assert.strictEqual(s.perWk, 0);
assert.strictEqual(goalHit(g, D(S(new Date(at('2026-09-30')).toISOString(), 70)), mid), null, 'a set before the start day does not count');
assert.strictEqual(goalHit(g, D(S(new Date(at('2026-10-01', 8)).toISOString(), 65)), mid) !== null, true, 'the start day itself counts');
assert.strictEqual(goalHit(g, D(S(back(mid, -1), 65)), mid), null, 'a set after `now` does not count yet');
assert.strictEqual(goalHit(g, D(S(back(mid, 3), 64.5)), mid), null);

// ── New-goal validation ──
const ok = { exercise: EX, startKg: 40, targetKg: 65, targetDate: gMonths(lday(now), 6) };
const err = (patch, data = D()) => goalErr(Object.assign({}, ok, patch), data, now);
assert.strictEqual(err({}), '');
assert.strictEqual(err({ exercise: '  ' }), 'Pick an exercise');
assert.strictEqual(err({ startKg: NaN }), 'Enter a start kg');
assert.strictEqual(err({ targetKg: 40 }), 'Target must be above the start kg');
assert.strictEqual(err({ targetKg: NaN }), 'Target must be above the start kg');
assert.strictEqual(err({ targetDate: lday(now) }), 'Pick a date after today');
assert.strictEqual(err({ targetDate: '' }), 'Pick a date after today');
assert.strictEqual(err({ exercise: EX.toUpperCase() }, { sessions: [], goals: [Object.assign({}, g, { archived: false })] }), 'You already have a goal for this');
assert.strictEqual(err({}, { sessions: [], goals: [Object.assign({}, g, { archived: true })] }), '', 'an archived goal does not block a new one');
assert.strictEqual(err({ targetKg: 60 }, D(S(back(now, 3), 60))), 'You lifted 60 kg lately. Aim higher');
assert.strictEqual(err({ targetKg: 60 }, D(S(back(now, 40), 60))), '', 'getting back to an old best is fine');

// ── Muscle group filter ──
const GS = [{ id: 'a', exercise: EX }, { id: 'b', exercise: 'Lat Pulldown' }, { id: 'c', exercise: 'Plank' }, { id: 'd', exercise: 'Muay Thai' }];
assert.deepStrictEqual(J(goalGroups(GS, GS.slice(0, 2), D())), [{ group: 'Chest', n: 1 }, { group: 'Back', n: 1 }, { group: 'Shoulders', n: 0 }, { group: 'Arms', n: 0 },
  { group: 'Legs', n: 0 }, { group: 'Core', n: 0 }, { group: 'Other', n: 0 }], 'n counts the active goals only');
assert.deepStrictEqual(J(goalGroups(GS.slice(0, 2), GS.slice(0, 2), D())).map(x => x.group), ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'], 'Core and Other only once a goal is in them');
assert.strictEqual(goalGroup(GS[0], { sessions: [], muscles: { [EX]: 'Shoulders/Front' } }), 'Shoulders', 'your own pick in Progress wins');

// ── Your order ──
// A goal record; ord left out = never dragged (every goal saved before this feature)
const O = (id, targetDate, ord, exercise) => Object.assign({ id, mt: 1, exercise: exercise || id, startKg: 10, startDate: '2026-09-01', targetKg: 20, targetDate, archived: false }, ord == null ? {} : { ord });
const ids = l => l.map(g => g.id);
// One drag: the goals to save, and the list after saving them (each with a fresh ord, as updGoal would)
const drag = (list, vis, id, to) => { const ch = J(goalMove(goalSort(list), vis, id, to)); return { ch, list: list.map(g => g.id in ch ? Object.assign({}, g, { ord: ch[g.id] }) : g) }; };
// What the drop should give: moving up, just before the goal it now sits above; moving down, just after the one above it
const expect = (order, vis, id, to) => { const from = vis.indexOf(id), v = vis.filter(x => x !== id), o = order.filter(x => x !== id);
  if (to === from) return order; const p = to < from ? o.indexOf(v[to]) : o.indexOf(v[to - 1]) + 1; o.splice(p, 0, id); return o; };

// Goals never dragged keep the target-date order; equal dates keep the list's order, as the old sort did
let L = [O('c', '2027-01-01'), O('a', '2026-12-01'), O('b', '2027-01-01'), O('d', '2026-12-15')];
const old = L.slice().sort((x, y) => x.targetDate < y.targetDate ? -1 : x.targetDate > y.targetDate ? 1 : 0);
assert.deepStrictEqual(ids(goalSort(L)), ids(old), 'legacy goals: same order as before');
assert.deepStrictEqual(ids(goalSort(L)), ['a', 'd', 'c', 'b']);
assert.ok(goalKey(O('x', '2027-01-02')) - goalKey(O('y', '2027-01-01')) === 1, 'a legacy key is the target day number');
assert.strictEqual(goalKey(O('x', 'nonsense')), 0, 'a broken date still sorts');
assert.strictEqual(goalKey(O('x', '2027-01-01', 3.5)), 3.5);
// Dragging to the top saves just that goal, just above the first
let r = drag(L, ['a', 'd', 'c', 'b'], 'b', 0);
assert.deepStrictEqual(Object.keys(r.ch), ['b'], 'one goal written');
assert.deepStrictEqual(ids(goalSort(r.list)), ['b', 'a', 'd', 'c']);
// ...and to the bottom
r = drag(r.list, ['b', 'a', 'd', 'c'], 'a', 3);
assert.deepStrictEqual(Object.keys(r.ch), ['a']); assert.deepStrictEqual(ids(goalSort(r.list)), ['b', 'd', 'c', 'a']);
// Between two goals with different keys: halfway between them
r = drag(r.list, ['b', 'd', 'c', 'a'], 'a', 1);
assert.deepStrictEqual(Object.keys(r.ch), ['a']); assert.strictEqual(r.ch.a, (goalKey(r.list.find(g => g.id === 'b')) + goalKey(r.list.find(g => g.id === 'd'))) / 2);
assert.deepStrictEqual(ids(goalSort(r.list)), ['b', 'a', 'd', 'c']);
// Dropped where it was: nothing to save
assert.deepStrictEqual(J(goalMove(goalSort(L), ['a', 'd', 'c', 'b'], 'd', 1)), {});
assert.deepStrictEqual(J(goalMove(goalSort(L), ['a', 'd', 'c', 'b'], 'zz', 0)), {}, 'unknown goal');
// Between two legacy goals with the same target date there's no room: they get keys too, the rest stay as they are
r = drag(L, ['a', 'd', 'c', 'b'], 'a', 2);
assert.deepStrictEqual(ids(goalSort(r.list)), ['d', 'c', 'a', 'b']);
assert.deepStrictEqual(Object.keys(r.ch).sort(), ['a', 'b', 'c'], 'd keeps its date key');
// A new goal goes to the bottom, whatever its date; archived goals don't count
const withNew = L.concat(O('n', '2026-11-01', goalEnd({ goals: L.concat(O('z', '2030-01-01', undefined)).map((g, i) => i === 4 ? Object.assign(g, { archived: true }) : g) })));
assert.deepStrictEqual(ids(goalSort(withNew)), ['a', 'd', 'c', 'b', 'n'], 'new goal last');
assert.strictEqual(goalEnd({ goals: [] }), 1); assert.strictEqual(goalEnd({}), 1);
assert.strictEqual(goalEnd({ goals: [O('p', '2027-01-01', -5), O('q', '2027-01-01', -2)] }), 1, 'below goals dragged above 0');

// A filtered view is the one order narrowed to a group, and a drag there moves the goal among its visible neighbours
const PU = 'Pull-Ups', LP = 'Lat Pulldown', ROW = 'Seated Cable Row', INC = 'Incline Chest Press', SQ = 'Squat - Dumbbell', CU = 'Bicep Curl';
L = [O('lp', '2026-12-01', null, LP), O('inc', '2026-11-01', null, INC), O('sq', '2026-12-10', null, SQ), O('row', '2027-01-15', null, ROW),
  O('cu', '2027-02-01', null, CU), O('pu', '2027-03-01', null, PU)];
const inBack = list => goalSort(list).filter(g => goalGroup(g, D()) === 'Back');
assert.deepStrictEqual(ids(goalSort(L)), ['inc', 'lp', 'sq', 'row', 'cu', 'pu']);
assert.deepStrictEqual(ids(inBack(L)), ['lp', 'row', 'pu'], 'Back: the one order, narrowed');
// With Back on, Pull-Ups to the top: just before Lat Pulldown, the previous first Back goal; only Pull-Ups is saved
r = drag(L, ['lp', 'row', 'pu'], 'pu', 0);
assert.deepStrictEqual(Object.keys(r.ch), ['pu']);
assert.deepStrictEqual(ids(goalSort(r.list)), ['inc', 'pu', 'lp', 'sq', 'row', 'cu'], 'jumps the hidden goals below Lat Pulldown only');
assert.deepStrictEqual(ids(inBack(r.list)), ['pu', 'lp', 'row']);
// Down past one Back goal: just after it, ahead of the hidden goals that follow it
r = drag(r.list, ['pu', 'lp', 'row'], 'pu', 1);
assert.deepStrictEqual(ids(goalSort(r.list)), ['inc', 'lp', 'pu', 'sq', 'row', 'cu']);
// Up into the middle: just before the goal it now sits above
r = drag(r.list, ['lp', 'pu', 'row'], 'row', 1);
assert.deepStrictEqual(ids(goalSort(r.list)), ['inc', 'lp', 'row', 'pu', 'sq', 'cu']);
assert.deepStrictEqual(ids(inBack(r.list)), ['lp', 'row', 'pu']);

// Many drags into the same gap run out of halves; the goals around it are spaced out again and the order holds
L = [O('p', '2027-01-01', 1), O('q', '2027-01-01', 2)];
for (let i = 0; i < 12; i++) L.push(O('m' + i, '2027-01-01', 3 + i));
let want = ids(goalSort(L)), widened = 0;
for (let i = 0; i < 300; i++) {
  const vis = ids(goalSort(L)), id = vis[vis.length - 1];
  r = drag(L, vis, id, 1); L = r.list; want = expect(want, vis, id, 1);
  assert.deepStrictEqual(ids(goalSort(L)), want, 'drag ' + i);
  assert.ok(Object.values(r.ch).every(Number.isFinite));
  if (Object.keys(r.ch).length > 1) widened++;
}
assert.ok(widened > 0 && widened < 30, 'mostly one goal per drag (' + widened + ' of 300 spaced out more)');

// Random lists (some dragged, some not, shared dates), random filters, random drags: always the expected order
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const NAMES = [PU, LP, ROW, INC, SQ, CU, 'Dips', 'Plank', 'Calf Raise', 'Leg Press'];
for (let t = 0; t < 400; t++) {
  let list = []; const n = 2 + rnd(9);
  for (let i = 0; i < n; i++) list.push(O('g' + i, '2027-0' + (1 + rnd(3)) + '-0' + (1 + rnd(3)), rnd(3) ? null : rnd(5) - 2 + rnd(2) / 2, NAMES[rnd(NAMES.length)]));
  let order = ids(goalSort(list));
  for (let k = 0; k < 6; k++) {
    const grp = rnd(3) ? null : goalGroup(list[rnd(list.length)], D());
    const vis = ids(goalSort(list).filter(g => !grp || goalGroup(g, D()) === grp));
    const id = vis[rnd(vis.length)], to = rnd(vis.length);
    r = drag(list, vis, id, to); list = r.list; order = expect(order, vis, id, to);
    assert.deepStrictEqual(ids(goalSort(list)), order, 'random case ' + t + '.' + k);
  }
}

// Changing an exercise's muscle group moves its goal between filter groups, at the same place in the one order
app.__store.ironlog_data = JSON.stringify({ sessions: [], goals: [O('fdb', '2026-12-01', 2, 'Flat DB Press'), O('inc', '2026-11-01', 1, INC), O('lp', '2027-01-01', 3, LP)] });
let dd = gd(), all = dd.goals;
assert.strictEqual(goalGroup(all[0], dd), 'Other', 'Flat DB Press guesses to Other');
assert.deepStrictEqual(J(goalGroups(all, all, dd)).filter(x => x.n).map(x => [x.group, x.n]), [['Chest', 1], ['Back', 1], ['Other', 1]]);
setMuscle('Flat DB Press', 'Chest/Middle'); dd = gd(); all = dd.goals;
assert.strictEqual(goalGroup(all[0], dd), 'Chest');
assert.deepStrictEqual(J(goalGroups(all, all, dd)).map(x => x.group), ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'], 'Other goes once empty');
assert.deepStrictEqual(J(goalGroups(all, all, dd)).filter(x => x.n).map(x => [x.group, x.n]), [['Chest', 2], ['Back', 1]]);
assert.deepStrictEqual(J(ids(goalSort(all).filter(g => goalGroup(g, dd) === 'Chest'))), ['inc', 'fdb'], 'in Chest, at its place in your order');
assert.deepStrictEqual(J(dd.goals), J(JSON.parse(app.__store.ironlog_data).goals), 'the goal itself is untouched: the pick is per exercise');

// Tolerance constants are the roadmap's
assert.deepStrictEqual([GT.TOL_KG, GT.TOL_PCT, GT.RECENT], [2.5, 10, 14]);

console.log('goals tests pass');
