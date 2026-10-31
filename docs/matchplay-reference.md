# Matchplay reference (learned live, Oct 25 2026)

These notes come from running test tournament **280051** (group match play, 47 players, 3 rounds, 2 games per round, IFPA 7/5/3/1 scoring) and its two linked playoffs, all marked as tests:
- **A Finals 280073**: group elimination bracket, 8 players, 3 games per round
- **B Finals 280074**: the same format

Both finals were run to the end. Their rounds are closed, but none of the tournaments has been "completed".

## API (read-only, `https://api.matchplay.events/api`, Bearer token)

### `GET /tournaments/{id}`
- Fields seen:
  - `status`: planned / started / completed
  - `type`: group_matchplay / group_bracket …
  - `seeding`: random / manual
  - `arenaAssignment`: balanced / manual_banks …
  - `roundCount`, `gamesPerRound`, `bracketSize`, `groupBracketDoubleByes`
  - `scoring`: ifpa
  - `pointsMap`, e.g. `[[7],[7,1],[7,4,1],[7,5,3,1]]`, indexed by group size
  - `tiebreakerPointsMap`
  - `suggestions`: `restricted` = "Suggest with approval"
  - `tiebreaker`
  - `test`
  - `organizerId`: compare with the signed-in user to check TD access
  - `linkedTournamentId`
- `playoffsCutoffs`: `[{index, value, cumulative, text, color}]`, e.g. A = 8 / cumulative 8 / green, and B = 8 / cumulative 16 / fuchsia.
- `?includeLinkedTournaments=1` → `[{tournamentId, name, status, type, linkType:"playoff", linkIndex}]`. `linkIndex` 0 = A, 1 = B. From a finals tournament, this points back to the qualifying tournament.
- `?includePlayers=1` → `players[]: {playerId, name, ifpaId, claimedBy, tournamentPlayer:{status: active|inactive, seed, labels:[…], labelColor}}`.
  - `ifpaId` is the IFPA **player number**, not the rank. Get the rank from the profile.
  - In the qualifying tournament, `seed` is the random seed.
- `?includeArenas=1` → `arenas[]: {arenaId, name, status, opdbId, categoryId, labels, tournamentArena:{status,…}}`.
  - `categoryId`: 1 = EM, 2 = SS, 3 = DMD/modern. Era comes from this; no OPDB call is needed.
- `?includeBanks=1` → `banks[]: {bankId, name, status, arenaIds:[…]}`.

### `GET /tournaments/{id}/rounds`
- Returns `roundId, name ("Round 1" / "Semifinals" / "Finals"), index, status, createdAt, completedAt, duration`.
- `completedAt` is only set when the TD clicks Close round.

### `GET /games?tournaments={id}[&status=started|completed][&round=][&ids=]`
- Returns `gameId, roundId, arenaId, bankId, set (group index), index (game # within the group), status, startedAt, duration (seconds), bye, playerIds…`, plus `suggestions` when there are any.
- **A tiebreaker game has `set: 9999`, `index: null` and `arenaId: null`** until an arena is assigned.

### `GET /tournaments/{id}/standings`
- Returns a plain array of rows:

  ```
  playerId, position, points, pointsWithTiebreaker, gamesPlayed, tiebreakers[],
  onCutoffBubble, cutoffBubbleColor, onCutoffBubble2, manualTiebreakerGroup, activeGames
  ```

- Tied players share `position`.
- `onCutoffBubble: true` plus a color marks a tie that straddles a cut line.
- After a manual resolve, positions become unique, the bubble flags clear, and `manualTiebreakerGroup` is set to the group id.

## Qualifying: rounds
- "Start next round" opens a modal with three settings:
  - **Limit arenas to…**: Any category / Don't draw arenas / EM / SS / DMD / labels A–E
  - **Publish immediately** (checked)
  - **Greedy algorithm** (unchecked)
  
  Click **Start round**.
- In **qualifying**, "Start next round" is clickable even while the current round is unfinished, with no warning. On the last configured round it disappears.
- **In finals**, "Start next round" only appears after the current round is closed.
- **A round never closes itself.** A green **Close round** button appears once every game is completed (tiebreaker games included). It closes instantly, with no confirm dialog.
- Once all rounds are closed, the Overview shows **Complete tournament**.

