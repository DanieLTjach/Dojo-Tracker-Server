# Finish the non-zero-sum uma / event-roles feature run (2 repos, 2 PRs)

**Full Path**: `/Users/mac/projects/Dojo-Tracker-Server/notes/handoffs/uma-non-zero-sum-and-event-roles.md`

## Context

A club reported "не дає створити правила з ненульовою умою" (can't create rules with a
non-zero-sum uma). Investigation showed the **server already supports it correctly** — the
production errors were a different guard (updating a ruleset that already has 100 games) plus
a missing club role. Four fixes were agreed with the user; three are done in the server repo,
the fourth (the actual user-facing UI bug) is half-done in the frontend repo.

Two repos, two independent branches:

- Server: `/Users/mac/projects/Dojo-Tracker-Server`, branch `feat/game-rules-rename-and-event-roles`
  (4 commits ahead of `origin/main`). **Work is complete; needs a quality pass + PR.**
- Frontend: `/Users/mac/projects/Ranked-Telegram-App`, branch `fix/uma-sum-indicator-non-zero`
  (0 commits, 2 untracked new files). **Work is ~30% done.**

Constraint: matrix uma must keep behaving as before — the non-zero-sum opt-in is only valid for
a *flat* uma; the backend rejects `allowNonZeroSumUma` combined with a matrix uma
(`src/schema/GameRulesSchemas.ts:283-292`, error code `umaNonZeroSumMatrix`).

## Reproduce Steps

The user-facing bug (frontend):

1. `cd /Users/mac/projects/Ranked-Telegram-App && npm run dev`
2. Open the admin game-rules editor, step 1 "Загальні параметри".
3. Enter a flat uma of `10 / 5 / 0 / -5` (sum = 10) and turn ON the toggle
   "Дозволити уму з ненульовою сумою".
4. The row indicator under the inputs still shows a red ✗ and
   `Сума: 10 (Сума має дорівнювати 0)`, contradicting the toggle. Rendered unconditionally at
   `src/components/rules/UmaInputGrid.civet:69-71` — it does not know about the flag.
   (Form submission itself is *not* blocked: `gameRulesEditor/validation.civet:65-79` and
   `serialize.civet:36-61` already honour the flag. The indicator is misleading only.)

## Current Issue

**Remaining work, in order:**

### A. Frontend — finish the UmaInputGrid fix (`Ranked-Telegram-App`)

Two untracked files are already written and their tests pass — commit them as task A:

- `src/utils/game/umaSum.civet` — pure `buildUmaSumRows(formData, numPlayers, {allowNonZeroSum, isMatrix})`
  plus `umaSumTone()` and the `UMA_SUM_OK` / `UMA_SUM_ALLOWED` / `UMA_SUM_INVALID` constants.
- `src/utils/game/umaSum.test.civet` — 9 passing tests.

Verify with `npx vitest run src/utils/game/umaSum.test.civet`, then commit via `/cs` as
`refactor(rules): extract the uma sum-row builder into a pure helper` — **but only after**
rewiring `UmaInputGrid.civet` to call `buildUmaSumRows` in place of its inline `for r = 0…`
loop (lines 21-28), which must stay behaviour-preserving (tone `ok`/`invalid` only, since no
call site passes the flag yet).

Then task B, the behaviour change:

1. Add prop `allowNonZeroSumUma = false` to `UmaInputGrid`; pass it into `buildUmaSumRows` as
   `allowNonZeroSum`.
2. Render three tones instead of two at `UmaInputGrid.civet:69-71`: `CheckCircle` +
   `admin-shared__sum-ok` + `(OK)`; a neutral `Info` icon (lucide-react) +
   a new `admin-shared__sum-info` class + a "non-zero sum allowed" note; `XCircle` +
   `admin-shared__sum-bad` + the existing `common.sumShouldEqual` message.
3. `src/components/rules/UmaInputGrid.scss` — add `&__sum-info { color: var(--color-info); }`
   next to `&__sum-ok` / `&__sum-bad` (lines 58-64). `--color-info` already exists.
4. New i18n key next to `admin.sumLabel` (line 38) in **both**
   `src/i18n/locales/uk/admin.yaml` and `src/i18n/locales/en/admin.yaml` — a key in only one
   locale is a bug per `FRONTEND_GUIDELINES.md:413`. Suggested uk text: `сума може бути ненульовою`.
