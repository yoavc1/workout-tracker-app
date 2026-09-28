# Workout Tracker — feature roadmap

Plan for the next round of features. It covers the decisions from the spec interview (29 Sep 2026), the bugs found in the current code, one shared data model that every feature builds on, and the order of work.

Baseline: PR #1 (merged) fixed the cut-off bottom nav and replaced last-writer-wins sync with a merge. Saves sync about 2s after each change, on launch, when the app is reopened and when the connection returns, and sync failures show on the home screen.

---

## 1. Decisions from the interview

| Topic | Decision |
|---|---|
| Google Sheet | Keep syncing to the Sheet (free). It holds the app's data safely and also has a **readable Log tab**: one row per set, which you can filter. |
| Progress metric | **Estimated 1-rep max (e1RM)** combines weight and reps, so a rep PR at the same weight counts. Top-set kg is shown alongside. |
| Changing exercises mid-workout | Changes are **session-only**. At Finish, the app offers to update the saved workout and lists the changes. |
| Reminders | **In-app banner** at the top of the app, driven by live data. No email, calendar or push for now. |
| Goals | **Target kg by a date** (e.g. Incline Chest Press 40 → 65 kg by 28 Mar). A straight line from start to target decides ahead / on track / behind, plus the kg per week still needed. |
| Core | A **one-tap daily tick**, available on any day. You can open it to log that day's core exercises, choosing **reps or time** per exercise (plank = time, leg raises = reps). |
| Schedule button | All four: **weekly plan editor**, **calendar of done vs planned**, **start today's workout**, **move a missed day**. |
| Balance alerts | Alerts are about **muscle groups** first and name the 1–2 exercises causing the problem. |

## 2. Overlap with PR #1

| Idea | Already done in PR #1 | Still to do |
|---|---|---|
| Schedule menu | Renaming a workout carries its plan day over | Everything else. The weekly plan is still local-only (not synced). |
| Reorder / one-off exercises | Sync pauses while a workout is open, because sets are tied to exercise position | The whole feature. Keying sets by exercise name removes the reason for that pause. |
| Progress + real-time saving | Reliable merge sync, visible failures, sync on resume | Charts and metrics. The Sheet backend: PR #1's optional `backend/Code.gs` stores data in a Drive file, but you want the Sheet, so it gets replaced (step 0b). |
| Core | Core toggles now sync correctly | How core is shown and logged. |
| Goals | — | Everything. |
| Reminders | Stale data after reopening the app is fixed by syncing on resume | The alert engine and the bugs listed below. |

## 3. Bugs found in the current code (fixed as part of each feature)

**Insights banner (built in F)**
- Shows only one insight, picked by a counter that goes up on every launch (`ins_idx`), so what you see looks random.
- The first time you ever log an exercise, it counts as a "New PR" (the previous best starts at 0).
- "Sessions this week" means the last 7 days, not the calendar week.
- Day counts and "scheduled today" don't refresh when you reopen the app on a later day. iOS resumes the app without reloading it, and `rHome()` only reruns when data changes.
- "Scheduled for today" reads the weekly plan, which isn't synced, so it can be wrong on a second device.
- The Week / 2 Weeks / Month choice isn't saved.

**Progress page (built in D)**
- The chart uses its dark-theme colours by default: white points and invisible grid lines on a white card.
- The default range is one week, so most exercise charts show only 1–2 points.
- The x-axis groups points by "28 Sept" with no year, so the All range merges different years.
- The overview shows "No data" for any exercise skipped in the last session, even with history before that.
- Bodyweight exercises (0 kg, e.g. Dips) show 0 → 0 and never show progress.
- The exercise dropdown is one long A–Z list with no grouping.
- The progression calendar's legend colours don't match its cells.

**Core (built in C)**
- The core checkbox only appears on days you logged a workout, so a rest-day core session can't be logged.
- Core is stored on every session that day (`abs`) instead of once per day.
- History uses a cryptic "C" button.

