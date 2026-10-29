# Campus AI — P4 (grading, results, wrongbook, progress, reports, analytics)

P4 builds on P3. It adds the `grades` and `wrong_items` tables (`drizzle/0004_p4.sql`), the libraries in `src/lib/p4/*`, the routes below and `scripts/seed-p4.ts`. `CURRENT_PHASE = 4` unlocks the P4 nav. P5 and P6 (`/t/scan`, `/s/progress/gaps`, `/t/media`, `/s/videos`) stay locked.

## Shipped
- **Teacher grading queue `/t/grading`**
  - Three tabs: 未批 (to grade), 進行中 (in progress) and 完成 (done), each with a count. You can filter by assignment.
  - Each row shows the student, the assignment, when it was handed in, the AI draft score as a percentage and the final score. Attempts that were marked fully automatically are badged 自動評分.
  - [開始批改 →] opens the first item still waiting. A button links to the P2 essay review `/t/grading/essay` and shows how many essays are waiting. The essay page itself is unchanged.
- **Grading workbench `/t/grading/:id`** (3 columns)
  - **Left:** the other students who sat the same paper, with each one's state and AI or final %.
  - **Middle:** the script.
    - MC and short answers are marked automatically.
    - On long answers, the teacher can select text to add a ✓/✗ annotation with a note.
    - A collapsible panel shows the reference answer or marking scheme. Uploaded files can be opened.
  - **Right:** the rubric.
    - Each question shows the AI score next to an editable teacher score.
    - Per-question concept-gap tags and a per-question comment.
    - Comment templates and an overall comment.
  - Buttons: [接受 AI] (accept AI), [儲存（進行中）] (save, in progress) and [完成 · 下一份 →] (done, next). Done writes the total back to `attempts.score` and clears `needs_marking`. It then moves to the next pending attempt, same assignment first.
  - The [AI 初評] button gets a first-pass score for long and upload answers. It uses OpenRouter when a key is set and the rule-based mock otherwise. It goes through `gate()`, so quota and safety checks apply, and the new source is `grading`. Before any model is called, a rule-based draft scores long answers by how many key points of the reference answer they cover.
- **Student result `/s/assignments/:id/result`**
  - A large score, a per-section breakdown and the teacher's comment.
  - Each question shows its score, the teacher's tags and notes, and highlighted annotations.
  - Until the work is graded, the page only shows 已交 (handed in). If the teacher doesn't allow review, the P3 message is kept.
  - **[錯題入簿 (n)]** adds every question the student lost marks on to the wrongbook. Each wrong question also has its own [入簿] button.
- **Script view `/s/assignments/:id/script`:** a printable view of the returned script with annotations. It is only available after marks are released and when the teacher allows review.
- **Wrongbook `/s/wrongbook`**
  - Mistakes are grouped by subject and topic, in two tabs: 未掌握 (to master) and 已掌握 (mastered).
  - Each item shows "my answer", the correct answer (collapsible), where it came from and its redo history. Items can be deleted.
  - **[重做]** (redo) for a topic, [全部重做] (redo all) and "redo this one" all go to **`/s/wrongbook/redo`**. MC and short answers are checked automatically; long answers are self-assessed against the reference. A correct redo marks the item mastered; getting it wrong again reopens it.
  - The studio quiz's "錯題存入錯題簿" button was P4-locked. It now saves the questions a student got wrong (students only).
  - The wrongbook and redo are blocked while an AI-locked exam is in progress.
- **Student progress `/s/progress`**
  - KPI tiles: streak (連續學習天), chats this week, practice this week, average score and open mistakes.
  - Two radars:
    - Topic strengths, from released marks.
    - The six AI-literacy dimensions. These are demo data: a stable per-student baseline nudged by real usage.
  - A 7-day activity chart.
  - Recommendations: practise the weakest topic, redo mistakes, open that subject's tutor, and an AI-literacy tip.
- **Teacher reports `/t/reports`**
  - Pick a class to see its numbers: class average and submission rate.
  - A per-student table: one column per assignment (score, 待批 for "to grade", or 未交 for "not handed in"), plus average, streak, chats, 7-day tokens, open mistakes and last login.
  - **[匯出 CSV]** downloads from `/api/reports/class/:id`. The file is UTF-8 with a BOM so Excel opens Chinese correctly, and each export is written to the activity log as `report.export`.
  - **[列印／存 PDF]** prints the page. The shell (top bar, side nav, AI panel) is now hidden when printing, which also helps the P3 paper print view.
