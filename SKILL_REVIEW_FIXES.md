# Review: OpenSkill branch `feat/openskill-rating` — required fixes

Reviewed commits `49daf15..d0d1c28`. **Overall the implementation is good** — this is not slop. `npx tsc` passes clean, all 43 new tests pass, and I verified empirically (throwaway probe against the test DB) that:

- **Incremental state matches full replay exactly** (mu identical to 6dp across 3 games incl. a tied game). The tier-1 correctness claim genuinely holds.
- **Double-`applyFinishedGame` is idempotent** — `gamesPlayed` stays 1, mu unchanged, track stays clean.
- `GamePlacementUtil` and `SkillMathUtil` are correct, focused, and well-tested.
- Repository SQL is right: replay ordering `createdAt, id, userId`, filler exclusion, dirty tracking, upserts.

The fixes below are ordered by severity. **Make one atomic commit per numbered item**, using `/cs`.

---

## 1. BUG: non-head revert corrupts `skillRating` state

**File:** `src/service/SkillRatingService.ts:445-473` (`revertFinishedGame`)

Probe result — two games played, then revert the **older** one (game 1):

```
P0 before revert: mu=23.449591 games=2
P0 after  revert: mu=25.000000 games=1   dirty=true
game2 outcome rows still present: 4
```

The player is restored to `muBefore` **of the reverted game** — i.e. the pristine default 25.0 — while game 2's four outcome rows still exist and still claim that game contributed. So `skillRating` and `skillRatingGame` now contradict each other, and `gamesPlayed=1` counts a game whose stored mu was discarded.

Restoring `muBefore` is only valid when the reverted game is the newest in the track (`isNewestGameInTrack` already tells you this — it is computed at line 435 and currently used *only* to set the dirty flag).

**Fix:** branch on `isNewest`.

- `isNewest === true` → current behaviour is correct, keep it (this is the common path and is exact).
- `isNewest === false` → do **not** write `muBefore`. Delete this game's outcome rows and immediately `recomputeTrack(clubId, gameSize)` to restore a consistent state, then leave the track clean.

Recomputing here is cheap and correct: prod is 1364 games total across 5 clubs, and a non-head revert is rare (admin editing/deleting an old game). This removes the contradictory-state problem entirely rather than papering over it with a dirty flag. Keep `markTrackDirty` only for the error path in the `catch`.

Add a test: two games, revert the older, assert resulting state equals a from-scratch `recomputeTrack`, and that the track is not dirty.

---

## 2. BUG: `revertFinishedGame` swallows errors, leaving no dirty flag

**File:** `src/service/SkillRatingService.ts:482-487`

The `catch` logs but does **not** mark the track dirty — unlike `applyFinishedGame`, which does. A revert that throws halfway leaves silently-wrong ratings with no signal and no way to notice.

**Fix:** mark the track dirty in this catch too (clubId/gameSize are available from `outcomeRows[0]`; hoist them above the `try` or re-read inside the catch).

---

## 3. BUG: `applyFinishedGame` catch block can crash on its own error path

**File:** `src/service/SkillRatingService.ts:407-420`

```ts
const gameSize = event.gameRules?.numberOfPlayers ?? 4;
```

The `?? 4` silently misattributes a failure to the yonma track when rules are missing — and if the original error was thrown *because* `findGameById` / `findEventById` failed, these same calls in the catch will throw again, replacing the logged error with an unrelated crash that escapes the handler entirely (defeating the "never block a game" intent).

**Fix:** capture `clubId` and `gameSize` into locals in the `try` as soon as they are known, and have the `catch` use those locals — no repository calls, no `?? 4` fallback. If they were never resolved, just log.

---

## 4. N+1: profile endpoint builds a whole leaderboard per track

**File:** `src/service/SkillRatingService.ts:268-272`

```ts
const leaderboard = this.getClubLeaderboard(clubId, row.gameSize, now);
const found = leaderboard.entries.find(e => e.userId === userId);
```

For every non-provisional track this loads **every** rating row in the club, resolves each one, sorts, and ranks — just to read one place. A player in 3 clubs × 2 sizes = 6 full leaderboard builds per profile request. It also calls `getOrCreateConfig` (line 258) and `isTrackDirty` (line 265) once per club/track.

**Fix:** add a repository method that computes the place directly, e.g.

```sql
SELECT COUNT(*) + 1 AS place FROM skillRating
WHERE clubId = :clubId AND gameSize = :gameSize
  AND gamesPlayed >= :threshold
  AND mu - 3 * sigma > :userOrdinal
```

