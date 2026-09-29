// Unit tests for js/stats.js on data shaped like the real log (renamed exercises, 0x0 activities, bodyweight sets).
// Usage: node tests/stats.test.js
const assert = require('assert');
const { loadApp } = require('./lib');
const J = x => JSON.parse(JSON.stringify(x));

// Dates are relative to today, so the "last N days" checks never go stale
const ago = n => { const d = new Date(); d.setHours(18, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString(); };
const S = (daysAgo, workout, exercises) => ({ id: 's' + daysAgo + workout, mt: 1, workout, date: ago(daysAgo), exercises });
const sets = (...p) => p.map(([kg, reps]) => ({ kg, reps }));
const sessions = [
  S(112, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([40, 12], [40, 10], [40, 10]), 'Cable Face Pulls': sets([22.5, 12], [25, 8]) }),
  S(106, 'Legs', { 'Seated Machine Leg Extension': sets([75, 8], [80, 8], [65, 8]), 'Seated Machine Leg Curl': sets([40, 8], [40, 7], [30, 12]) }),
  S(106.5, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([40, 12]) }),
  S(81, 'Upper Push', { Dips: sets([0, 15], [0, 20], [0, 10]) }),
  S(81.5, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([40, 10], [40, 10]), 'Cable Face Pulls': sets([22.5, 12], [22.5, 10]) }),
  S(80, 'Muay Thai', { 'Session Complete': sets([0, 0]) }),
  S(66, 'Legs', { 'Seated Machine Leg Extension': sets([70, 10], [70, 8]), 'Seated Hamstring Curl': sets([30, 12], [30, 8], [30, 8]) }),
  S(66.5, 'Swimming', { Swimming: sets([0, 0]) }),
  S(64, 'Upper Push', { 'Incline Chest Press (Smith/Machine)': sets([20, 8], [20, 8]), Dips: sets([0, 15], [0, 12], [0, 8], [0, 8]) }),
  S(62, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([40, 10], [40, 10], [30, 8]), 'Cable Face Pulls': sets([20, 10], [20, 10]) }),
  S(59, 'Legs', { 'Seated Machine Leg Extension': sets([75, 7], [70, 10], [70, 10]), 'Seated Hamstring Curl': sets([35, 8], [35, 8], [35, 8]) }),
  S(55, 'Upper Push', { 'Incline Chest Press (Smith/Machine)': sets([20, 10], [20, 10]) }),
  S(53, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([40, 10]) }),
  S(30, 'Legs', { 'Seated Machine Leg Extension': sets([70, 8], [75, 8], [75, 8]), 'Seated Hamstring Curl': sets([35, 12], [40, 8], [40, 8]) }),
  S(30.5, 'Upper Pull', { 'Pull-Ups': sets([0, 8], [0, 8], [0, 8]) }),
  S(26, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([45, 8], [45, 8], [40, 8]), 'Pull-Ups': sets([0, 10], [0, 10], [0, 10]), 'Cable Face Pulls': sets([22.5, 10], [22.5, 10], [22.5, 10]) }),
  S(22, 'Upper Pull', { 'Lat Pulldown Machine (Uni Lateral)': sets([45, 8], [45, 8], [45, 6]), 'Cable Face Pulls': sets([25, 6], [22.5, 8], [20, 8]) }),
  S(22.5, 'Upper Push', { 'Incline Chest Press (Smith/Machine)': sets([25, 8], [25, 8], [20, 6]) }),
];
const data = { sessions, workouts: { 'Upper Push': ['Machine Chest Flys', 'Lateral Shoulder Raise - Dumbbell'] } };
const app = loadApp(['data.js', 'sync.js', 'stats.js'], { ironlog_data: JSON.stringify(data) });
const { e1rm, isActivity, exerciseSeries, bestRecent, status, muscleOf, muscleMap, MUSCLES, MUSCLE_RULES } = app;

