# TD Panel for Match Play — notes for Claude

Chrome MV3 extension for pinball tournament directors on app.matchplay.events. Tools are built into Matchplay's own
pages (no sidebar). Current version: **0.18.3** (see README.md for what each version added).

## How the maintainer (Clark) wants to work
- **Propose a plan first, then wait for "code it".** Don't change code until he says so. Number each proposed item
  (the next free number is **66**; 35 and 39 are agreed and waiting — see docs/PENDING.md).
- Edit files in place with targeted changes; don't rewrite whole files.
- Explain in plain language; he's a TD, not a developer. Keep messages short and concrete.
- Each release: bump `manifest.json` "version", `TDP.VERSION` in `src/util.js` and `package.json`; add the version at
  the top of CHANGELOG.md; run `node scripts/build.js` (makes `dist/td-panel-for-match-play-x.y.z.zip`); commit,
  tag `vx.y.z`, push, and create a GitHub Release with that zip (the extension's update check reads the latest release).
- Version numbers: bug-fix only = patch (0.11.**3**), new features = minor (0.**12**.0).

## Settings worth knowing
- `T.dead`: the extension was updated while the tab was open (chrome.runtime.id gone) - main.js lifts the cover
  and shows a reload bar; everything else stops.
- `T.settings.off` (toolbar switch): main.js tears down and skips everything; bg.js shows OFF and watches nothing.

## Hard rules
- **Never edit tournaments Clark actually ran.** Only his test tournaments (marked Test) or test tournaments you create.
  "Timing test (extension)" (#280212) is one of ours; "test tuesday" (#280207) and its finals are his test events.
- **Never ship or embed an API token.** Each TD pastes their own (toolbar button or first-run box).
- Matchplay's official API (api.matchplay.events) is **read-only**: use it for reads. All changes are made by
  driving Matchplay's own UI (src/mpui.js). Don't call Matchplay's internal write endpoints.
- Never click a final permanent delete yourself while testing (Delete test tournaments): Clark does that click.

## Layout
- `manifest.json` — content scripts (`src/early.js` at document_start; the rest at document_idle with
  `all_frames: true`, order matters), `bg.js` service worker, `popup/` toolbar button.
- All content scripts share one global namespace `TDP` (`T` inside modules). UI lives in Shadow DOM using copies of
  Matchplay's Tailwind look (`T.panel.CSS`).
- Key modules:
  - `util.js` storage (chrome.storage.local, localStorage fallback for tests), settings, per-tournament state
    `T.tstate[tid]` via `T.saveT` (merge-on-save, cross-tab sync), DOM helpers (`findBtn` ignores our own
    `[data-tdp]` buttons — keep it that way).
  - `api.js` rate-limited official API client (queue, ~1 req / 0.65 s, `prio` to jump the queue).
  - `data.js` loads the tournament family (qualifying + linked finals), rounds, games, standings; cache per
    tournament; change signature → `T.sync.auto()`.
  - `jobs.js` multi-step tasks run in a hidden same-tab iframe (`worker.js`, name `tdp-worker`), falling back to the
    tab itself behind a frozen screen (`busy.js`). Steps: `{tid, page, op, args, label}`; ops are in jobs.js.
    Each step has a 150 s limit; a heartbeat every 5 s; `note()` records sub-steps shown in the progress card.
  - `mpui.js` drivers for Matchplay's UI (labels, players, banks, rounds, results, arenas, delete…).
  - `sync.js` refreshes Matchplay's page in place (its Refresh button, or an in-app route hop) — no reloads.
  - `finals.js` divisions from cut lines, eligibility, plan/backups, ties that matter (cut/boundary/bye/pick),
    straddles, bracket group ties (incl. Matchplay's own tiebreaker games, set 9999).
  - `ties.js` tiebreaker windows; `inpage.js` Standings / Matches / reminders / group buttons; `embed.js` finals
    check-in; `elig.js` eligibility labels; `bankbar.js` + `bankplan.js` + `banks.js` Bank Builder;
    `arenatab.js` game times + categories; `timing.js` game timing rules; `ifpa.js` Submit to IFPA page;
    `smart.js` "Any category (game time)" round option (planner + Start round window) and down-machine bank fixes;
    `plays.js` Stats → Plays sub-tab; `timers.js` Matches group Est. + game timers, Stats Rounds Max est.; `quicktest.js` Quick test setup on Create new tournament; `rounds.js` "New rounds use" default + redo of rounds started elsewhere; `live.js` real-time socket for open tabs (bg.js has its own); `deltest.js` Delete test tournaments; `panel.js` header chip, toasts, token prompt; `main.js` wiring,
    one MutationObserver page watcher, auto close/start, auto banks/assign/fill, background-window runner.
  - `bg.js` background watcher (alarms, ~1/min): opens a minimized window for tournaments with automatic options
    when no tab is open; badge; notifications. `popup/` lists the TD's events (qualifying + finals) and the token.

## Matchplay facts worth knowing
- SPA (React + Redux). Data is fetched once per tournament; tabs don't refetch. Rounds API returns newest first
  (we sort ascending). Group Actions menu items wrap the real button.
- Start next round modal: "Publish round immediately (recommended)". Unpublished round = "Pending" + Publish.
- Delete: More… → Delete tournament → window "Delete tournament" with button **"Delete tournament permanently"**
  (only allowed for test tournaments); toast "Tournament deleted".
- Bracket ties: Matchplay adds its own tiebreaker game (set 9999, "No arena", Assign arena).
- Arena dialog (Change/Assign arena) is a `<select>` with arena names + Save.
- Start next round window: `select#categoryId` (0 Any category, -1 Don't draw arenas, 1-3 EM/SS/DMD, 4-8 labels).
  A game's cell on the Matches tab has an **Arena** button + `a[href$=/matches/{gameId}]` (Details → side panel →
  Change arena); the arena window's `<select>` values are arena ids. A deactivated arena = `tournamentArena.status: inactive`.
- A round's own **Actions** menu (Matches tab): Print sheets, Assign arenas (select automatic / category_id_1-8, + greedy),
  Add group…, Activity log, Open arenas, Clear all arenas (type "clear arenas" → Remove arena assignments), Delete….
- An unplayed game's `resultPositions` is `[null, null, …]` - use `T.timing.hasScore(g)`, never `.length`.
- Group Actions → **Change player order**: rows P1… (name, "Seed: n"); click a player, then "Move to player N"; Save / Cancel / Flip order.
- Final round: Matchplay may close it itself (no Close round button) — see item 37.
- Real time API (experimental): Pusher web socket wss://ws.app.matchplay.events/app/tnrxzkahdeullnwje83e?protocol=7&client=js&version=8.5.0&flash=false,
  channel tournaments.{ID}; events RoundCreatedOrUpdated, GameCreatedOrUpdated, RoundsDeleted, … (see item 59).
- More in docs/matchplay-reference.md.

## Game timing rules (verified live 2026-10-26 on #280212: within 1 s)
- Start = latest of round start, end of the group's previous game, end of the previous game on the same machine.
- End = earliest of approval (startedAt + duration), first full set of suggested scores, Logs "Suggestion created".
- Only 2 min – 2 h games count; per-machine median; drop > 3× median; tiebreakers/byes excluded.

## Testing
- `test/` — Playwright scripts that inject the bundle into mock Matchplay pages (API mocked with `page.route`), plus
  unit scripts. Run with `node test/<file>.js [outDir]`. Useful ones: `v016_ui.js` (New rounds use, redo, live events), `v0152_ui.js` (quick test box, update bar), `even_unit.js` (round lengths), `v015_ui.js` (timers, Max est., on/off), `v014_ui.js` (Plays tab, optional ties, vote Change…, results grid), `smart_unit.js` (game-time planner), `down_unit.js`
  (down machine in banks), `dup_unit.js` (bank duplicates),
  `sched_unit.js`, `gt.js` (bracket ties), `cascade.js` (finals standings ties), `embed_ui.js`
  (check-in; env CAP=1 / DONEJOB=1 / MOVEUP=1), `t6.js` (bank refresh via worker frame; PICK=1 picker),
  `del2.js`/`del3.js` (delete flow), `grp.js` (group Assign bank), `t5.js <out> 280051 arenas|overview|matches`,
  `ext.js` (loads the real unpacked extension in Chromium: service worker, popup, background window).
- Needs `npm i playwright` and Chromium (`npx playwright install chromium`); `ext.js` uses `channel: 'chromium'`.
- `test/fixtures.js` = qualifying #280051 with A/B finals #280073/#280074 (data snapshot).
