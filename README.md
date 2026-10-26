# Matchplay TD Panel v0.5.0

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

## How it works
- **Reads** use Matchplay's official read-only API with your own token. Requests are kept to about 1 every 0.65 s, standings are fetched no more than every 30 s, and finished data is cached.
- **Changes** (labels, adding players, check-in, seeds, banks, closing/starting rounds) are made by clicking Matchplay's own buttons. You see a preview or confirm first, and progress shows at the bottom of the panel. If a step fails, the task stops with a message and a Retry button.
- Everything the panel remembers stays in this browser's extension storage: cutoffs, IFPA ranks, check-in, and bank settings.