5. Wire it up in `src/components/admin/gameRulesEditor/MetaStep.civet:165` —
   `allowNonZeroSumUma={formData.allowNonZeroSumUma is true}`. The toggle itself is at lines 176-185
   and is only rendered for a FLAT uma.
6. Commit via `/cs`, then open the PR with `/pr`.

### B. Server — quality gate and PR (`Dojo-Tracker-Server`)

- There is **one uncommitted edit**: a reworded comment above `GAME_RULES_SCORING_FIELDS` in
  `src/service/GameRulesService.ts:135-139`. Review it and fold it into a commit.
- A `/code-review medium` pass was launched over the branch diff and **was killed before it
  produced any findings** — re-run it (`/code-review medium`) as the Phase-4 quality gate.
- Then `/pr`.

The 4 server commits already on the branch (all with tests, full suite green):

- `cb88263 fix(game-rules): allow renaming rules that already have games` — split `name` out of
  the guarded field set so a pure rename of an in-use ruleset is allowed.
- `d6880c0 feat(errors): point the blocked game-rules update at creating new rules` — uk + en copy.
- `7beab6a refactor(events): extract the shared club-role check behind event authorization`
- `e469d44 feat(events): let club moderators create, edit and delete their club's events` —
  **policy change**: `EVENT_MANAGEMENT_ROLES` is now `[OWNER, MODERATOR]` for create/update/delete,
  matching `authorizeTournamentManagement` and the existing `insufficientEventManagementPermissions`
  copy. Call this out prominently in the PR body; moving an event to a *different* club and
  creating a club-less (global) event both remain admin-only.

## How to Verify

Server (`cd /Users/mac/projects/Dojo-Tracker-Server`):

```
npm run typecheck && npm run format:check && npm test
```

Expect `Test Suites: 68 passed`, `1427 passed, 5 skipped`. One flaky failure has been seen once
across runs (known IPv4 port collision, see `tests/setup.ts`) — re-run before believing a failure.
Sanity check that the role tests bite: temporarily change `EVENT_MANAGEMENT_ROLES`
(`src/service/EventService.ts:66`) to `[ClubRole.OWNER]` and confirm exactly 3 failures in
`tests/permissionsMatrix.test.ts` (MODERATOR create/edit/delete), then revert.

Frontend (`cd /Users/mac/projects/Ranked-Telegram-App`):

```
npx vitest run src/utils/game/umaSum.test.civet
npm run test:run && npm run build
```

Then repeat the repro steps above: with the toggle ON and uma `10/5/0/-5`, the indicator must be
neutral/info (no red ✗, no "Сума має дорівнювати 0"); with the toggle OFF it must stay red; with
umaType MATRIX a non-zero row must stay red regardless of the toggle.

## Relevant Files

- `Ranked-Telegram-App/src/components/rules/UmaInputGrid.civet:21-28,69-71` — the inline loop and the indicator
- `Ranked-Telegram-App/src/components/rules/UmaInputGrid.scss:58-64` — sum tone classes
- `Ranked-Telegram-App/src/components/admin/gameRulesEditor/MetaStep.civet:165,176-185` — call site + toggle
- `Ranked-Telegram-App/src/components/admin/gameRulesEditor/validation.civet:65-79` — already honours the flag
- `Ranked-Telegram-App/src/utils/game/umaSum.civet` + `umaSum.test.civet` — new, untracked
- `Ranked-Telegram-App/FRONTEND_GUIDELINES.md:409-444,496-571` — i18n parity + layer/doctor rules
- `Dojo-Tracker-Server/src/service/GameRulesService.ts:68-80,132-172` — scoring vs writable field split
- `Dojo-Tracker-Server/src/service/EventService.ts:62-66,417-440,482-484,535-537` — event role policy

## Out of Scope

- Do not "fix" the server-side non-zero-sum uma — it works. `tests/gameRules.test.ts:697`
  proves POST with `[15,5,0,-5]` + opt-in returns 201 and round-trips through the DB.
- Do not loosen the guard that blocks *scoring* changes on a ruleset that already has games;
  only the rename was carved out.

## Notes

- `InsufficientClubPermissionsError` (`src/error/ClubErrors.ts:29-36`) joins roles with a
  hardcoded Ukrainian `' або '` — an i18n smell noticed in passing, deliberately left alone.
- Original production errors that triggered this work: `POST /api/events` by user 178
  (`Потрібна роль: OWNER`) and two `PUT /api/game-rules/12`
  (`за ними вже зіграно 100 ігор`) on 2026-09-01.
