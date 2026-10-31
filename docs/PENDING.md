# Agreed, not built yet (Clark approved the plans; waiting for "code it")

## 35. Bank Builder uses the standalone "Pinball Tournament Bank Builder" engine
Reference: Clark's artifact "Pinball Tournament Bank Builder" — its
`buildBanks`, era scoring, hold-out and round-spacing logic.
- Bank size exact (Matchplay's "Matches each round").
- **A game is never in the same bank twice** (match by name and arena ID) — Generate, Refresh, Add, Another
  arrangement, pins, picker, Rebuild every round. Final check repairs by swapping, else stops with a message.
  Bug found: `banks.build` puts a game twice in a bank when slots > games (test/dup_unit.js: 8+ banks × 2 with 14 games).
- Too few games: shortest games repeat, copies ≤ number of banks; repeats placed by estimated time so groups don't
  need the same machine together; game 1 kept off shared machines; same-number clashes repaired or flagged red.
  Preview says up front when repeats are unavoidable ("14 games for 16 slots: Aztec and Pharaoh are each in two banks").
- Too many games: hold out by era share, longest first within an era; option "ignore era: hold out longest".
- Era scoring: same era 750; otherwise (3 − distance) × 300; EM/SS/DMD/Modern (LCD = Modern).
- Times rounded to nearest 5 min before balancing (setting 1/2/5/10/15 in ⚙ Settings).
- Try another arrangement = nudge the ideal; Revert to ideal; ↻ per bank.
- Picker lists every game best→worst, "conflicts" flagged.
- **Not in any bank** list under the preview, with reason; **Include** forces a game in for this run only
  (another is held out by the same rules, shown), pinned 📌, "Clear includes"; not saved. Never-games greyed but
  includable once.
- Keep extension-only parts: time sources, OPDB LCD, avoid earlier-round pairs, pins, finals lock, writing to Matchplay.
- Test: 14 games × 2/bank, 1–12 banks, 200 arrangements each, plus pins/picks/↻ → zero in-bank repeats.

## 36. Every game played equally across qualifying
**Superseded (Clark):** bank building does not consider plays so far (item 42); equal play lives in item 41.
- Count actual plays per game this qualifying (from Matchplay games) + planned banks for the round.
- No game gets another turn until all others caught up (counts differ by ≤ 1). Applies to repeats and hold-outs.
- Priority: never twice in a bank > equal play > era spread / bank times / spacing / avoid earlier pairs.
- Assign banks with fewer groups than banks: prefer banks holding least-played games.
- Arenas tab "Played" column; preview shows "Aztec · 3rd play (others 2)"; note when equal play had to give way.
- Applies to Generate/Refresh/Add/Rebuild/Include; not finals.
- Test: 14 games, 2/bank, 8 banks, 7 rounds → counts differ ≤ 1 after each round, zero in-bank repeats.
- Live evidence: "test tuesday" (#280207) Stats → Arenas: Sing Along & Sky Jump played 12, all others 6.

## 39. Game times sooner + pick past events
- Use this event's time from the first finished game (blend with other sources weighted by count; median/3× rule once
  a few games exist).
- "Pick past events" (Arenas tab bar + ⚙ Settings): list of tournaments the TD ran (API owner=me), newest first,
  name/date/location/games/matching games; tick + Load; "Same location" filter on by default; remembered per
  tournament; typing Matchplay IDs stays under "Other IDs"; replaces the old "Past events run with the extension" list.

## Open question to watch
- Delete test tournaments: one real run hung (helper frame never started a step; recorder showed no menu opened for
  25 s, then the tab fallback also didn't move). A later run worked (all old test tournaments deleted). 0.11.2 added
  step limits, heartbeat, a 60 s watchdog and a Details log on "Update stopped" — if it happens again, read Details.

# Built
- 41 and 42 shipped in 0.13.0 (live-tested on test tournament #281201 "Game time test (extension)").
- 37, 38, 43-47 shipped in 0.14.0.
- 48-53 shipped in 0.15.0.
- 54 shipped in 0.15.1.
- 55-57 shipped in 0.16.0 (57 live-tested on test tournament #281230 "Quick test (extension)").
- 58-59 shipped in 0.17.0 (round Actions Clear + Assign arenas live-tested on #281230; real-time event arrived ~8 s after Start round).
- 60 shipped in 0.17.1.
- 61-62 shipped in 0.18.0.
- 63 shipped in 0.18.1.
- 64 shipped in 0.18.2.
- 65 shipped in 0.18.3.
