# TD Panel for Match Play

A free Chrome extension for pinball tournament directors who run events on [Match Play](https://app.matchplay.events).
It adds TD tools straight into Match Play's own pages: finals check-in and eligibility, tiebreakers that matter,
bank building and assignment, automatic rounds, game timers, and IFPA submission.

> Not made by or affiliated with Match Play Events. It reads your tournaments with Match Play's official
> (read-only) API using your own API token, and makes changes by clicking Match Play's own buttons, after you
> confirm.

## Install

1. Go to the [latest release](https://github.com/charmady33/td-panel-for-match-play/releases/latest) and download
   `td-panel-for-match-play-x.y.z.zip`.
2. Unzip it to a folder you'll keep (for example `Documents\TD Panel`). Don't delete that folder: Chrome runs the
   extension from it.
3. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right), click **Load unpacked** and pick
   the unzipped folder (the one that has `manifest.json` in it).
4. Pin it: click the puzzle-piece icon in Chrome's toolbar → pin **TD Panel for Match Play**.
5. Open one of your tournaments on Match Play and paste your API token in the box at the top
   ([create a token here](https://app.matchplay.events/account/tokens); name it anything). You can also set it
   from the toolbar button.

## Updating

When a new version is out, the toolbar button and your tournament pages say **Update available** with a download
link.

1. Download the new zip from the [latest release](https://github.com/charmady33/td-panel-for-match-play/releases/latest).
2. Unzip it **over the same folder** (replace the files).
3. In `chrome://extensions`, click the ↻ reload icon on **TD Panel for Match Play**, then reload your Match Play tabs.

Your settings, API token and saved tournament data stay as they are.

## Privacy

- Your API token is stored only in this browser (Chrome's extension storage).
- The extension talks only to `app.matchplay.events`, `api.matchplay.events`, and `api.github.com` (to check for a
  new version). No analytics, nothing sent anywhere else.

## What it does
- **Inside Matchplay's pages**:
  - **USA flag** replaces Matchplay's pride flag next to the Match Play logo
  - **Standings tab (qualifying)**:
    - a "Ties to break before finals" box lists each unresolved tie that matters, and why
    - tied players are highlighted in Matchplay's table
    - Matchplay's standings stay on the left, with **Finals standings (eligibility applied)** next to them on the right
    - resolved ties show decimal points (a 5-way tie on 32 → 32.4 … 32.0, winner highest), here and in the Finals standings table; hover for details
    - an unbroken tie that matters shares one seed (A7-T); a player in a cut-off tie is listed once, in that finals
    - ties that don't change the finals are listed as **Optional ties** with a grey Break tie (optional) button
    - **Break tie / tags / Matchplay's "Manual" buttons** open the tiebreaker window (IFPA18 §IV.1):
      - seeding-only ties: head-to-head win %, then IFPA rank, no game played
      - bubble ties: "IFPA draw + vote" (one Old EM / Mid SS / New DMD game; Change… any of them or Set my own games; click the voted game or Random pick) or "Just random"
      - results are entered like Matchplay's Results window: tap names or circles, the last place fills itself
      - random player order; click the finishing order; advancers are then seeded by head-to-head; Apply fills in Matchplay's Resolve ties
      - progress is saved: leave and come back with "Enter results" (a reminder bar shows on every tournament page), or Start over
      - an already resolved tie shows its recorded order
  - **Resolve ties page**: important ties are outlined, with the reason shown on each card
  - **Matches tab**:
    - the **Auto close round & start next round** checkbox and its status
    - **Est. 34 min** by each group (kept from round start) with its time so far, and a live ⏱ timer over each game that stops at the final time
    - **Start next round → Limit arenas to… → Any category (game time)**: every game gets its arena right away - no machine shared at the same time, no game twice in a round, every game played equally, groups finishing together; a repeat of a game a player already had is a last resort and is spread over the players. Remembered per tournament; works with Auto close/start
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
  - banks are built once and lock when the event starts. A machine you deactivate (Arenas tab) is replaced automatically in the banks that hold it - only those banks change - and waiting games move to the replacement; **Put … back in its banks** appears when it works again
- **Stats tab (in Matchplay) → Rounds**: a **Max est.** column (longest group estimate) next to Duration
- **Stats tab (in Matchplay) → Plays**: who played which game and how many times, sortable by any column, with round / completed / active / tiebreaker filters
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
- **Create new tournament (Test)**: Quick test setup - how many players and arenas to add right after Create
- **Toolbar button**: your events with links, an **on/off switch** for the whole extension, your API token, and Clear saved data for the open tournament

- **Matches tab (bank tournaments)**: **Assign banks** gives each group of the new round one of your banks - games its players haven't played, avoiding any bank that shares 2+ games with one a player already had. Preview with **Another option**, then **Assign**. **Automatic** (off by default) does it for every new round without the preview. The bar then shows "Group 2 → Bank 4 · 11 of 12 new"
- **Overview**: **Submit to IFPA** sits under Re-open tournament, same size and style
- **Test tournaments only** (Matches tab): **Fill random results** enters a random finishing order for every open game of the round that has its arena; **Every round** does it automatically. With auto close/start and Automatic bank assignment on, a test tournament runs itself.

## While it's updating Matchplay
- Changes normally run in a hidden copy of Matchplay inside your tab (you keep working). If that stops responding, they run in your own tab with the screen **frozen**: a copy of what was showing stays up (slightly dimmed) with an **"Updating Matchplay…"** card, progress and **Stop**. The clicking, dialogs and page changes happen underneath, out of sight. Clicks, scrolling and keys are blocked; the side panel stays usable.
- When it's done the cover lifts on the page you started from (same scroll position) and a green "Updates done ✓" banner shows. On an error the cover lifts so you can see where it stopped, with Retry / Stop.
- Other tabs of the same tournament show an "Updating Matchplay in another tab" banner.

## Bank Builder details
- A game in more than one bank is never the same game number in two banks (groups move at about the same pace); after that, its start times are kept apart. Anything that can't be avoided is marked ⚠.
- Game times use each game's **middle value** (median); a single game more than 3× that is left out (a game left open by mistake), and the Arenas tab hover says how many were left out.

## How it works
- **Reads** use Matchplay's official read-only API with your own token. Requests are kept to about 1 every 0.65 s, standings are fetched no more than every 30 s, and finished data is cached.
- **Changes** (labels, adding players, check-in, seeds, banks, closing/starting rounds) are made by clicking Matchplay's own buttons. You see a preview or confirm first; progress shows in a small card at the bottom right. If a step fails, the task stops with a message and a Retry button.
- Everything the panel remembers stays in this browser's extension storage: cutoffs, IFPA ranks, check-in, and bank settings.

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT - see [LICENSE](LICENSE).
