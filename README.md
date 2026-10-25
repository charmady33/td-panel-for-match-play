# Matchplay TD Panel v0.3.0

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
  - **USA flag** at the top left of every Matchplay page
  - **Standings tab (qualifying)**:
    - a "Ties to break before finals" box lists each unresolved tie that matters, and why
    - tied players are highlighted in Matchplay's table
    - Matchplay's standings stay on the left, with **Finals standings (eligibility applied)** next to them on the right
  - **Resolve ties page**: important ties are outlined, with the reason shown on each card
  - **Matches tab**:
    - the **Auto close round & start next round** checkbox and its status
    - finals groups with a tie for an advancing spot, or any tie in the final, are outlined
  - **Finals Players tab (each A/B/C finals)**: **Finals check-in**, shown once qualifying is completed
    - the qualifiers in seed order, plus 3 backups
    - ticking a player adds them as **Active**; unticking deactivates them
    - seeds are kept in qualifying order, with backups lowest
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
