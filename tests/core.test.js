// Unit tests for the core logic in js/core.js and the core item helpers in js/data.js. Usage: node tests/core.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const APP = ['data.js', 'sync.js', 'stats.js', 'ui.js', 'core.js'];
const J = x => JSON.parse(JSON.stringify(x));
const eq = (a, b, msg) => assert.deepStrictEqual(J(a), J(b), msg);

// Formatting
let app = loadApp(APP, { ironlog_data: JSON.stringify({ sessions: [] }) });
const { fsec, fclk, coreSum, dayAdd } = app;
eq([45, 60, 90, 95, 120, 605].map(fsec), ['45s', '60s', '90s', '1:35', '2:00', '10:05']);
eq([0, 9.7, 62, 3600].map(fclk), ['0:00', '0:09', '1:02', '60:00']);
const T = (name, ...s) => ({ name, mode: 'time', sets: s.map(secs => ({ secs })) });
const R = (name, ...s) => ({ name, mode: 'reps', sets: s.map(reps => ({ reps })) });
assert.strictEqual(coreSum([T('Plank', 60, 60, 60), R('Leg Raise', 15, 15, 15)]), 'Plank 3×60s, Leg Raise 3×15', 'the roadmap example');
assert.strictEqual(coreSum([T('Plank', 60, 45), R('Leg Raise', 15, 12, 10)]), 'Plank 60s/45s, Leg Raise 15/12/10');
assert.strictEqual(coreSum([T('Plank', 120), R('Crunch', 20)]), 'Plank 2:00, Crunch 20', 'one set: no count');
assert.strictEqual(coreSum([T('Plank'), R('Leg Raise', 12)]), 'Leg Raise 12', 'exercises with no sets are left out');
assert.strictEqual(coreSum([]), ''); assert.strictEqual(coreSum(undefined), '');

// Day maths is by calendar day, across months, years and clock changes
assert.strictEqual(dayAdd('2026-03-01', -1), '2026-02-28');
assert.strictEqual(dayAdd('2026-12-31', 1), '2027-01-01');
assert.strictEqual(dayAdd('2026-03-29', -1), '2026-03-28');
assert.strictEqual(dayAdd('2026-10-25', 1), '2026-10-26');

// A realistic log: old per-session ticks (abs), tick-only days, and days with exercises
const t0 = new Date(); t0.setHours(18, 0, 0, 0);
const today = app.lday(t0), ago = n => dayAdd(today, -n);
const at = n => { const d = new Date(t0); d.setDate(d.getDate() - n); return d.toISOString(); };
const C = (n, done, items, mt = 100) => ({ ['c' + ago(n)]: { id: 'c' + ago(n), mt, date: ago(n), done, items } });
const data = {
  sessions: [
    { id: 's3', mt: 50, workout: 'Legs', date: at(3), abs: true, exercises: { Squat: [{ kg: 40, reps: 8 }] } },
    { id: 's6', mt: 50, workout: 'Upper Push', date: at(6), exercises: { Dips: [{ kg: 0, reps: 12 }], 'Hanging Leg Raise': [{ kg: 0, reps: 10 }] } },
    { id: 's12', mt: 50, workout: 'Legs', date: at(12), abs: true, exercises: { Squat: [{ kg: 40, reps: 8 }] } },
  ],
  core: Object.assign({},
    C(1, true, [T('Plank', 60, 60, 45), R('Leg Raise', 15, 15, 12)]),
    C(4, true, [T('Plank', 50, 45)]),
    C(6, true, [T('Plank', 45), R('Leg Raise', 12, 12)]),
    C(8, false, []),
    C(10, true, []),
    C(20, true, [R('plank', 30), R('Crunch', 20)])),
};
app = loadApp(APP, { ironlog_data: JSON.stringify(data) });

