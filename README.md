# Altumind Internship Assessment — Deployment Notes

## Files
- `index.html` — the full app. Single file, deploy as-is to GitHub Pages.
- `backend.gs` — Apps Script backend. Paste into a new Apps Script project bound to a Google Sheet.

## Setup order
1. Create the Google Sheet and Drive folder first (empty is fine — the script creates tabs automatically).
2. Paste `backend.gs` into Extensions > Apps Script on that Sheet, fill in `SHEET_ID` and `DRIVE_FOLDER_ID`.
3. Deploy as Web App (execute as *me*, access *anyone*). Copy the resulting URL.
4. Paste that URL into `ENDPOINT_URL` near the top of `index.html`.
5. Push `index.html` to a GitHub Pages repo (new filename if replacing an older version — Pages caching is aggressive).
6. Open the live link yourself once end-to-end (both sessions, including a video item) before sending it to candidates, and check the Sheet + Drive folder populate correctly.

## What's implemented per your confirmed spec
- Two independent sessions (Quant + Communication / Behavioral), selectable at the start screen, same link.
- Global countdown timer per session (90 min / 60 min), auto-submits everything at zero.
- Per-question stopwatch that pauses on Review and resumes/accumulates on return, stops permanently at Submit.
- One question per screen, question map showing not-started / in-progress / submitted, locked questions cannot be reopened.
- Session 2 role selection drives which competency scenarios appear — multi-track candidates get the full 6-scenario set per track (12 if two tracks).
- Video capture (90 sec cap, live preview, re-record allowed until submit) for the two video Communication items.
- All answers and timing sent to Apps Script on every question submit (not just at the end), so a browser crash mid-session doesn't lose earlier answers.
- Rubric is intentionally not built into this app — score manually against your existing rubric using the Responses sheet.

## Assumptions made that you should sanity-check
- **Session 2 time limit (60 min):** not explicitly specified for this session; matches Session 1's current 60 min. Change `SESSION_TIME_LIMITS.session2` in `index.html` if that's wrong.
- **Quant mix:** 6 objective (MCQ, auto-graded and logged as correct/incorrect in the sheet) + 3 subjective (written reasoning) items. MCQs are fast to answer honestly but slow to usefully copy-paste-and-outsource one at a time, which was the point of adding them. Communication kept at 3 items (1 written, 1 Mom's Test critique, 1 video) to fit the 60-minute window — dropped the second video item from the earlier draft for time. Add/remove items in the `QUANT_ITEMS` and `COMM_ITEMS` arrays in `index.html`; MCQ items need `type:"mcq"`, `options:[]`, and `correctIndex`.
- **Design:** kept intentionally plain/functional (sage-and-paper palette, serif headline / sans body) rather than your full pitch-deck branding (forest green / gold), since this is a timed test candidates need to read quickly under pressure, not a stage artifact. Easy to swap the CSS variables at the top of the file if you'd rather it match your usual palette exactly.
- **Video codec:** recorded as `video/webm` (what `MediaRecorder` produces natively in Chrome/Firefox/Edge). Safari support for `MediaRecorder` is inconsistent — worth testing on Safari/iOS specifically before candidates use it, or restricting to desktop Chrome/Firefox in your candidate instructions.
- **No resume-across-devices:** if a candidate closes the tab mid-session, submitted questions are safely in your Sheet, but in-progress (reviewed, not submitted) answers and the global timer state are not restored — they'd restart that session. Flag if you want me to add local storage-based resume; I didn't build it since it wasn't in scope you specified.

## Not yet built (flag if you want these next)
- Any auto-scoring — by design, per your rubric-for-manual-review preference.
- Anti-cheating measures (tab-switch detection, copy-paste blocking) — wasn't in your spec; let me know if you want it.
- Resume-after-disconnect for in-progress sessions.
