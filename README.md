# Matchplay TD Panel v0.1.0

A Chrome extension for tournament directors on app.matchplay.events. It adds a panel in the bottom-left corner of any tournament you run (as organizer, or as a manager). The panel is styled to look like Matchplay's own pages.

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
  - the optional **Auto close round & start next round** switch (off by default)
- **Finals**:
  - divisions come from Matchplay's cut lines
  - IFPA ranks are read from Matchplay's own IFPA Rankings list
  - you set a rank cutoff and label for each division (B, C…)
  - you can preview the labels before applying them
  - each division shows its planned players, 3 backups, and "Add players (inactive until check-in)"
  - "Fix seeds to qualifying order"
- **Check-in**:
  - check players in, which sets them Active in the finals tournament
  - undo a check-in
  - replace a no-show with the next backup, who gets the lowest seed. If the backup is currently in a lower division, they're moved up and deactivated there.
- **Timers**:
  - how long each round took, from the first game's start until every game is done
  - average, min and max game time per arena
  - uses the same game-timing rules as the Carpool Pinball remote app
- **Banks**:
  - generates balanced banks: even play times, mixed eras, never the same game twice in a bank
  - "Try another" gives a different arrangement
  - edit any slot, or use ⟳ to exclude a game and rebuild
  - can pull times from past tournaments at the same venue, or from the qualifying
  - one click creates the banks in Matchplay
  - shows which banks the current round is using
- **Settings**: your API token, label color, and the auto-round countdown length.

## How it works
- **Reads** use Matchplay's official read-only API with your own token. Requests are kept to about 1 every 0.65 s, standings are fetched no more than every 30 s, and finished data is cached.
- **Changes** (labels, adding players, check-in, seeds, banks, closing/starting rounds) are made by clicking Matchplay's own buttons. You see a preview or confirm first, and progress shows at the bottom of the panel. If a step fails, the task stops with a message and a Retry button.
- Everything the panel remembers stays in this browser's extension storage: cutoffs, IFPA ranks, check-in, and bank settings.