**Workout screen (built in A)**
- ↑/↓, ✏️, + and Remove all edit the saved workout, not just today's session.
- Renaming an exercise edits only the saved workout, so its history stays under the old name and its progress chart splits in two.

**App-wide**
- The Dark Mode toggle does nothing, because both themes are light. Proposal: remove it for now (§8).

---

## 4. Shared data model (v2)

Every feature reads and writes through this model, so it is built first (step 0b). Parallel work then won't collide on the data layer.

```js
{
  sessions: [{ id, mt, workout, date, duration,
               exercises: { "Incline Chest Press": [{ kg: 40, reps: 10 }] } }], // key order = order performed
  workouts: { "Legs": ["Squat - Dumbbell", ...] }, wm,          // saved workouts (templates)
  schedule: { week: { Mon: "Legs", Tue: "", ... }, wkm,          // weekly plan (now synced)
              moves: { "<id>": { id, mt, from: "2026-09-28", to: "2026-09-29", workout: "Legs" } } },
  core:     { "c2026-09-28": { id, mt, date: "2026-09-28", done: true,
              items: [{ name: "Plank", mode: "time", sets: [{ secs: 60 }] },
                      { name: "Leg Raise", mode: "reps", sets: [{ reps: 15 }] }] } },
  goals:    [{ id, mt, exercise, startKg, startDate, targetKg, targetDate, archived }],
  muscles:  { "Incline Chest Press": "Chest" }, mm,              // only your overrides; defaults are guessed
  deleted:  { "<id>": ts }, lastModified
}
```

