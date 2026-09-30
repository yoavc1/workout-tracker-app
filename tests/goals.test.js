// Unit tests for the goal maths in js/goals.js: straight-line pace, status tolerance, "current" kg, reaching a target,
// date helpers and new-goal validation. Usage: node tests/goals.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const app = loadApp(['data.js', 'sync.js', 'stats.js', 'ui.js', 'goals.js']);
const { goalStatus, goalCur, goalHit, goalErr, goalGroup, goalGroups, gMonths, gDays, bestRecent, lday, GT } = app;
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

// Tolerance constants are the roadmap's
assert.deepStrictEqual([GT.TOL_KG, GT.TOL_PCT, GT.RECENT], [2.5, 10, 14]);

console.log('goals tests pass');
