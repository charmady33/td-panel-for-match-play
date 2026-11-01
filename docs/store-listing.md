# Chrome Web Store listing (item 80) - copy and paste into the Developer Dashboard

## Store listing tab
- **Name:** TD Panel for Match Play
- **Summary (132 characters max):**
  Tournament director tools built into Match Play: finals cutoffs and eligibility, tiebreakers, banks, auto rounds, timers.
- **Category:** Productivity (Tools also fits)
- **Language:** English
- **Description:**

  TD Panel adds tournament-director tools straight into Match Play Events (app.matchplay.events) for pinball TDs.

  • Finals cutoffs with IFPA rank cuts and automatic eligibility labels (new players too, even from the phone app)
  • Ties that matter before finals, with IFPA draw + vote or random tiebreakers
  • Bank Builder: banks balanced by game time and era, best-fit replacement when a machine goes down
  • New rounds by game time, automatic close / start next round, redo of rounds started on a phone
  • Group estimates and live game timers on the Matches tab
  • 1-2-3-4 boxes for entering results and player order
  • Finals check-in, linked qualifying / finals tabs, TD and Scorekeeper labels, Submit to IFPA helper

  It uses your own Match Play API token (read-only) and makes changes only by clicking Match Play's own buttons, after
  you confirm. Not made by or affiliated with Match Play Events.

- **Icon:** icons/icon128.png (already in the zip)
- **Screenshots (1280 x 800, at least 1):** Standings with Finals standings · Manage cutoffs · Bank Builder preview ·
  Matches tab with timers · Results window with number boxes
- **Small promo tile (440 x 280):** optional

## Privacy tab
- **Single purpose:** Tournament director tools inside Match Play Events (app.matchplay.events).
- **Permission justifications:**
  - **storage:** keeps the TD's settings (cutoffs, check-in, banks, the API token) in this browser.
  - **alarms:** checks about once a minute for things the TD switched on (new rounds, finished rounds, new players).
  - **notifications:** tells the TD when a background update finished or needs attention.
  - **Host permission app.matchplay.events:** adds the tools to Match Play's pages and clicks its buttons for the TD.
  - **Host permission api.matchplay.events:** reads the TD's tournaments with their own read-only API token.
- **Remote code:** No, I am not using remote code.
- **Data usage:** tick **Authentication information** (the Match Play API token) only. Then tick all three statements:
  not sold, not used for unrelated purposes, not used for creditworthiness.
- **Privacy policy URL:** https://github.com/charmady33/td-panel-for-match-play/blob/main/PRIVACY.md

## Distribution tab
- **Visibility:** Unlisted (only people with the link) to start; Public later.
- **Regions:** all.

## Upload
- Package: `dist/td-panel-for-match-play-<version>.zip` (the same file as the GitHub release).
- Each update: bump the version, build, then Package → Upload new package → Submit for review.
