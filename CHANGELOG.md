# Changelog

All notable changes, newest first. Versions follow [semantic versioning](https://semver.org/): new features bump the middle number, fixes the last.

## 0.12.0 - 2026-10-31
- Renamed to **TD Panel for Match Play**. Published on GitHub.
- **Update available** notice: the extension checks GitHub Releases (at most every 6 hours) and the toolbar button
  and tournament pages link to the new version, with how to update.

## 0.11.2
- Updates never spin forever: each step has a time limit (2.5 min) and stops with where it was; the helper sends a heartbeat during long waits, so a slow Matchplay isn't mistaken for a stuck helper; if nothing happens for a minute the update stops with a message.
- **Update stopped** banners now also show on the page you started from (e.g. the Organized page), with **Details** (the step-by-step log).
- Deleting shows each sub-step in the progress card (Opening More…, Matchplay's delete window, deleting, checking).

## 0.11.1
- **Delete test tournaments now deletes**: it clicks Matchplay's **Delete tournament permanently** (0.11.0 looked for a button called just "Delete" and cancelled each one). Each delete is counted only when Matchplay says "Tournament deleted" and the tournament is gone from the API.
- A result card on the Organized page after a run: Deleted / Skipped / Failed, each tournament with the reason, **Retry** for failed ones, Dismiss.
- A task can carry on from any page (e.g. after Matchplay moves to your tournament list).

## 0.11.0
- **Toolbar button**: your events - each qualifying with its A/B/C finals underneath (planned finals too), status, current round, an **Auto** tag, and Overview · Matches · Players · Standings links (switches to the tab if it's open). The icon shows how many are in progress. Token box with **Create an API token ↗**.
- **Works with no tab open**: while Chrome is open, the extension checks your in-progress tournaments about once a minute. One with an automatic option on that needs something (a round started on a phone needs banks, a finished round to close/start) and has no tab open is opened in its own minimized window, handled there, and closed; a Chrome notification says what happened (an error leaves the window open with Retry). An open tab in the background keeps checking every 30 s. The header chip says **Watching for new rounds** when this is armed. Needs Chrome running (on Windows: Settings → System → Continue running background apps) and the PC awake. New permissions: alarms, notifications.
- **Finals check-in**: tick several players, then **Confirm** (a bar sticks to the top: "3 changes: check in … · Clear / Confirm"). Waiting ticks show "Will check in" and are saved: other tabs, pages, reloads keep them; a reminder shows on the event's other pages. Ticks Matchplay already matches drop off.
- **Bracket ties**: Matchplay adds its own tiebreaker game when a bracket group ends tied. Its card is labelled ("Tiebreaker · Group 1 · Final · for 1st/2nd"); **Pick tiebreaker game** (IFPA draw + vote, or random) sets that game as its arena; the group's note follows it (playing / done with the order). The extension's own record is only a fallback when Matchplay adds no game. Auto close waits for it.
- **Test tournaments**: Fill random results also fills tiebreaker games (a random arena first) and reads the round fresh, so its count matches the page. **Organized page → Delete test tournaments**: lists only Test tournaments you organize, untick to keep, type DELETE; finals are deleted before their qualifying, each one re-checked first.
- **Submit to IFPA** is one page: checks, results (Copy), meaningful games, notes (Copy), what to do at IFPA, with **Submit results at IFPA ↗** (ifpapinball.com/tournaments/manage/) and **Done** in the header. The Overview note links there too.
- **Bank preview**: the replacement list is a wide popover with full game names (details on a second line); long names wrap in the bank cards.
- Fixed: a cut line named just "FINALS CUTOFF" was read as an "F" division, so its tie didn't show in the A list. A forced re-read (after a change) now always gets the open round's games fresh from the API.

## 0.10.0
- **No page reloads**: after a change, Matchplay fetches the tournament again in place (its Refresh button, or a quick in-app hop behind a still copy of the screen). Tasks that move between tournaments switch inside Matchplay's app too.
- **Live sync**: the extension checks the API every 15 s; when something changed (a score from a phone, an approval, a new round, players), Matchplay's page updates by itself, unless you're busy with it (a dialog open, typing, clicked in the last few seconds).
- **No sidebar**: a status chip next to the tournament name (round, active games, pending approvals); toasts for messages and the auto-round countdown (fixed 10 s, Cancel). API token: first-run box on the page, or the toolbar button (which also clears saved data). Label colors are fixed (B rose, C orange, D purple). One page watcher replaces the old polling timers; Matchplay's Logs are read only on the Arenas and Banks tabs.
- **Finals check-in**:
  - the status changes the moment the task finishes (no wait for the API), and this finals' players are re-read first
  - capped at the finals' bracket size (else its cut line): once full, unticked boxes grey out with "A Finals is full (8 of 8). Untick a player to check someone else in."; more than full says "9 of 8 active: take one out"
  - a loading card while players load; first visits use the saved data of the other tournaments in the set
  - once a finals has started, check-in is locked with a note saying to use Matchplay's Activate / Deactivate
- **Banks**:
  - finals: no "Rebuild banks every round"; once the finals has started, Refresh / Add are locked ("Finals started: banks are locked")
  - every preview (Generate / Refresh / Add) shows the most optimized arrangement first, scored on bank times, eras, repeats and machines shared between banks; Another arrangement = next best
  - click any game in the preview to change it: replacements best first (type, average time, swaps with which bank, ⚠); picks are pinned 📌, kept by Another arrangement; Clear my changes
  - Matches tab: an **Assign bank** / **Change bank** button next to each group's name opens Matchplay's own Assign bank dialog; the status line counts only groups still without a bank
- **Ties**:
  - Finals standings (eligibility applied): the whole tie at a cut-off shows in that division (e.g. 3 tied for 1 spot), then the cut line; a lower division whose list depends on it says "May change: depends on the A cut-off tie (…)" and marks players "(if they lose that tie)"
  - a lower division's tie window says "Break the A cut-off tie first" with a link to it
  - tied players who can't play the division a tie decides (ineligible, or not in it) are greyed and don't play; they go after the others in Matchplay's order. Lower-division cut-line ties count eligible players only
  - tie window options are full-width cards; the window scrolls inside, so buttons stay on screen
  - bracket finals: every tie in a group is listed (e.g. tied for 1st and for 3rd); **Break tie** plays a tiebreaker (IFPA draw + vote or random game) and records it; the result shows by the group and Submit to IFPA uses it
- Fixed: Matchplay's game drawer close button was under the extension's strip (the strip is gone; the progress card keeps clear of drawers).

## 0.9.0
- **Changes run in a hidden helper frame**: Matchplay's pages are worked on out of sight while you keep using your tab. A small "Updating Matchplay…" card shows progress, with **Show me** and **Stop**; tables on the page being changed are greyed until it's done, then the page refreshes in place. If the helper stops responding for 25 s, it falls back to the frozen-screen cover.
- **Rebuild banks every round** (Banks tab) and **Assign banks · Automatic** (Matches tab) can both be on. Auto close/start: close the round → rebuild banks (if on) → start the next round (unpublished when Automatic assign is on) → assign banks → publish.
- **Matches tab** status: "N groups in Round X need a bank", "All N groups have banks", or "No banks yet". The per-group "x of y new" line is gone.
- **Ties that don't matter** show plain "tied" text on the Finals standings table (no color, no "Other ties" list). Matchplay's Ties column ("-" / "Manual") is hidden. Click a decimal points value to see how that tie was resolved.
- **Finals check-in**:
  - columns In / Seed / Name / Status, with "Checking in…" showing right away
  - 3 backups, then **Show more (N)** / **Show less**
  - a player checked in to a higher division drops off the lower division's list and everyone moves up; you're asked first if they're already checked in lower down
  - seeds are only set when the finals uses manual seeding (fixes "Couldn't find 'Update seeds'")
- **Loads with the page**: the last data for each tournament is kept, so the extension's parts show together with Matchplay's instead of a moment later.

## 0.8.1
- Settings save safely: each save changes only that setting, so another open tab of the same tournament can't put an old value back; changes show in every open tab right away.
- With **Rebuild banks every round** on, the Matches tab shows a note instead of the Automatic checkbox (it can't switch Rebuild off any more).
- The eligibility window reopens after **Load / Reload IFPA ranks**, with your cuts kept.

## 0.8
- **Ties**: only ties that change the finals are flagged - a cut line (who makes A/B/C, incl. eligibility), a bye line (from each finals' bracket size) or a game-pick line (top seed in each group picks). Others are listed under "Other ties". Resolved ties never show. The **Unresolved tie** tags are on the *Finals standings (eligibility applied)* table; clicking one opens one window: why it matters, who's tied (points, IFPA rank, head-to-head) and how to resolve it (cut lines: IFPA draw + vote or random game; byes/picks: head-to-head then IFPA rank, or play a game).
- **Eligibility** (qualifying Players tab): **Add eligibility** - a B cut, then **+ Add another cut** for C, D… (as many as Matchplay's finals cut lines). Labels say what a player can't play: "B/C Ineligible", "C Ineligible"; eligible everywhere = no label. Only A finals = nothing needed. Other labels are kept.
- **Finals Arenas tab**: **Copy N arenas from <qualifying>** (Matchplay's own "Add from qualifying" can show "Unknown · 0 arenas").
- **Finals check-in** shows even before any players are added.
- **Rebuild banks every round** is on the Banks tab. With Auto close/start on: close the round → rebuild banks → start the next round unpublished → assign a bank to each group → publish. Only one automatic bank option can be on (this, or Matches → Assign banks · Automatic).
- **Assign banks** never gives a bank to two groups while free banks are left; banks already used this round (also by hand) and groups that already have a bank are skipped.
- **Faster**: fixed pauses replaced by "wait until Matchplay is done" checks (a 3-bank Refresh went from about 18 s to 6 s in testing). Matchplay's page is refreshed before the frozen screen lifts, and you're put back where you were scrolled.
- Rounds are always read oldest first (Matchplay sends newest first) - this fixes auto close/start not firing. Tournament details reload when you switch tabs and when Matchplay says a round/tournament started.

## 0.1.0 – 0.7.x
Earlier versions (0.1.0 to 0.7.3): the first TD panel, finals divisions and eligibility, IFPA ranks, check-in, tie
alerts, game timers, Bank Builder on Match Play's Banks tab, Submit to IFPA, auto close/start round. Their zips are
attached to the matching releases.
