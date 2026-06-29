# Usage credits: тариф і історична оцінка

Дата аналізу: 2026-06-29

Джерело даних: `db/data/prod-backup-20260629-082232.db`

## Висновок

Після фідбеку dev-команди usage credits краще прив'язати до дій, які клуб реально відчуває як зіграні ігри або persisted операції навколо турнірної гри. Тому з billable actions прибрані:

- `EVENT_CREATED`
- `TOURNAMENT_CREATED`
- `CLUB_USER_ADDED`
- `GAME_RULES_CREATED`
- `POLL_SENT`
- `TOURNAMENT_SEATING_GENERATED`
- `TEAM_CREATED`

Redis також не потрібен: SQLite-транзакцій достатньо для поточного сценарію, бо списання виконується разом із write-операціями застосунку.

Ціна: **$10 за 100 credits**, тобто **1 credit = $0.10**.

## Новий тариф

| Action | Credits | Коментар |
| --- | ---: | --- |
| `SAVED_GAME_CREATED` | 1 | Збережена реально зіграна гра |
| `TRACKED_GAME_CREATED` | 2 | Tracking дорожчий x2 |
| `TRACKED_ROUND_RESULT_CREATED` | 2 | Кожен записаний round result у tracked game |
| `TOURNAMENT_SEATING_APPLIED` | 2 за table-round | Persisted tournament games |
| `TOURNAMENT_ROUND_IMPORTED` | 2 за table-round | Persisted imported tournament round |
| `CSV_GAMES_IMPORTED` | 1 за гру | Bulk import реально зіграних ігор |
| `INVITE_CREATED` | 1 | Створене invite |
| `INVITE_REVOKED` | 1 | Тільки active -> revoked |

`POLL_SENT` і `TOURNAMENT_SEATING_GENERATED` не billable, бо зараз вони не мають стабільного persisted usage-сліду, який owner може звірити з базою. Seating generate також є preview/CPU action: можна натиснути кілька разів без створення сутностей.

Для persisted tournament management оцінка така: якщо для table-round відбулися apply + import, це `2 + 2 = 4 credits` за table-round. Для 8-round турніру це дає приблизно `8 credits` на учасника, тобто близько **$0.80**. Решта до приблизно `$1 per participant` може приходити з фактично записаних tracked game/round дій, якщо турнір ведеться через live tracking, а не одним import.

## Обмеження аналізу

У production backup ще немає usage tables, тому це не фактичний invoice, а ретроспективна оцінка за даними, які можна відновити з існуючих таблиць.

Можна порахувати з DB:

- chargeable saved games: non-tournament `game` без рядків у `gameRound`;
- tracked games: `game` з рядками у `gameRound`;
- tracked round results: кількість рядків у `gameRound`;
- persisted tournament table-rounds: `game.tournamentRound IS NOT NULL`;
- created/revoked invites: `clubInvite`;
- clubs and event ownership.

Не можна точно порахувати з backup:

- які games були створені через CSV/import endpoint, а які вручну;
- чи кожен persisted tournament table-round проходив через apply, import або обидва;
- чи tracked tournament games були створені seating/apply flow або іншим шляхом.

Через це `POLL_SENT` і `TOURNAMENT_SEATING_GENERATED` виключені з тарифу. Вони не входять у розрахунок нижче.

Тому в таблицях нижче є дві частини:

- **game/invite credits**: visible games + tracked rounds + invites;
- **оцінка persisted tournament management**: `tournament table-rounds * 4 credits`, якщо рахувати apply + import.

## Підсумок по клубах

| Club | Chargeable saved games | Tracked games | Tracked rounds | Tournament table-rounds | Invites created | Invites revoked | Game/invite credits | Оцінка persisted tournament management | Разом credits | Разом $ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Japan Dojo | 870 | 81 | 806 | 182 | 3 | 0 | 2,647 | 728 | 3,375 | $337.50 |
| Lviv Mahjong Club | 38 | 0 | 0 | 0 | 0 | 0 | 38 | 0 | 38 | $3.80 |
| Satori | 85 | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 85 | $8.50 |
| Kharkiv Mahjong Club (仮) | 18 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 18 | $1.80 |
| SpilnoHub 🙌 | 35 | 0 | 0 | 0 | 0 | 0 | 35 | 0 | 35 | $3.50 |
| Board Games Club | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | $0.00 |

Загалом:

- chargeable saved games: `1,046`
- tracked games: `81`
- tracked round results: `806`
- tournament table-rounds: `182`
- invites created: `3`
- invites revoked: `0`
- game/invite credits: `2,823`
- оцінка persisted tournament management: `728`
- разом: `3,551 credits`
- разом за тарифом `$10 / 100 credits`: **$355.10**

## Турніри і ціль "$1 per participant"

| Tournament | Approved participants | Rounds | Table-rounds | Management credits | Credits / participant | $ / participant |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| White Dragon Cup 2026 | 36 | 8 | 72 | 288 | 8.00 | $0.80 |
| Green Dragon Cup 2026 🐉 | 42 | 8 | 80 | 320 | 7.62 | $0.76 |
| Kakapo Cup 3 | 24 | 5 | 30 | 120 | 5.00 | $0.50 |
| Тестовий Турнір | 6 | 0 | 0 | 0 | 0.00 | $0.00 |

Це нижче за `$1` на учасника, якщо рахувати тільки persisted tournament management. Для турнірів, які ведуться live tracking-ом, tracked game/round charges додадуться окремо.

## Рекомендація

V1 billing варто залишити на діях, які або прямо створюють ігровий результат, або є видимою persisted операцією навколо турнірної гри:

- saved/tracked games;
- tracked round results;
- tournament seating apply/import;
- CSV import;
- invite create/revoke.

Не варто списувати кредити за створення event/tournament, membership changes, game rules, teams, reads, previews, poll sends, seating generate, setup/config або idempotent no-op дії.