- **Teacher student overview `/t/students/:id`:** KPIs, topic bars, mistake topics, the AI-literacy radar, and assignment history with links into the workbench. In P3 the class member list had a "P4" lock here; it now links to this page.
- **Admin analytics `/a/analytics`**
  - School-wide KPIs: active students this week, questions asked, 7-day tokens, school average, graded vs waiting, and wrongbook items vs mastered.
  - A 14-day token chart and the school-wide AI-literacy averages.
  - A class table (members, average, tokens, not handed in) and average score by class.
- **Teacher home `/t`:** a KPI row (to grade, active assignments, not handed in, alerts, class average). The locked P4 grading tile is now a live link, and there is a new reports tile.
- **i18n:** `src/lib/i18n/dict-p4.ts` has the zh-Hant and English strings. The activity log has two new actions: `grade.done` and `report.export`.

## Demo data (`scripts/seed-p4.ts`, runs once, marker `p4SeedInit`)
- **因式分解測驗（上週）:** a new closed assignment for class 3A 數學, using P3 paper A. All 12 students in 3A have submitted it.
  - **Done (6):** s123, s124, s127, s128, s130, s132. These have teacher scores, comments, tags and annotations.
  - **In progress (1):** s126.
  - **Pending (5):** s125, s129, s131, s133, s134.
- **Wrongbook:** items for s123 and s125 come from their marked work. Each also has one mastered self-practice item.
- **Activity:** 7 days of usage rows for every student, a tutor chat for s125, and practice quizzes for s123 and s125. These give the streak, weekly KPIs and analytics real numbers.

## Deploy steps run (2026-10-27)
1. Backed up the DB to `data/campus.db.bak.pre-p4-1793126466`.
2. Ran `npm run db:seed`. This applied migration 0004 and seeded the P4 data. The seed was tested first on a copy of the live DB and on a fresh `--reset` DB.
3. Ran `npm run build` (OK) and `npm run typecheck` (OK).
4. Restarted `npx next start -H 0.0.0.0 -p 3060`, logging to `/tmp/campus-ai-3060.log`. Only that app's own `next-server` PID was stopped.

## Smoke checks (`node scripts/p4-smoke.mjs`, live demo): 61/61 PASS
- **t09:**
  - `/t` shows the KPIs.
  - The queue tabs have counts (未批 / 進行中 / 完成) and the essay link is there.
  - The workbench has all 3 columns. [AI 初評] ran.
  - Setting s125's long-answer score and pressing done wrote it back: `needs_marking=0`, score 14/17, grade `done`. The page then moved to the next item.
  - `/t/students/:id` loads. The reports table has 12 rows. The CSV downloads as `text/csv` with 12 student rows.
  - `/t/scan` is still locked (P5).
- **s125:** the result page shows the teacher's 14/17 and the comment.
- **s123:**
  - The result page shows the score, sections and teacher notes. [錯題入簿] adds items.
  - The script view loads. The wrongbook groups items by topic.
  - [重做] → redo works, gives feedback and records the redo.
  - `/s/progress` shows a 7-day streak, 20 chats, 8 practice, 88% and 6 open mistakes, plus 2 radars and the recommendations.
  - `/s/progress/gaps` is still locked.
- **admin:** all `/a/*` pages return 200, and `/a/analytics` KPIs and class table load.
- **P1–P3 regression:** every existing s123, t09 and admin route listed in the script returns 200. That includes `/ai`, studio, essay, create, library, assignments, practice, classes, bank, papers, community, apps, drafts, tutors and `/t/grading/essay`.

## Notes
- s123 already had a submitted attempt (2/17) on tonight's 3A 因式分解測驗, from before this deploy. It was left alone. This means s123 cannot start that exam again; use another 3A student, such as s127, for the exam-lock demo.
- The smoke script grades s125 and does a redo as s123, so each run changes demo data a little. Restore `data/campus.db.bak.pre-p4-*` and re-run the seed to reset it.