Note this must rank on the **stored** ordinal, whereas the leaderboard ranks on **inflated** `skill`. If you want them to agree exactly, keep the in-memory approach but build each `(clubId, gameSize)` leaderboard **at most once** and cache it in a local `Map` for the duration of the request. Prefer the cache — it preserves the "single read path" invariant that profile and leaderboard always agree, which is a stated requirement.

---

## 5. Missing tests: the endpoints are entirely untested

The plan called for `tests/skillRoutes.test.ts` and `tests/placementHistory.test.ts`; **neither exists**. No controller, route, auth, or schema behaviour is covered.

Add `tests/skillRoutes.test.ts` (supertest, mirroring `tests/userStats.test.ts`):
- 401 unauthenticated on each of the 5 routes
- `GET /api/users/:userId/skill` — shape; `primaryClubId` picks most-played club; **ties break to lowest clubId** (currently untested and the logic at lines 290-296 is subtle)
- `GET /api/clubs/:clubId/skill/leaderboard?gameSize=2` and `=5` → 400 (see item 6 — this currently returns 500)
- recompute routes → 403 for insufficient club role

Add `tests/placementHistory.test.ts`:
- TOURNAMENT vs SEASON split; `place` null below `minimumGamesForRating`; user with no events → `200 {tournaments: [], seasons: []}`

Also add to `tests/skillRatingService.test.ts` the service-level cases the plan specified but that are absent:
- **ties**: `DIVIDE` equal scores → tied players move symmetrically and stay equal from equal starts; `WIND` same scores → asymmetric, wind-ordered. *(Highest-value missing test.)*
- **sanma isolation**: same player rated in both sizes in one club → two independent rows
- **decay agreement**: with an explicit `now` far in the future, profile and leaderboard report the **same** `skill` for the same player
- **non-head revert** (item 1)

---

## 6. Invalid `gameSize` returns 500 instead of 400

`getClubSkillLeaderboardSchema` accepts any int and `InvalidGameSize` is thrown from the service. Confirm `InvalidGameSize` maps to a 400 in `handleErrors`; if it does not, constrain it in the schema instead:

```ts
gameSize: z.coerce.number().int().refine(n => n === 3 || n === 4).default(4)
```

Do the same for the two recompute schemas. Then the service-level `InvalidGameSize` guards become pure defence-in-depth, which is fine.

---

## 7. Remove dead code

- `src/util/SkillMathUtil.ts:29` — `toOrdinal()` is used **only by its own test**; production inlines `mu - 3 * effectiveSigma` at `SkillRatingService.ts:107`. Either use `toOrdinal` in `resolve()` (preferred — removes the duplicated formula) or delete it.
- `src/model/SkillModels.ts:45` — `SkillTrackDirty` interface: zero references. Delete.
- `src/repository/SkillRatingRepository.ts` — `findSkillRatingGamesByUser`: zero callers. Delete unless item 5's tests need it.
- `src/model/SkillModels.ts:100-101` — `SkillRecomputeResult.clubId` / `gameSize` are optional (`?`) but **always** set by every producer. Make them required; the optionality forces needless narrowing downstream.

---

## 8. Document the unrelated `GameRepository` change

`src/repository/GameRepository.ts:81,105` changed `startPlace` from `string | undefined` to `string | null` with `startPlace ?? null`.

This is a **legitimate bug fix** (better-sqlite3 throws on `undefined` bind params), but it is unrelated to OpenSkill and buried in a feature commit with no explanation. Split it into its own commit with a message explaining the binding failure, so it is not mistaken for incidental churn.

---

## Not a problem — do not "fix" these

- Comment density is fine (13 comments in 626 lines) and the comments explain *why*, not *what*. Leave them.
- The `place`-always-`null` default in `resolve()` then overwritten by callers is slightly awkward but harmless — not worth churn.
- Repository size (457 lines) is proportionate; it is all distinct prepared statements following the house pattern.
- `parseUmaTieBreak` / `EnumUtil` reuse is correct.

---

## Verification before handing back

```bash
npm test
```
```bash
npx tsc --noEmit && npm run format:check
```

Then confirm against real data (read-only copy of the prod backup):

```bash
npm run dev
```

Recompute all and sanity-check: **~42 ranked yonma players** (club 1: 35, club 3: 6, club 5: 1), **zero ranked sanma** (only 93 sanma games exist club-wide), and a second recompute producing identical rows.