// e1RM (Epley, reps capped at 12)
assert.strictEqual(e1rm(60, 8), 76);
assert.strictEqual(e1rm(40, 12), 56);
assert.strictEqual(e1rm(100, 20), 140, 'reps above 12 count as 12');
assert.strictEqual(e1rm(0, 12), null, 'bodyweight has no e1RM');
assert.strictEqual(e1rm(25, 0), null);

// Activities: Muay Thai / Swimming logged as a single 0 x 0 set
assert.strictEqual(isActivity(sessions.find(s => s.workout === 'Muay Thai')), true);
assert.strictEqual(isActivity(sessions.find(s => s.workout === 'Swimming')), true);
assert.strictEqual(isActivity(sessions.find(s => s.exercises.Dips)), false, 'bodyweight reps are not an activity');
assert.strictEqual(exerciseSeries('Session Complete').length, 0, 'activities are left out of series');

// Weighted series: top set, best e1RM, and status
const lat = J(exerciseSeries('Lat Pulldown Machine (Uni Lateral)'));
assert.deepStrictEqual(lat.map(p => p.v), [56, 56, 53.3, 53.3, 53.3, 57, 57]);
assert.deepStrictEqual(lat[5].top, { kg: 45, reps: 8 }); assert.strictEqual(lat[5].kind, 'weight');
assert.strictEqual(status('Lat Pulldown Machine (Uni Lateral)'), 'progressing', 'new best (57) in the last 3 sessions');
assert.deepStrictEqual(J(exerciseSeries('Seated Machine Leg Extension')).map(p => p.v), [101.3, 93.3, 93.3, 95]);
assert.strictEqual(status('Seated Machine Leg Extension'), 'stalled', 'no new best in the last 3 sessions');
assert.strictEqual(status('Incline Chest Press (Smith/Machine)'), 'progressing');

// Regressing needs 6 sessions: last 3 average more than 5% below the 3 before
const reg = { sessions: [50, 52, 53, 48, 47, 46].map((kg, i) => S(60 - i * 7, 'X', { Row: sets([kg, 1]) })) };
assert.strictEqual(status('Row', reg), 'regressing');
const flat = { sessions: [50, 52, 53, 52, 51, 52].map((kg, i) => S(60 - i * 7, 'X', { Row: sets([kg, 1]) })) };
assert.strictEqual(status('Row', flat), 'stalled', 'within 5% is stalled, not regressing');

// Bodyweight: judged on best reps
const dips = J(exerciseSeries('Dips'));
assert.deepStrictEqual(dips.map(p => [p.kind, p.v, p.e1rm]), [['bodyweight', 20, null], ['bodyweight', 15, null]]);
assert.strictEqual(status('Dips'), 'steady', 'two sessions, no new best: too early to call');
assert.deepStrictEqual(J(exerciseSeries('Pull-Ups')).map(p => p.v), [8, 10]);
assert.strictEqual(status('Pull-Ups'), 'progressing');

// Timed sets (plank-style)
const timed = { sessions: [S(10, 'Core', { Plank: [{ secs: 45 }] }), S(3, 'Core', { Plank: [{ secs: 60 }, { secs: 50 }] })] };
assert.deepStrictEqual(J(exerciseSeries('Plank', timed)).map(p => [p.kind, p.v]), [['time', 45], ['time', 60]]);

// Renamed exercises stay separate series (merging them is Track D) but land in the same muscle group
assert.strictEqual(status('Seated Machine Leg Curl'), 'new');
assert.strictEqual(exerciseSeries('Seated Hamstring Curl').length, 3);
assert.deepStrictEqual(J(muscleOf('Seated Machine Leg Curl')), J(muscleOf('Seated Hamstring Curl')));

// bestRecent: e.g. a goal's start kg
assert.deepStrictEqual(J(bestRecent('Lat Pulldown Machine (Uni Lateral)', 30)), { kg: 45, e1rm: 57, reps: 0, secs: 0, sessions: 2 });
assert.strictEqual(bestRecent('Lat Pulldown Machine (Uni Lateral)', 14), null, 'nothing in the last 14 days');
assert.strictEqual(bestRecent('Pull-Ups', 40).reps, 10);

