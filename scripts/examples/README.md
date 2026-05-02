# Bulk import CSV examples

Reference CSV files for the import CLIs. Copy and adapt — these examples use placeholder data.

---

## `import-users.example.csv` — bulk user creation

Used by `scripts/import-users.ts`. Creates users and assigns them to a club.

```
name,telegramUsername,telegramId
Alice Anderson,@alice_a,123456789
```

| Column | Required | Format |
|---|---|---|
| `name` | yes | display name (must be unique) |
| `telegramUsername` | yes | with leading `@`, must be unique |
| `telegramId` | yes | integer, must be unique |

The header row must match exactly: `name,telegramUsername,telegramId`.

Run:

```bash
npx tsx scripts/import-users.ts --file scripts/examples/import-users.example.csv --clubId 1
```

---

## `import-games-yonma.example.csv` — bulk game import (4 players)

Used by `scripts/import-games.ts`. Imports games into an existing event.

For each player slot `p` from 1 to N (where N = `numberOfPlayers` from the event's `gameRules`):

| Column | Required | Format |
|---|---|---|
| `player{p}_username` | yes | telegramUsername **with `@`** (user must already exist) |
| `player{p}_points` | yes | integer — delta or raw, see "Points convention" below |
| `player{p}_startPlace` | optional | `EAST` / `SOUTH` / `WEST` / `NORTH` (empty = no seat recorded) |
| `player{p}_chombo` | yes (column) | non-negative integer; empty = 0 |

Optional row-level columns:

| Column | Format |
|---|---|
| `createdAt` | ISO 8601 (e.g. `2026-04-26T10:00:00.000Z`); omitted = sequential auto-timestamps |
| `tournamentHanchanNumber` | positive integer (round number) |
| `tournamentTableNumber` | positive integer (table within the round) |

Run:

```bash
npx tsx scripts/import-games.ts \
  --file scripts/examples/import-games-yonma.example.csv \
  --eventId <id> \
  --dry-run
```

`--dry-run` validates the CSV (parsing + per-game rules) without writing.

---

## `import-games-sanma.example.csv` — 3-player variant

Same shape as yonma, but only `player1`–`player3` columns.

---

## Points convention (yonma example)

The CSV stores points in the convention dictated by the event's `gameRules.startingPoints`:

- **`startingPoints = 0`** (e.g. EMA 2025, Kakapo Cup 3): each row's `points` values must sum to **0**. Store deltas: `final_stack - 30000`.
- **`startingPoints = 30000`** (e.g. seasonal Dojo rules, Mahjong Soul): values are raw end stacks; row must sum to `numberOfPlayers × 30000` (= 120000 for yonma).

If you're not sure which convention an event uses, check an existing imported game in the same ruleset:

```sql
SELECT SUM(points) FROM userToGame WHERE gameId = (
  SELECT id FROM game WHERE eventId = <some_existing_event_using_same_rules> LIMIT 1
);
```

Sum = 0 → deltas. Sum = 120000 → raw.

---

## Gotchas

- **Naive parser**: cells must not contain commas. The parser uses `line.split(',')`, no quoting.
- **Telegram `@`**: required on usernames. The DB stores them with `@`, the lookup is verbatim.
- **All-or-nothing**: if any row fails parsing or validation, no games are written.
- **No deduplication**: re-running the import creates duplicate games.
- **Trim**: cells are auto-trimmed, so trailing spaces in your source data are fine.
