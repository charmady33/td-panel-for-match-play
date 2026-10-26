# Matchplay TD Panel v0.8.1

A Chrome extension for tournament directors on app.matchplay.events. On any tournament you run (as organizer, or as a manager) it adds a full-height sidebar on the right and shifts Matchplay's page over. The » button collapses it to a thin strip. Most of the tools also appear directly inside Matchplay's own pages (see below), so the sidebar is optional. It's styled to look like Matchplay's own pages.

## Install (unpacked)
1. Unzip this folder somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `matchplay-td-panel` folder.
4. Open one of your tournaments, go to the panel's **Settings** tab, and paste your Matchplay API token. You can create a token at app.matchplay.events → Account → API tokens.

To update to a newer version, replace the folder and click the reload icon on the extension's card in `chrome://extensions`.

## Tabs
- **Status bar (shown on every tab)**:
  - active games
  - pending approvals: every player has a score or place entered
  - partial scores
  - the current round
- **Status**:
  - round progress
  - games in progress, with real game timers
  - tie alerts
  - whether auto close/start round is on (it's switched on the Matches tab)
- **Finals**:
  - divisions come from Matchplay's cut lines
  - IFPA ranks are read from Matchplay's own IFPA Rankings list
  - you set a rank cutoff and label for each division (B, C…)
  - you can preview the labels before applying them
  - each division shows its planned players and 3 backups, with a "Fix seeds" button
- **Inside Matchplay's pages**:
  - **USA flag** replaces Matchplay's pride flag next to the Match Play logo
  - **Standings tab (qualifying)**:
    - a "Ties to break before finals" box lists each unresolved tie that matters, and why
    - tied players are highlighted in Matchplay's table
    - Matchplay's standings stay on the left, with **Finals standings (eligibility applied)** next to them on the right
    - resolved ties show decimal points (a 5-way tie on 32 → 32.4 … 32.0, winner highest), here and in the Finals standings table; hover for details
    - **Break tie / tags / Matchplay's "Manual" buttons** open the tiebreaker window (IFPA18 §IV.1):
      - seeding-only ties: head-to-head win %, then IFPA rank, no game played
      - bubble ties: "IFPA draw + vote" (one Old EM / Mid SS / New DMD game; click the voted game or Random pick) or "Just random"
      - random player order; click the finishing order; advancers are then seeded by head-to-head; Apply fills in Matchplay's Resolve ties
      - progress is saved: leave and come back with "Enter results" (a reminder bar shows on every tournament page), or Start over
      - an already resolved tie shows its recorded order
  - **Resolve ties page**: important ties are outlined, with the reason shown on each card
  - **Matches tab**:
    - the **Auto close round & start next round** checkbox and its status
    - finals groups with a tie for an advancing spot, or any tie in the final, are outlined
  - **Finals Players tab (each A/B/C finals)**: **Finals check-in**, shown once qualifying is completed
    - the qualifiers in seed order, plus 3 backups
    - ticking a player adds them as **Active**; unticking deactivates them
    - seeds are kept in qualifying order, with backups lowest
- **Banks tab (in Matchplay)**: the **Bank Builder** bar, right above the bank cards
  - games per bank come from Matchplay's "Matches each round" (shown, not editable)
  - no banks yet: **Generate banks** asks how many → preview → Confirm creates them
  - banks exist: **Refresh banks** replaces their games (names kept); **Add banks** asks how many, then creates Bank N+1…
  - Add leaves your existing banks alone and keeps their games out of the new banks when there are enough other games
  - groups play a bank's games in order, so the preview shows each game's expected start (@0:00, @13:20…). A machine in more than one bank is ordered so the groups reach it at different times; any overlap left is marked ⚠
  - games are added to Matchplay in that order (using the bank's Re-order)
  - **Another arrangement** never repeats one already shown or created, and keeps bank times balanced
  - **⚙ Settings**: each game Use / Never / Always; time sources
- **Arenas tab (in Matchplay)**:
  - **Display**: EM / SS / DMD / **LCD**. LCD comes from Matchplay's OPDB data (e.g. Ninja Eclipse); a menu per game overrides it, saved for that arena in every tournament. Bank Builder balances all four; tiebreaker draws count LCD as "New" with DMD
  - **This event**: running average game time; **Combined**: this event + qualifying + Matchplay IDs + ticked past events, weighted by games (what Bank Builder uses; hover for the breakdown)
  - **Game times from** bar: the qualifying is included automatically for a linked finals; add other Matchplay IDs and Load
- **Game times**: a game starts when the group's previous game ends; it ends when its scores were entered. For games the extension didn't watch, that time is read from Matchplay's Logs ("Suggestion created"), so late approvals don't stretch the times
- **Submit to IFPA** (Overview, once the tournament is completed): a step-by-step page
  1. **Results**: finals places first (A, then B, C…), then everyone else by qualifying position; ties numbered right; checks for missing or duplicate IFPA numbers; copy button
  2. **Meaningful games** for the format played (match play, brackets, strikes, Frenzy, best game…) with the math shown; byes, cuts under 50% and formats IFPA wants to hear about are flagged; you can change the number
  3. **Format notes**, ready to paste, with the Matchplay links
  4. **Submit**: link to IFPA and a checklist
  5. **Done**: until ticked, the Overview shows how many of IFPA's 45 days are left
- **Timers**:
  - how long each round took, from the first game's start until every game is done
  - average, min and max game time per arena
  - uses the same game-timing rules as the Carpool Pinball remote app
- **Banks (per round)**:
  - makes new banks for the round that's waiting for games
  - no two games share a bank again if they already did in an earlier round, and games held out last round come back first
  - updates Matchplay's existing banks (and creates more if needed)
  - assigns each group the bank with the most games its players haven't played yet
  - **Automatic every round** switch (off by default)
  - game times come from this tournament, the qualifying, Matchplay tournament IDs you enter, and any tournament you've opened with the extension (saved automatically)
- **Settings**: your API token, label color, and the auto-round countdown length.

- **Matches tab (bank tournaments)**: **Assign banks** gives each group of the new round one of your banks - games its players haven't played, avoiding any bank that shares 2+ games with one a player already had. Preview with **Another option**, then **Assign**. **Automatic** (off by default) does it for every new round without the preview. The bar then shows "Group 2 → Bank 4 · 11 of 12 new"
- **Overview**: **Submit to IFPA** sits under Re-open tournament, same size and style
- **Test tournaments only** (Matches tab): **Fill random results** enters a random finishing order for every open game of the round that has its arena; **Every round** does it automatically. With auto close/start and Automatic bank assignment on, a test tournament runs itself.

## New in 0.8.1
- Settings save safely: each save changes only that setting, so another open tab of the same tournament can't put an old value back; changes show in every open tab right away.
- With **Rebuild banks every round** on, the Matches tab shows a note instead of the Automatic checkbox (it can't switch Rebuild off any more).
- The eligibility window reopens after **Load / Reload IFPA ranks**, with your cuts kept.

## New in 0.8
- **Ties**: only ties that change the finals are flagged - a cut line (who makes A/B/C, incl. eligibility), a bye line (from each finals' bracket size) or a game-pick line (top seed in each group picks). Others are listed under "Other ties". Resolved ties never show. The **Unresolved tie** tags are on the *Finals standings (eligibility applied)* table; clicking one opens one window: why it matters, who's tied (points, IFPA rank, head-to-head) and how to resolve it (cut lines: IFPA draw + vote or random game; byes/picks: head-to-head then IFPA rank, or play a game).
- **Eligibility** (qualifying Players tab): **Add eligibility** - a B cut, then **+ Add another cut** for C, D… (as many as Matchplay's finals cut lines). Labels say what a player can't play: "B/C Ineligible", "C Ineligible"; eligible everywhere = no label. Only A finals = nothing needed. Other labels are kept.
- **Finals Arenas tab**: **Copy N arenas from <qualifying>** (Matchplay's own "Add from qualifying" can show "Unknown · 0 arenas").
- **Finals check-in** shows even before any players are added.
- **Rebuild banks every round** is on the Banks tab. With Auto close/start on: close the round → rebuild banks → start the next round unpublished → assign a bank to each group → publish. Only one automatic bank option can be on (this, or Matches → Assign banks · Automatic).
- **Assign banks** never gives a bank to two groups while free banks are left; banks already used this round (also by hand) and groups that already have a bank are skipped.
- **Faster**: fixed pauses replaced by "wait until Matchplay is done" checks (a 3-bank Refresh went from about 18 s to 6 s in testing). Matchplay's page is refreshed before the frozen screen lifts, and you're put back where you were scrolled.
- Rounds are always read oldest first (Matchplay sends newest first) - this fixes auto close/start not firing. Tournament details reload when you switch tabs and when Matchplay says a round/tournament started.

## While it's updating Matchplay
- Changes are made in your own tab at full speed, but the screen is **frozen**: a copy of what was showing stays up (slightly dimmed) with an **"Updating Matchplay…"** card, progress and **Stop**. The clicking, dialogs and page changes happen underneath, out of sight. Clicks, scrolling and keys are blocked; the side panel stays usable.
- When it's done the cover lifts on the page you started from (same scroll position) and a green "Updates done ✓" banner shows. On an error the cover lifts so you can see where it stopped, with Retry / Stop.
- Other tabs of the same tournament show an "Updating Matchplay in another tab" banner.

## Bank Builder details
- A game in more than one bank is never the same game number in two banks (groups move at about the same pace); after that, its start times are kept apart. Anything that can't be avoided is marked ⚠.
- Game times use each game's **middle value** (median); a single game more than 3× that is left out (a game left open by mistake), and the Arenas tab hover says how many were left out.

## How it works
- **Reads** use Matchplay's official read-only API with your own token. Requests are kept to about 1 every 0.65 s, standings are fetched no more than every 30 s, and finished data is cached.
- **Changes** (labels, adding players, check-in, seeds, banks, closing/starting rounds) are made by clicking Matchplay's own buttons. You see a preview or confirm first, and progress shows at the bottom of the panel. If a step fails, the task stops with a message and a Retry button.
- Everything the panel remembers stays in this browser's extension storage: cutoffs, IFPA ranks, check-in, and bank settings.
