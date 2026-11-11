# Coach: ask Claude about your training

The app writes a **Coach** tab into your Google Sheet. It holds the app's own verdicts: statuses, trends, gaps, goals, this week against the plan, and recent workouts. A Claude chat with Google Drive connected reads it, so you can ask "what am I neglecting?" from your phone and get answers that match what the app shows.

## One-time setup (about 10 minutes)

1. **Update the Apps Script.** This adds the Coach tab and the Log's rest columns.
   - Open the Sheet **Workout Tracker App Data**, then **Extensions → Apps Script**.
   - Replace everything in `Code.gs` with [`backend/Code.gs`](../backend/Code.gs), and click **Save**.
   - Choose **Deploy → Manage deployments → ✏️ (Edit) → Version: New version → Deploy**.
   - The URL stays the same, so nothing changes in the app.
2. **Open the app.** It saves to the Sheet as usual, and the **Coach** tab appears. If nothing has changed, the app still sends a fresh summary once on the first day it's opened.
3. **Connect Google Drive in Claude.** In claude.ai or the Claude app, go to **Settings → Connectors → Google Drive**.
4. **Create a Claude Project** called *Training coach*, and paste the instructions below into its project instructions.
5. **Ask away** from any chat in that project. Some examples are further down.

## Project instructions (paste this)

```
You are my strength-training coach. My training log is the Google Sheet "Workout Tracker App Data" in my Google
Drive, kept up to date by my workout app. Read it with the Google Drive connector before answering anything about my
training.

How the Sheet is laid out:
- Coach tab: the app's own summary. Start here. Its "Updated" line says when the app wrote it. If that is more than a
  day before today, say the data may be out of date (opening the app refreshes it).
  - About: today's date, totals, and how statuses are judged.
  - Flags: gaps and highlights the app found: neglected muscle sub-groups, slow progress, goals behind pace, stalled
    exercises, core, missed planned workouts, new bests, streaks.
  - Muscle groups: status, 6-week trend, sets per week and last trained date, for each group and sub-group.
  - Exercises: status, latest and best (e1RM kg, reps or hold seconds), 4-week change, latest top set, last done.
  - Weekly volume: workouts, core days and sets per muscle group for each of the last 8 weeks.
  - Goals: target kg by a date, current vs expected today, status, kg per week still needed.
  - This week: the plan against what was logged.
  - Recent workouts: the last 12, with minutes, sets, volume, average rest, vs last time and new bests.
- Log tab: one row per set, newest first: Date, Workout, Exercise, Muscle (group/sub-group), Set, kg, Reps, Secs,
  e1RM, Logged at, Rest before (s). Use it for detail the Coach tab doesn't have: one session, rep ranges, rest
  patterns. Rest times exist only for sets logged since 11 Nov 2026.
- Core and Goals tabs: core days and goals. Ignore the "data" tab (the app's raw storage).

How to answer:
- Use the Coach tab's statuses and numbers as they are; they match what my app shows. Work things out from the Log
  only when the Coach tab doesn't cover the question, and say that you did.
- Weights are kg. e1RM is the estimated 1-rep max. Muay Thai, swimming and similar are activities: they count as
  training days, not as lifting progress.
- Be specific: name exercises, dates and numbers. Keep it short unless I ask for more.
- For gaps or "what next", look at Flags, Muscle groups (sets per week, last trained), This week and Goals, then
  suggest concrete changes for my next sessions: exercise, sets x reps, target kg.
- You can't change the app or the Sheet. If something should change (plan, goals, exercises), tell me what to change
  in the app.
```

## Example questions

- What am I neglecting right now?
- Which exercises have stalled, and what should I try?
- Am I on track for my incline press goal? What do I need per week?
- How did this week go against my plan?
- How long am I resting between sets on leg day, and is it too long?
- Plan my next Upper Push session from my recent numbers.

## What's in the Sheet

| Tab | What it holds |
|---|---|
| **Coach** | The app's summary, written as stacked tables: About, Flags, Muscle groups, Exercises, Weekly volume, Goals, This week, Recent workouts. Rewritten at each save; edits there are overwritten. |
| **Log** | One row per set. New: **Logged at** and **Rest before (s)** for sets logged live in a workout. |
| **Core**, **Goals** | As before. |
| **data**, **_backups** | The app's own storage and daily backups. |

## How it works

- At each save, the app builds the summary (`coachSummary` in `js/coach.js`) with the same code its screens use: e1RM, statuses, muscle groups, the alert engine and goal pace. It sends the summary along with the data, like the Log's muscle column.
- The Apps Script writes the summary into the Coach tab exactly as sent, as plain text, and keeps it out of the stored data.
- The app decides what's in the Coach tab, so adding to it later needs no redeploy.
- The summary refreshes at every save, and once a day the app is opened, so "this week" and "not trained lately" stay current.
- The Sheet stays in your Drive. Claude reads it only in chats where Google Drive is connected and you ask about your training.

## Later: a full connector

A custom connector (MCP server) could give Claude purpose-built tools, including ones that change things ("move Friday to Saturday", "add a goal"). That needs a small server outside GitHub Pages and Apps Script, such as a free Cloudflare Worker, plus a login so your log isn't public. It's only worth building if reading the Sheet turns out not to be enough.
