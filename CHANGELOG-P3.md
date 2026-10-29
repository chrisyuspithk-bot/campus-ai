# Campus AI — P3 (classes, assignments, exams, question bank, community/apps)

The P3 source was already in place: `src/lib/p3/*`, the routes below, `drizzle/0003_p3.sql` and `scripts/seed-p3.ts`. This round connected it to the live demo and checked it against s123, t09 and admin.

## Shipped
- **Teacher classes**
  - `/t/classes` shows a card per class with the member count and how many assignments are in progress, being attempted or not handed in.
  - `/t/classes/:id` shows logins this week, AI tokens this week and the class average. It lists members with last login, 7-day AI use and average score, plus recent assignments.
- **Teacher assignments**
  - `/t/assignments` lists assignments.
  - `/t/assignments/new` is a 4-step wizard: choose a paper or upload a worksheet, then class, deadline and time limit, then options (lock AI, shuffle), then confirm.
  - `/t/assignments/:id` is the monitor view. It refreshes every 10 seconds and shows each student's status, questions answered, time left, tab switches and score. Teachers can end or delete an assignment.
- **Teacher alerts:** `/t/alerts` lists students who need attention: low engagement, quota, safety or low scores. Alerts come from demo data and can be dismissed.
- **Student assignments**
  - `/s/assignments` has To do, Submitted and Graded tabs. `/s/assignments/:id` is the intro page and `/attempt` is where students answer, with KaTeX for maths. `/result` shows the result.
  - `/s/classes` lists the student's classes and recent assignments.
- **AI lock during exams:** while an exam-mode attempt is in progress, `/ai` shows "考試模式：AI 已鎖定". All AI generation (`gate()` in `src/lib/ai/run.ts`) returns `exam_locked`.
- **Question bank and papers**
  - `/t/bank` is the question bank, with AI variants at `/t/bank/:id/variants`.
  - `/t/papers` builds papers, with `/edit` for editing and a print view.
- **Community and apps**
  - `/t/community` lets teachers share resources, like them and save them.
  - `/t/apps` and `/s/apps` show a gallery of apps approved by the school.
  - The spec makes community teacher-only, so there is no `/s/community`.
- **Self-practice:** `/s/practice` draws questions from the school bank. Adaptive practice is still locked (P6).
- **Phases:** `CURRENT_PHASE = 3` unlocks the P3 nav. P4–P6 pages (`/s/wrongbook`, `/t/grading`, `/t/reports` …) still show the locked page.
- **AI:** uses OpenRouter when a key is set and falls back to the mock otherwise. App-side quotas apply. No OpenWebUI.

## Deploy steps run (2026-10-27)
1. Backed up the DB to `data/campus.db.bak.pre-p3-*`.
2. Ran `npm run db:seed`. This applied migration 0003 and seeded the P3 demo data: classes 3A/3B/4B and 3A English, extra demo students (s124–s134, s202–s206, s301–s306) and teacher t15, the bank, papers, assignments and attempts, and community posts. It runs once (marker `p3SeedInit`).
3. Ran `npm run build` (OK).
4. Restarted `npx next start -H 0.0.0.0 -p 3060`, logging to `/tmp/campus-ai-3060.log`.

## Smoke checks (live demo)
- **s123:**
  - `/s/studio` shows 4 tiles, and a URL-only YouTube link creates video notes.
  - `/s/assignments`, `/s/classes`, `/s/apps` and `/s/practice` all return 200.
  - Starting the 因式分解測驗 attempt makes `/ai` show the exam lock. The test attempt was deleted afterwards so s123 isn't left locked.
- **t09:** `/t/classes`, the class page, `/t/assignments`, the monitor view, the wizard, `/t/alerts`, `/t/bank`, `/t/papers`, `/t/community`, `/t/apps` and `/t/studio` (5 tiles) all return 200. P4 routes are locked.
- **admin:** `/a`, `/a/features`, `/a/users` and `/ai` return 200.