## Results entry (TD)
- In the Results modal, set places from 1st down. **The last place fills in automatically**, so don't click it.
- A partial save (fewer places) leaves the game `started`.
- Players submit suggestions, and only when Suggested results = "Suggest with approval" (`restricted`) or "Automatic approval". The TD approves them.

## Ties
- Go to **Overview → More… → Resolve ties** (`/tournaments/{id}/resolve-ties`).
- Unresolved ties appear as "Positions X–Y" cards with a **Resolve** link. Cards for ties on a cut line are tinted with that line's color.
- In the Resolve modal you click a player, then the slot to move them to, then **Save**. The tie moves to "Resolved ties", which has a **Delete** option.
- The **Add players** dialog in playoffs also links to "Resolve ties".
- What Matchplay flags by itself is listed under "Ties to highlight for finals" below.

## Labels
- **Players → Actions → Set rank labels** has three tabs: IFPA / Rating Class / MP Rating.
  - Fields: **From IFPA rank** (required) and **To IFPA rank** (blank = no limit).
  - Checkboxes: "Refresh IFPA data" and "Only update players without labels".
  - **Continue** → **Set player labels**: label text (comma-separated for more than one; the first one shows in lists), a color (8 swatches) → **Update N players**.
- Ranks 1–5000 labelled 19 of 47 players "B Ineligible". The label is copied into the finals when players are added.
- Players → Actions also has **Copy names** and, in finals, **Update seeds**.

## Playoffs (finals)
- Go to **Overview → More… → Manage playoffs** (`/tournaments/{id}/playoffs`). You can **Create playoffs** or **Link existing**, up to 9 of them.
- The Create form asks for:
  - name
  - Format: Single elim / Double elim / **Group elimination bracket** / Pingolf elim / Pinbowling / Ladder / Amazing Race / Group match play
  - number of players (4–32 or other)
  - for group elim: Scoring (IFPA 7/5/3/1 or PAPA 4/2/1/0) and Games per round (3 or 1)
- Each playoff row has **Open** and **Actions**: Add players / Add arenas / Unlink / Delete. There's also **Reorder**.

### Add players
1. Pick a count (8/12/16/…/Other), then **Select players**.
2. You get a checkbox list in standings order. Each row shows labels and "Player # / IFPA #". Players already used show as "In other playoffs" or "Already in tournament" (checked and disabled).
3. **Matchplay pre-checks the next N players in order and ignores the "B Ineligible" label.** The extension has to uncheck ineligible players and check the next eligible ones. Setting `checkbox.click()` from JS works.

### Seeds after adding
- Seeds after adding did **not** follow qualifying order. B got Aaron S1 and Allen S6, even though both were tied at 10th.
- Always check and fix seeds under **Players → Actions → Update seeds**. It uses click-to-move rows and a **Save changes** button.

### Status and no-shows
- Players are added **Active**. The Deactivate/Activate link toggles instantly. This is how check-in works: deactivate everyone, then activate each player as they check in.
- **Start tournament** has a checkbox, **"Remove deactivated players"**, that is on by default. No-shows left inactive are dropped at start.
- **A backup added late gets the next seed** (S9) and stays lowest after the no-show is removed. In the API, seeds after start looked 0-based with a gap left by the removed player.

### Arenas
- **Arenas → Add from qualifying**: "All arenas" / "Active arenas", then copy (status and labels are copied too).
- This only loaded correctly when opened from the Manage playoffs Actions menu. On a page reached by direct URL it showed "Copy from: Unknown, 0 arenas".

### Group elim 8 config
- Seeding is Manual.
- Arena assignment is Balanced by default. **Show 5 additional options** reveals:
  - Arena banks (balanced)
  - **Arena banks (manual)**
  - Category banks
  - Balanced across series
  - Not assigned
- Automatic tiebreaker: "Classic". Double byes: "No byes".