// "N of last 7 days" counts today and the 6 days before, including days ticked by older app versions
assert.strictEqual(app.coreDone(ago(3)), true, 'old abs tick shows as a core day');
assert.strictEqual(app.coreCount(7), 4, 'days 1, 3 (abs), 4 and 6');
assert.strictEqual(app.coreCount(30), 7, 'plus days 10, 12 (abs) and 20; day 8 was unticked');
assert.strictEqual(app.coreCount(7, undefined, ago(1)), 4, 'counted back from a given day');

// Type-ahead candidates: past core exercises (newest first), then core lifts from workouts, then common ones
const cands = J(app.coreCands());
eq(cands.slice(0, 4), ['Plank', 'Leg Raise', 'Crunch', 'Hanging Leg Raise']);
assert.ok(!cands.includes('plank'), 'one spelling per name, case-insensitive');
assert.ok(cands.includes('Dead Bug') && !cands.includes('Dips') && !cands.includes('Squat'));
eq(app.coreNames(), ['Plank', 'Leg Raise', 'plank', 'Crunch']);

// The mode used last time for a name is remembered; new names are guessed
assert.strictEqual(app.coreMode('Plank'), 'time');
assert.strictEqual(app.coreMode('Leg Raise'), 'reps');
assert.strictEqual(app.coreMode('Wall Sit'), 'time'); assert.strictEqual(app.coreMode('Side Plank'), 'time');
assert.strictEqual(app.coreMode('Russian Twist'), 'reps');

// Pre-fill for the next set: the day's own last set, else the last one logged before that day
assert.strictEqual(app.coreLast('Plank', today), 45);
assert.strictEqual(app.coreLast('Plank', ago(2)), 45, 'from day 4');
assert.strictEqual(app.coreLast('Leg Raise', ago(5)), 12);
assert.strictEqual(app.coreLast('Leg Raise', ago(7)), null, 'nothing before');

// Progress: per exercise, best set (first time reached), each day's best in the latest mode, newest first
const st = J(app.coreStats());
eq(st.map(x => x.name), ['Plank', 'Leg Raise', 'plank', 'Crunch']);
eq(st[0], { name: 'Plank', mode: 'time', best: 60, bestDate: ago(1), last: { date: ago(1), mode: 'time', v: 60 },
  pts: [{ date: ago(6), mode: 'time', v: 45 }, { date: ago(4), mode: 'time', v: 50 }, { date: ago(1), mode: 'time', v: 60 }] });
eq([st[1].best, st[1].bestDate, st[1].pts.map(p => p.v)], [15, ago(1), [12, 15]]);
const sw = J(loadApp(APP, { ironlog_data: JSON.stringify({ sessions: [], core: Object.assign({}, C(9, true, [T('Hollow Hold', 40)]), C(2, true, [R('Hollow Hold', 8)])) }) }).coreStats());
eq([sw[0].mode, sw[0].best, sw[0].pts.length], ['reps', 8, 1], 'after a mode switch, only the latest mode is compared');

// History: days with core but no workout get their own card
eq(app.coreOnlyDays(), [ago(20), ago(10), ago(4), ago(1)].sort());
// Each workout card's core row: the tick in that workout's state, then what was logged, or a prompt to add it. A day that
// was never ticked, or was unticked, still gets the tick, so the control is there in both states.
app.document.createElement = () => { let t = ''; return { set textContent(v) { t = String(v); }, get innerHTML() { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } }; };
const S = id => app.gs().find(s => s.id === id), Q = n => ({ id: 'q' + n, date: at(n) });
const row = (s, d) => { const h = app.coreLine(s, d); return [/^<div class="hcx jhc on"/.test(h), (h.match(/<button class="ctick jhct( on)?( pop)?" data-day="([^"]+)" data-sid="([^"]+)" aria-label="Core done" aria-pressed="(\w+)">/) || []).slice(1), (h.match(/<div class="hcx-s">(.*?)<\/div>/) || [])[1]]; };
eq(row(S('s6')), [true, [' on', null, ago(6), 's6', 'true'], 'Plank 45s, Leg Raise 2×12'], 'day ticked as a whole: on its only workout');
eq(row(S('s3')), [true, [' on', null, ago(3), 's3', 'true'], 'Done · tap to add exercises'], 'old abs tick, nothing logged');
eq(row(Q(8)), [false, [null, null, ago(8), 'q8', 'false'], 'Not done · tap to add exercises'], 'unticked day');
eq(row(Q(9)), [false, [null, null, ago(9), 'q9', 'false'], 'Not done · tap to add exercises'], 'no record at all');
app.CPOP = ago(6); eq(row(S('s6'))[1].slice(0, 2), [' on', ' pop'], 'the day just ticked pops'); assert.strictEqual(row(S('s3'))[1][1], undefined);
app.CPOP = 's6'; eq(row(S('s6'))[1].slice(0, 2), [' on', ' pop'], 'the workout just ticked pops'); assert.strictEqual(row(S('s3'))[1][1], undefined); app.CPOP = null;
const esc = { id: 'e', date: '2026-01-05T12:00' };
assert.ok(app.coreLine(esc, { sessions: [esc], core: { 'c2026-01-05': { done: true, items: [R('Crunch <b>', 5)] } } }).includes('>Crunch &lt;b&gt; 5<'), 'names are escaped as text');

