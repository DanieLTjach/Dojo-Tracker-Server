# Usage credits: тариф і історична оцінка

Дата аналізу: 2026-06-29

Джерело даних: `db/data/prod-backup-20260629-082232.db`

## Висновок

Після фідбеку dev-команди usage credits краще прив'язати до дій, які клуб реально відчуває як зіграні ігри або операції навколо турнірної гри. Тому з billable actions прибрані:

- `EVENT_CREATED`
- `TOURNAMENT_CREATED`
- `CLUB_USER_ADDED`
- `GAME_RULES_CREATED`
- `TEAM_CREATED`

Redis також не потрібен: SQLite-транзакцій достатньо для поточного сценарію, бо списання виконується разом із write-операціями застосунку.

Ціна: **$10 за 100 credits**, тобто **1 credit = $0.10**.

## Новий тариф

| Action | Credits | Коментар |
| --- | ---: | --- |
| `SAVED_GAME_CREATED` | 1 | Збережена реально зіграна гра |
| `TRACKED_GAME_CREATED` | 2 | Tracking дорожчий x2 |
| `TRACKED_ROUND_RESULT_CREATED` | 2 | Кожен записаний round result у tracked game |
| `TOURNAMENT_SEATING_GENERATED` | 2 за table-round | Tournament management x2 |
| `TOURNAMENT_SEATING_APPLIED` | 2 за table-round | Tournament management x2 |
| `TOURNAMENT_ROUND_IMPORTED` | 2 за table-round | Tournament management x2 |
| `CSV_GAMES_IMPORTED` | 1 за гру | Bulk import реально зіграних ігор |
| `POLL_SENT` | 1 | Тільки якщо poll реально відправився в Telegram chat |
| `INVITE_CREATED` | 1 | Створене invite |
| `INVITE_REVOKED` | 1 | Тільки active -> revoked |

Для tournament management оцінка така: якщо для table-round відбулися generate + apply + import, це `2 + 2 + 2 = 6 credits` за table-round. Для 8-round турніру це дає приблизно `12 credits` на учасника, тобто близько **$1.20**. Для 5-round турніру - приблизно **$0.75** на учасника. Це близько до цілі "$1 per tournament participant" і краще масштабується з фактичною кількістю rounds.

## Обмеження аналізу

У production backup ще немає usage tables, тому це не фактичний invoice, а ретроспективна оцінка за даними, які можна відновити з існуючих таблиць.

Можна порахувати точно:

- saved games: `game` без рядків у `gameRound`;
- tracked games: `game` з рядками у `gameRound`;
- tracked round results: кількість рядків у `gameRound`;
- tournament table-rounds: `game.tournamentRound IS NOT NULL`;
- created/revoked invites: `clubInvite`;
- clubs and event ownership.

Не можна точно порахувати з backup:

- історичні `POLL_SENT`, бо немає логів відправлених polls;
- скільки разів реально натискали seating preview/generate;
- чи кожен tournament table-round проходив саме через generate + apply + import;
- які ігри були створені через CSV/import endpoint, а які вручну.

Тому в таблицях нижче є дві частини:

- **точно відновлювані credits**: games + tracked rounds + invites;
- **оцінка tournament management**: `tournament table-rounds * 6 credits`.

## Підсумок по клубах

| Club | Saved games | Tracked games | Tracked rounds | Tournament table-rounds | Invites created | Invites revoked | Точно відновлювані credits | Оцінка tournament management | Разом credits | Разом $ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Japan Dojo | 974 | 81 | 806 | 182 | 3 | 0 | 2,751 | 1,092 | 3,843 | $384.30 |
| Lviv Mahjong Club | 38 | 0 | 0 | 0 | 0 | 0 | 38 | 0 | 38 | $3.80 |
| Satori | 85 | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 85 | $8.50 |
| Kharkiv Mahjong Club (仮) | 18 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 18 | $1.80 |
| SpilnoHub 🙌 | 35 | 0 | 0 | 0 | 0 | 0 | 35 | 0 | 35 | $3.50 |
| Board Games Club | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | $0.00 |

Загалом:

- saved games: `1,150`
- tracked games: `81`
- tracked round results: `806`
- tournament table-rounds: `182`
- invites created: `3`
- invites revoked: `0`
- точно відновлювані credits: `2,927`
- оцінка tournament management: `1,092`
- разом: `4,019 credits`
- разом за тарифом `$10 / 100 credits`: **$401.90**

## Турніри і ціль "$1 per participant"

| Tournament | Approved participants | Rounds | Table-rounds | Management credits | Credits / participant | $ / participant |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| White Dragon Cup 2026 | 36 | 8 | 72 | 432 | 12.00 | $1.20 |
| Green Dragon Cup 2026 🐉 | 42 | 8 | 80 | 480 | 11.43 | $1.14 |
| Kakapo Cup 3 | 24 | 5 | 30 | 180 | 7.50 | $0.75 |
| Тестовий Турнір | 6 | 0 | 0 | 0 | 0.00 | $0.00 |

Це підтверджує, що `2 credits` за tournament table-round action дає порядок величини близько `$1` на учасника для реальних багатораундових турнірів.

## Рекомендація

V1 billing варто залишити на діях, які або прямо створюють ігровий результат, або є видимою операцією навколо турнірної гри:

- saved/tracked games;
- tracked round results;
- tournament seating/apply/import;
- CSV import;
- poll send;
- invite create/revoke.

Не варто списувати кредити за створення event/tournament, membership changes, game rules, teams, reads, previews, setup/config або idempotent no-op дії.