// Muscle groups: guesses for the real exercise names (roadmap §5 D)
const expect = {
  'Incline Chest Press (Smith/Machine)': 'Chest/Upper', 'Incline Chest Press Machine': 'Chest/Upper', 'Smith Machine Incline Bench Press': 'Chest/Upper',
  'Machine Chest Flys': 'Chest/Middle', Dips: 'Chest/Lower',
  'Pull-Ups': 'Back/Upper lats', 'Lat Pull Down - Front': 'Back/Upper lats', 'Lat Pulldown Machine (Uni Lateral)': 'Back/Lower lats',
  'Chest Supported Seated Row (Tucked Elbow)': 'Back/Mid back', 'Chest Supported Seated Row (Flared Elbow)': 'Back/Mid back',
  'Chest Supported Seated Row (Grip 1)': 'Back/Mid back', 'Shrugs - Dumbbell': 'Back/Traps',
  'Cable Face Pulls': 'Shoulders/Rear', 'Reverse Cable Fly (rear delts)': 'Shoulders/Rear',
  'Lateral Shoulder Raise - Dumbbell': 'Shoulders/Side', 'Front Shoulder Raise - Dumbbell': 'Shoulders/Front',
  'Kettlebell Shoulder Raise': 'Shoulders/Front', 'Barbell Rope Shoulder Raise': 'Shoulders/Front',
  'Bayesian curl': 'Arms/Biceps', 'Rope Hammer Curl': 'Arms/Biceps', 'Faceaway Cable Curl': 'Arms/Biceps', 'Hammer Curl - Dumbbell': 'Arms/Biceps', 'Bicep Curl - Barbell': 'Arms/Biceps',
  'V-Bar Tricep Pushdown - Cable': 'Arms/Triceps', 'Overhead V-Bar Tricep Extension - Cable': 'Arms/Triceps', 'Triceps Pulldown - Rope': 'Arms/Triceps',
  'Tricep Extension - Standing - Rope - Pulley Machine': 'Arms/Triceps',
  'Seated Machine Leg Extension': 'Legs/Quads', 'Squat - Dumbbell': 'Legs/Quads', 'Bulgarian Split Squats': 'Legs/Quads',
  'Seated Hamstring Curl': 'Legs/Hamstrings', 'Seated Machine Leg Curl': 'Legs/Hamstrings', 'Romanian Deadlift - Dumbbell': 'Legs/Hamstrings',
  'Calf Raise - Standing': 'Legs/Calves', 'Calf Raise - Seated': 'Legs/Calves',
  Plank: 'Core/Abs', 'Hanging Leg Raise': 'Core/Abs', 'Side Plank': 'Core/Obliques',
};
for (const [name, g] of Object.entries(expect)) { const m = muscleOf(name); assert.strictEqual(m.main + '/' + m.sub, g, name); }
assert.deepStrictEqual(J(muscleOf('Swimming')), { main: 'Other', sub: '' });
assert.deepStrictEqual(J(muscleOf('Flat Bench Press')), { main: 'Chest', sub: 'Middle' }, '"flat" is not "lat"');
// Every guess points at a real group in the hierarchy
for (const [, g] of MUSCLE_RULES) { const [main, sub] = g.split('/'); assert.ok(MUSCLES[main] && MUSCLES[main].includes(sub), g); }
// Your override wins
assert.deepStrictEqual(J(muscleOf('Dips', { sessions: [], muscles: { Dips: 'Arms/Triceps' } })), { main: 'Arms', sub: 'Triceps' });

// muscleMap covers logged and template exercises; activities map to Other
const mm = J(muscleMap());
assert.strictEqual(mm['Lat Pulldown Machine (Uni Lateral)'], 'Back/Lower lats');
assert.strictEqual(mm['Machine Chest Flys'], 'Chest/Middle', 'template exercise included');
assert.strictEqual(mm.Swimming, 'Other');

console.log('stats tests pass');