// ── Writing ──
// Adding an exercise with no sets doesn't tick the day; the first set does, and the day's workouts are left as they are
const s3 = J(app.gs().find(s => s.id === 's3'));
app.setCoreItems(ago(2), [T('Plank')]);
assert.strictEqual(app.coreDone(ago(2)), false);
eq(app.coreItems(ago(2)), [T('Plank')]);
app.setCoreItems(ago(3), [T('Plank', 30)]);
let rec = app.gd().core['c' + ago(3)];
assert.strictEqual(rec.done, true); assert.ok(rec.mt > 1000, 'a real edit time'); eq(rec.items, [T('Plank', 30)]);
eq(app.gs().find(s => s.id === 's3'), s3, 'abs already set: the session is left alone, mt included');
// Logging sets on a day doesn't flag its workouts: core shows on the day's latest one until a card is ticked
app.setCoreItems(ago(6), [T('Plank', 45), R('Leg Raise', 12, 12, 10)]);
assert.strictEqual(app.gs().find(s => s.id === 's6').abs, undefined);
eq(app.coreWith(ago(6)).map(s => s.id), ['s6']);
const s6mt = app.gs().find(s => s.id === 's6').mt;
app.setCoreItems(ago(6), [T('Plank', 45, 40)]);
assert.strictEqual(app.gs().find(s => s.id === 's6').mt, s6mt, 'later set edits do not touch the session');
// Removing every set keeps the tick
app.setCoreItems(ago(6), []);
assert.strictEqual(app.coreDone(ago(6)), true);
// Unticking clears the exercises, so the day, History and the Sheet agree
app.setCoreItems(ago(4), [T('Plank', 50, 45)]);
app.coreTick(ago(4), false);
rec = app.gd().core['c' + ago(4)];
eq([rec.done, rec.items], [false, []]);
app.coreTick(ago(5), true);
eq((({ id, date, done, items }) => ({ id, date, done, items }))(app.gd().core['c' + ago(5)]), { id: 'c' + ago(5), date: ago(5), done: true, items: [] }, 'a tick on a rest day');
// coreEdit works on a copy of the stored items
app.coreEdit(ago(1), its => { app.citem(its, 'Leg Raise').sets.push({ reps: 10 }); });
eq(app.coreItems(ago(1))[1].sets.map(t => t.reps), [15, 15, 12, 10]);

// The stopwatch keeps a start time; stopping logs the elapsed seconds on the day it was started for
app.setCoreItems(today, [T('Plank')]);
app.sSW({ day: today, name: 'Plank', t0: Date.now() - 61400 });
app.swStop();
eq(app.coreItems(today)[0].sets, [{ secs: 61 }]); assert.strictEqual(app.gSW(), null);
assert.strictEqual(app.coreDone(today), true, 'a timed set ticks the day');
app.sSW({ day: today, name: 'Gone', t0: Date.now() - 5000 }); app.swStop();
eq(app.coreItems(today).map(i => i.name), ['Plank'], 'a stopwatch for a removed exercise logs nothing');

