// Six months of synthetic training shaped like the real log, for the Progress tests and screenshots: progressing,
// stalled and regressing lifts, bodyweight Dips and Pull-Ups, 0x0 Muay Thai and Swimming, two renamed exercises
// (old name still in history), groups not trained lately, and an active goal. Dates are relative to `now`.
const DAY = 864e5;
const lday = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const W = (kg, ...reps) => reps.map(r => ({ kg, reps: r }));
const B = (...reps) => reps.map(r => ({ kg: 0, reps: r }));
const r125 = x => Math.round(x / 1.25) * 1.25;

// Each exercise: (k = session index in its workout, n = sessions of that workout, t = session time) -> sets, or null
const PLAN = {
  'Upper Push': {
    'Incline Chest Press (Smith/Machine)': (k, n) => W(r125(25 + 0.9 * k), 8, 8, 7),
    'Machine Chest Flys': (k) => k < 10 ? W(37.5 + 1.25 * k, 10, 10) : W([47.5, 48.75, 47.5, 46.25][k % 4], 10, 9),
    Dips: (k) => B(8 + Math.floor(k / 2), 6 + Math.floor(k / 2), 5 + Math.floor(k / 3)),
    'Lateral Shoulder Raise - Dumbbell': (k) => W(6 + Math.floor(k / 3), 12, 12, 10),
    'Triceps Pulldown - Rope': (k, n) => k >= n - 3 ? W(26.25, 10, 9) : W(Math.min(32.5, 20 + 1.25 * Math.floor(k / 2)), 12, 12),
    'Front Shoulder Raise - Dumbbell': (k) => W(Math.min(10, 7 + k * 0.5), 10, 10),
  },
  'Upper Pull': {
    'Lat Pulldown Machine (Uni Lateral)': (k) => W(r125(35 + 0.7 * k), 10, 10, 8),
    'Chest Supported Seated Row (Tucked Elbow)': (k) => k < 12 ? W(40 + 2.5 * Math.floor(k / 2), 10, 10) : W([52.5, 50, 52.5, 50][k % 4], 10, 9),
    'Cable Face Pulls': (k, n) => k >= n - 3 ? W(22.5, 11, 10) : W(Math.min(27.5, 18.75 + 1.25 * Math.floor(k / 3)), 12, 12),
    'Hammer Curl - Dumbbell': (k) => W(10 + Math.floor(k / 3), 10, 10, 8),
    'Pull-Ups': (k) => k < 10 ? B(5 + Math.floor(k / 2), 4 + Math.floor(k / 2)) : B([9, 8, 9, 8][k % 4], 7),
    'Shrugs - Dumbbell': (k, n, t, now) => now - t > 36 * DAY ? W(20 + 2 * Math.floor(k / 3), 12, 12) : null,
  },
  Legs: {
    'Seated Hamstring Curl': (k) => k < 14 ? W(30 + 2.5 * Math.floor(k / 3), 10, 10) : W([40, 37.5, 40, 37.5][k % 4], 10, 8),
    'Seated Machine Leg Extension': (k) => W(60 + 2.5 * Math.floor(k / 2), 10, 10, 8),
    'Calf Raise - Standing': (k) => W(40 + 2.5 * Math.floor(k / 3), 12, 12, 12),
    'Romanian Deadlift - Dumbbell': (k) => W(r125(20 + 0.6 * k), 10, 10),
    'Hanging Leg Raise': (k, n, t, now) => now - t > 36 * DAY ? B(8 + Math.floor(k / 3), 8) : null,
  },
};
// Renamed later: sessions before `k` log the old name (the real log's Leg Curl and Incline Chest Press renames)
const RENAMED = { 'Incline Chest Press (Smith/Machine)': ['Incline Chest Press Machine', 12], 'Seated Hamstring Curl': ['Seated Machine Leg Curl', 8] };

function progressSeed(now = Date.now()) {
  const t0 = new Date(now); t0.setHours(18, 0, 0, 0); if (t0.getTime() > now) t0.setDate(t0.getDate() - 1);
  const days = [];
  for (let i = 182; i >= 0; i--) { const d = new Date(t0); d.setDate(d.getDate() - i); days.push(d); }
  const byW = { 'Upper Push': [], 'Upper Pull': [], Legs: [] }, acts = [];
  days.forEach((d, i) => {
    const wk = Math.floor(i / 7); if (wk === 9 || wk === 17) return; // two weeks off
    const dow = d.getDay();
    if (dow === 1) byW['Upper Push'].push(d); else if (dow === 3) byW['Upper Pull'].push(d); else if (dow === 5) byW.Legs.push(d);
    else if (dow === 2) acts.push(['Muay Thai', 'Session Complete', d]); else if (dow === 6 && wk % 2) acts.push(['Swimming', 'Swimming', d]);
  });
  const sessions = [];
  Object.keys(byW).forEach(w => {
    const n = byW[w].length;
    byW[w].forEach((d, k) => {
      const ex = {};
      Object.keys(PLAN[w]).forEach(x => {
        const s = PLAN[w][x](k, n, d.getTime(), now); if (!s) return;
        const rn = RENAMED[x]; ex[rn && k < rn[1] ? rn[0] : x] = s;
      });
      sessions.push({ id: 's' + w.replace(/ /g, '') + k, mt: 1, workout: w, date: d.toISOString(), exercises: ex, duration: 3300 + 60 * (k % 9) });
    });
  });
  acts.forEach(([w, x, d], i) => sessions.push({ id: 'a' + i, mt: 1, workout: w, date: d.toISOString(), exercises: { [x]: [{ kg: 0, reps: 0 }] }, duration: 3600 }));
  sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const workouts = {
    'Upper Push': ['Incline Chest Press (Smith/Machine)', 'Machine Chest Flys', 'Dips', 'Lateral Shoulder Raise - Dumbbell', 'Triceps Pulldown - Rope', 'Front Shoulder Raise - Dumbbell', 'Incline Chest Press Machine'],
    'Upper Pull': Object.keys(PLAN['Upper Pull']),
    Legs: ['Seated Machine Leg Curl', 'Seated Machine Leg Extension', 'Calf Raise - Standing', 'Romanian Deadlift - Dumbbell', 'Seated Hamstring Curl'],
    'Muay Thai': ['Session Complete'], Swimming: ['Swimming'],
  };
  // Active goal on the incline press, started 6 weeks ago from that day's top set; an archived one never shows
  const gs = new Date(t0); gs.setDate(gs.getDate() - 42); const gt = new Date(t0); gt.setDate(gt.getDate() + 135);
  const startKg = sessions.filter(s => new Date(s.date) <= gs && s.exercises['Incline Chest Press (Smith/Machine)']).pop().exercises['Incline Chest Press (Smith/Machine)'][0].kg;
  const goals = [
    { id: 'g1', mt: 1, exercise: 'Incline Chest Press (Smith/Machine)', startKg, startDate: lday(gs), targetKg: startKg + 12.5, targetDate: lday(gt), archived: false },
    { id: 'g0', mt: 1, exercise: 'Lat Pulldown Machine (Uni Lateral)', startKg: 35, startDate: lday(t0.getTime() - 170 * DAY), targetKg: 40, targetDate: lday(t0.getTime() - 60 * DAY), archived: true },
  ];
  return { sessions, workouts, wm: 1, goals, core: {}, lastModified: now - 1000 };
}

module.exports = { progressSeed };