**Merge rules** (extending PR #1's `mergeD`):
- **Record collections** (sessions, core days, goals, schedule moves): combined by `id`. The newest `mt` wins, and tombstones in `deleted` remove records.
- **Single documents** (workouts, weekly plan, muscle overrides): the one with the newest timestamp (`wm`, `wkm`, `mm`) wins.

**One-time migrations:**
- `session.abs === true` → `core[date].done = true` (`abs` stays, so older app versions still read it).
- Local `ironlog_split` → `schedule.week`.
- The workout draft moves from sets keyed by position to `{ workout, list: [names], sets: { name: [...] } }`.

**Shared helpers** (in `js/stats.js`, built in step 0b):
- `e1rm(kg, reps)`: Epley formula, kg × (1 + reps/30), with reps capped at 12 for accuracy.
- Bodyweight exercises track best reps, and time-based core tracks best hold time.
- `exerciseSeries(name)`, `bestRecent(name, days)`, and `status(name)`, which returns progressing / stalled / regressing (see D).
- `muscleOf(name)`: your override, otherwise a keyword guess (bench/chest/fly → Chest, row/pulldown/lat → Back, curl → Biceps, and so on).

**Stays on the device only:** the in-progress draft, theme, sync URL, sync status, and banner snoozes.

---

## 5. Work plan

### Phase 0: Foundation (sequential, 2 PRs)

**0a · Split the app into files, no behaviour change.**
`index.html` is about 750 lines, and every feature below would roughly double it. More importantly, parallel work on a single file collides constantly. So:
- Move the code into `css/app.css` and `js/{data,sync,stats,home,workout,progress,history,settings}.js`, loaded as plain `<script>` tags. There is no build step, so GitHub Pages works unchanged.
- Add version query strings (`app.js?v=…`) so a phone never mixes new HTML with old cached JS.
- Commit the test harness from PR #1: `tests/merge.test.js` (Node) and `tests/smoke.js` (headless Chrome at 393×852 against a mock sync server). Every later PR must pass both.

**0b · Data model v2 and the Sheet backend.**
- Implement §4: the new fields, merge rules, migrations, `stats.js` and `muscleOf`.
- Replace `backend/Code.gs` with a Sheet-based script:
  - A hidden `_data` tab holds the app's JSON, split into 40,000-character cells (a single cell caps at 50,000). Writes use a lock.
  - A readable **Log** tab (Date · Workout · Exercise · Muscle · Set · kg · reps · secs · e1RM) is rewritten on every save.
  - **Core** and **Goals** tabs.
  - Daily backups: 14 days in a hidden `_backups` tab.
  - It uses only Sheet permissions (no Drive access) and stays free.
- **Needs from you:** paste your current Apps Script, so the new one keeps your existing sheet layout working.

### Phase 1: Feature tracks (can be built in parallel; each is its own PR)

**A · Workout: session vs saved workout**
- Opening a workout copies its exercise list into the session. From then on, reorder, add and remove affect **only this session**.
- Drag-to-reorder at any time, using the SortableJS library (loaded from cdnjs; supports touch). This replaces the ↑/↓ buttons.
- **+ Add exercise** has type-ahead over every exercise you've ever logged. New names are allowed and are session-only.
- Finish shows "Also update *Legs*?" with the changes listed (added / removed / new order), and buttons **Update workout** / **Just this session**.
- Saved workouts are edited in **Manage Workouts → Edit exercises**: drag, add, remove, rename. Renaming offers "also rename in history" so progress stays continuous.
- Sets are keyed by exercise name, so the sync pause during workouts goes away.
- *Done when:* reordering or adding mid-session never changes the saved workout unless you confirm at Finish; a half-finished workout reloads correctly after the app is killed; old drafts migrate.

**B · Schedule (top-right 📅)**
- A full-screen sheet with, from top to bottom:
  1. **Today:** the planned workout with a **Start** button, or "Rest day".
  2. **Week plan:** Mon–Sun rows. Tap to choose a workout or Rest, drag to swap days. Synced across devices.
  3. **Month calendar:** done days (coloured by workout), upcoming planned days (outlined), missed planned days (red dot). Tap a day to see what you logged or to log it.
- **Move a missed day:** a missed planned day from the last 3 days gets **Do it today** or **Tomorrow**. This records a `move`, so the calendar and alerts both understand it.
- The home screen gets the same **Today** card at the top.
- The progression calendar on the Progress page moves here (§8), so there's one calendar, not two.
- *Done when:* the plan matches on phone and laptop; a missed Monday leg day moved to Tuesday shows as planned on Tuesday and is no longer reported as missed.

**C · Core**
- A **Core** chip on the home screen every day: ✓ when done, a one-tap toggle, plus "3 of last 7 days".
- Tapping the chip opens **Today's core**:
  - Add exercises with type-ahead from past core exercises.
  - Choose reps or time per exercise; the app remembers the choice for next time.
  - Time mode has a built-in stopwatch for planks.
- The workout screen gets the same chip, so core can be ticked without leaving the workout.
- History shows "✓ Core: Plank 3×60s, Leg Raise 3×15" instead of the "C" button.
- Progress gets a Core section: best hold time and best reps over time.
- *Done when:* core can be logged on a rest day; it's stored once per day; data from the old `abs` field shows correctly.

**D · Progress v2 (e1RM + muscle groups)**
1. **At a glance:** one card per muscle group with a status (progressing / stalled / regressing / not trained lately), its 6-week e1RM trend, and sets per week.
2. **Exercises:** grouped by muscle, each showing current e1RM, top set, 4-week change %, a sparkline and a status chip.
3. **Exercise detail:**
   - A chart with an e1RM line, top-set points, and a goal line if a goal exists.
   - A table of recent sessions.
   - Range 1M / 3M / 6M / All, defaulting to 3M.
- **Status rules** (adjustable constants):
  - *Progressing:* a new e1RM best in the last 3 sessions.
  - *Stalled:* no new best in 3+ sessions.
  - *Regressing:* the average of the last 3 sessions is more than 5% below the 3 before.
- **Muscle groups:** Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes, Calves, Core, Other. The group is guessed from the exercise name and editable from the detail screen.
- Fixes every Progress bug in §3.
- *Done when:* at one glance you can see which muscle groups are progressing and which exercises are stalled, including bodyweight and time-based ones.

**E · Goals (a 4th nav tab: Workouts · Progress · Goals · History)**
- **New goal:**
  - Pick an exercise with type-ahead. Start kg is pre-filled with your best top set from the last 14 days.
  - Enter a target kg and a target date: **3 months**, **6 months** or custom.
- **Goal card:**
  - A progress bar from start to target, showing current kg and the kg expected by today on a straight-line pace.
  - A status: **Ahead / On track / Behind**. "On track" allows ±2.5 kg or ±10% of the gap, whichever is larger.
  - The kg per week still needed.
- Detail: the exercise chart with the pace line overlaid.
- Reaching a target celebrates and archives the goal; archived goals stay viewable.
- *Done when:* the example 40 → 65 kg over 6 months shows the right expected kg for today, and flips to Behind once you fall below the tolerance.

### Phase 2: Smart banner (needs A–E)

**F · Alerts at the top of the app**
- Up to 3 alerts, ordered by priority, with "+N more" to expand. Each has an action button and a snooze (hidden until tomorrow). An alert clears itself once the data resolves it.
- **Types**, in priority order:
  1. **Missed planned workout**: "Legs was planned Monday". Actions: *Do it today* / *Move*.
  2. **Muscle group neglected**: "Hamstrings: no sets in 12 days (usually every 5)", naming the exercises (e.g. Leg Curl, RDL). A group counts as neglected at twice its usual gap, and at least 7 days.
  3. **Slow overload**: "Back is progressing at a third of your average (+1% vs +3% over 6 weeks)", naming the stalled exercises. Needs at least 3 sessions of data.
  4. **Goal behind pace**: "Incline Chest Press: 47.5 kg, should be ~50 kg by now".
  5. **Stalled exercise**: no new e1RM best in 4 sessions.
  6. **Core**: not done in 4+ days.
  7. **Positive**: a real PR this week, or a streak.
- The banner is rebuilt on launch, on reopen, after each sync and at midnight, so it always reflects current data.
- Fixes every insights bug in §3.

## 6. Order of work and how subagents are used

```
0a restructure ─► 0b data v2 + Sheet backend ─┬─► A workout ─┐
                                              ├─► C core     │
                                              ├─► B schedule ├─► F smart banner
                                              ├─► D progress │
                                              └─► E goals ───┘
```

- **Phase 0 is done by me in sequence.** Everything else depends on the shared data model and file split, so parallelising it would only cause conflicts.
- **Phase 1 runs as 5 parallel subagents, each in its own git worktree.** After 0a, each track owns its own files (`js/workout.js`, `js/schedule.js`, …) and only calls the shared data API, so conflicts are limited to a few lines of `index.html` markup. Each agent must:
  - pass `tests/merge.test.js` and `tests/smoke.js`, and add smoke steps for its own feature;
  - open its own PR, with iPhone-size screenshots and anything that needs checking on your phone.
- **PRs land one at a time for your review**, in this suggested order:
  1. **A** (you use it every session)
  2. **C** (small)
  3. **B**
  4. **D**
  5. **E**
- **F comes last**, because it reads from all the others.
- Each PR: you review, type `merge`, and I merge it and rebase the next one.

## 7. Staying free

GitHub Pages hosting, Google Apps Script with the Sheet, Chart.js and SortableJS from cdnjs are all free, and there are no servers to run. Apps Script limits (6 minutes per run, 30 requests at once) are far above what one person logging workouts uses. If you later want lock-screen push notifications, that needs a free Cloudflare Worker (Apps Script can't sign Web Push messages), so it's out of scope for now.

## 8. Open questions

1. **Paste your current Apps Script code.** 0b needs it before it starts.
2. **Muscle group list** (§5 D): add, split or merge any groups? For example, split Back into Lats and Upper back, or Shoulders into Front, Side and Rear.
3. **One calendar:** move the Progress page's progression calendar into the Schedule sheet (recommended), or keep both?
4. **Dark Mode toggle:** remove it for now (recommended), or build a real dark theme as an extra track?