// Items travel through sync: the newest edit of the day wins as a whole record
const other = J(app.gd()); other.core['c' + today] = { id: 'c' + today, mt: Date.now() + 5000, date: today, done: true, items: [T('Plank', 61, 58)] };
const m = app.mergeD(J(app.gd()), other);
eq(m.core['c' + today].items, [T('Plank', 61, 58)]);

// ── History's tick on one workout: a two-workout day, ticked as a whole with sets logged ──
const x10 = new Date(t0); x10.setDate(x10.getDate() - 2); x10.setHours(10);
const x19 = new Date(x10); x19.setHours(19);
const X = ago(2), two = () => ({ sessions: [
  { id: 'a', mt: 50, workout: 'Legs', date: x10.toISOString(), exercises: {} },
  { id: 'b', mt: 50, workout: 'Muay Thai', date: x19.toISOString(), exercises: {} }],
  core: C(2, true, [T('Plank', 60)]) });
app = loadApp(APP, { ironlog_data: JSON.stringify(two()) });
const on = () => app.coreWith(X).map(s => s.id).sort(), mts = () => app.gs().map(s => s.mt);
eq(on(), ['b'], 'ticked for the day: on the latest workout only');
app.coreTickS('a', true);
eq(on(), ['a', 'b'], 'ticking the other card adds it; the one showing core keeps it');
app.coreTickS('b', false);
eq(on(), ['a'], 'unticking one workout leaves the other');
eq([app.coreDone(X), app.coreItems(X)], [true, [T('Plank', 60)]], 'the day and its exercises stay');
const mt0 = mts(); app.coreTickS('a', true); eq(mts(), mt0, 'no flip, no mt change');
app.coreTickS('a', false);
eq([app.coreDone(X), app.coreItems(X), on()], [false, [], []], "the day's last workout with core: the day is unticked and cleared");
eq(app.gs().map(s => !!s.abs), [false, false]);
app.coreTickS('b', true);
eq([app.coreDone(X), on()], [true, ['b']], 'ticking one workout on an unticked day ticks the day, for that workout only');
app.coreTickS('nope', false); eq(on(), ['b'], 'an unknown workout changes nothing');
// A stale flag on an unticked day doesn't come back with the next tick
app = loadApp(APP, { ironlog_data: JSON.stringify(Object.assign(two(), { core: C(2, false, []) })) });
const dd = app.gd(); dd.sessions[0].abs = true; app.sd(dd);
eq(on(), [], 'not done: on no workout');
app.coreTickS('b', true); eq(on(), ['b']);
// Unticking the whole day (chip, sheet) takes core off every workout
app.coreTickS('a', true); app.coreTick(X, false);
eq([app.coreDone(X), app.gs().map(s => !!s.abs)], [false, [false, false]]);

// The sheet opened from a card: core started there goes with that card's workout, unless another workout has it
app = loadApp(APP, { ironlog_data: JSON.stringify(Object.assign(two(), { core: {} })) });
app.COD = X; app.COS = 'a';
app.coreEdit(X, its => { its.push(T('Plank')); });
eq([app.coreDone(X), on()], [false, []], 'an exercise with no sets ticks nothing');
app.coreEdit(X, its => { its[0].sets.push({ secs: 40 }); });
eq(on(), ['a'], 'the first set: on the card that opened the sheet, not the latest');
app.COS = 'b'; app.coreEdit(X, its => { its[0].sets.push({ secs: 30 }); });
eq(on(), ['a'], 'another card opening it later does not add its workout');
app.coreTick(X, false); app.coreTick(X, true);
eq(on(), ['b'], "the sheet's own tick goes with the card that opened it");
app.COS = null; app.COD = null; app.coreTick(X, false); app.coreTick(X, true);
eq(on(), ['b'], 'from the chip: no workout flagged, shown on the latest');
eq(app.gs().map(s => !!s.abs), [false, false]);

console.log('core tests pass');