## Banks
- The **Banks tab only appears once Arena assignment is set to banks.**
- **Add bank**: enter a name, then Save. Each bank card has:
  - **Add arenas…**: a modal with tabs Existing arenas / Scorbit / Pinball Map / New arena, a search box, and checkboxes that show era and OPDB id → **Add N arenas**
  - **Re-order**: A1/A2/A3 click-to-move, plus **Flip order**
  - **Deactivate**
  - a pencil icon to rename
- **Banks → Actions → Copy banks from…** searches your other tournaments → "All banks" / "Active banks" → **Copy N banks**. B copied A's 4 banks this way.

## Finals rounds (group elim 8)
- **Semifinals** has two groups. Group 1 = seeds 1, 4, 5, 8; Group 2 = seeds 2, 3, 6, 7. Each group plays 3 games, and the top 2 advance.
- **Finals** is one group of 4 playing 3 games.
- Games start as "Needs arena". Use the group's **Actions → Assign bank** → "Select bank" (checkbox per bank, listing its arenas) → **Update arenas**. The group header then reads "Group 1 – Bank 1".
- The Select bank modal **does not show which banks are already used**.
- Group **Actions** also has "Change player order".
- **Tie at the advance line:** Group 1 had Greg and Ace tied on 13 for 2nd. Matchplay **automatically created a tiebreaker game**:
  - a card titled "No arena" naming the tied players
  - **Assign arena** → choose a specific arena or "Automatically pick arena" → Save. The card then shows a running timer and **Enter results** (a 2-player 1st/2nd modal).
  - Close round only appeared once the tiebreaker was done.
- The final standings came out as places 1–8. Semis losers were ranked by their semis points.

## Learned while building v0.1.0
- **Players tab bulk bar:** ticking any player's checkbox shows **Activate / Deactivate / Set label** above the table.
  - Matchplay **re-renders the rows after each tick**, so look the checkboxes up again after every click.
  - Each row's player link is `/tournaments/{id}/players/{playerId}`, which gives an exact id match.
- **Set label replaces** a player's labels; it does not add to them. Pass the full list: existing labels plus the new one.
- **Label color swatches** are `[role=radio]` elements named lime, sky, purple, orange, rose, gray, trans and pride.
- **IFPA ranks:** Players tab → **IFPA rankings** button opens a table (Name / Wom. Rank / Rank).
  - The app's internal `/api/tournaments/{id}/players/ifpa-rankings` refuses API tokens.
  - The official API only has ranks for claimed players (`/users/{id}?includeIfpa=1`).
  - So the extension reads Matchplay's own table instead.
- **Dialogs** fill in a moment after the box appears. Wait for content, not just for the `[role=dialog]` element.
- **"Add from qualifying" for players** works on a finals Players page loaded directly by URL. Each row in the list shows "Player #id".
- **The Add arenas list in a bank** shows all of the organizer's arenas. Adding one to a bank also adds it to the tournament.
- `GET /users/profile` → `userId`, which equals the tournament's `organizerId` for the organizer.
- `GET /tournaments/{id}/games?round=` returns `playerIds`, `resultPositions`, `resultPoints` and `suggestions`. The global `/games` endpoint doesn't include these.
- Test playoff **280091 "C Finals (extension test)"** was created for driver testing. It has 4 inactive players, Bank 1, and Arena assignment set to manual banks.

## Ties to highlight for finals
1. **Cut-line ties (A/B/C):** Matchplay flags these (`onCutoffBubble`, tinted cards).
2. **B-eligibility boundary:** Matchplay does **not** flag this. Example: positions 23–27 were tied, 3 of those 4 players were B-eligible, and they were competing for the last 3 B spots.
3. **Seeding ties inside a division:** these decide group placement (1/4/5/8 vs 2/3/6/7), byes and bank-pick order. Example: A seeds 2–5 were a 4-way tie that was never resolved, and Matchplay seeded them arbitrarily.
4. **In-finals group ties:**
   - At the **advance line** (2nd vs 3rd in a group where 2 advance), Matchplay creates a tiebreaker game (`set 9999`).
   - In the **final round, every position must be a clear winner**, so any tie at any place has to be broken. It's not yet confirmed whether Matchplay auto-creates tiebreaker games here. The extension should check the totals itself and flag them.
