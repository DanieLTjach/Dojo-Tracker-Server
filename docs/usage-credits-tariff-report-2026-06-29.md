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
- `INVITE_CREATED`
- `INVITE_REVOKED`

Redis також не потрібен: SQLite-транзакцій достатньо для поточного сценарію, бо списання виконується разом із write-операціями застосунку.

Ціна: **$10 за 100 credits**, тобто **1 credit = $0.10**.

## Новий тариф

| Дія | Кредити | Коментар |
| --- | ---: | --- |
| `SAVED_GAME_CREATED` | 1 | Збережена реально зіграна гра |
| `TRACKED_GAME_CREATED` | 2 | Live tracking дорожчий x2 |
| `TRACKED_ROUND_RESULT_CREATED` | 2 | Кожен записаний результат раунду у tracked game |
| `TOURNAMENT_SEATING_APPLIED` | 5 за table-round | Збережені турнірні ігри з seating/round creation flow |
| `TOURNAMENT_ROUND_IMPORTED` | 5 за table-round | Альтернативний шлях імпорту; той самий тариф за збережений table-round |
| `CSV_GAMES_IMPORTED` | 1 за гру | Масовий імпорт реально зіграних ігор |

`POLL_SENT` і `TOURNAMENT_SEATING_GENERATED` не тарифікуються, бо зараз вони не мають стабільного persisted usage-сліду, який owner може звірити з базою. Seating generate також є preview/CPU action: можна натиснути кілька разів без створення сутностей.

`INVITE_CREATED` і `INVITE_REVOKED` теж не тарифікуються: invite-функція не є game usage, зараз використовується мало, і для owner вона не виглядає як витрата за зіграні ігри.

Для persisted tournament management оцінка така: кожен реально створений tournament table-round коштує `5 credits` один раз. Це має списуватись на endpoint, який створює round/seating/games, а `TOURNAMENT_ROUND_IMPORTED` лишається альтернативним шляхом з тим самим тарифом. Preview/generate без збереження не тарифікується. Для 8-round турніру це дає приблизно `10 credits` на учасника, тобто близько **$1.00**.

## Обмеження аналізу

У production backup ще немає usage tables, тому це не фактичний invoice, а ретроспективна оцінка за даними, які можна відновити з існуючих таблиць.

Можна порахувати з DB:

- chargeable saved games: non-tournament `game` без рядків у `gameRound`;
- tracked games: `game` з рядками у `gameRound`;
- tracked round results: кількість рядків у `gameRound`;
- persisted tournament table-rounds: `game.tournamentRound IS NOT NULL`;
- clubs and event ownership.

Не можна точно порахувати з backup:

- які games були створені через CSV/import endpoint, а які вручну;
- яким саме endpoint був створений кожен persisted tournament table-round;
- чи tracked tournament games були створені seating/apply flow або іншим шляхом.

Через це `POLL_SENT` і `TOURNAMENT_SEATING_GENERATED` виключені з тарифу. Вони не входять у розрахунок нижче.

Тому в таблицях нижче є дві частини:

- **game credits**: visible games + tracked rounds;
- **оцінка persisted tournament management**: `tournament table-rounds * 5 credits`, один раз за persisted table-round.

## Підсумок по клубах

| Club | Chargeable saved games | Tracked games | Tracked rounds | Tournament table-rounds | Game credits | Оцінка persisted tournament management | Разом credits | Разом $ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Japan Dojo | 870 | 81 | 806 | 182 | 2,644 | 910 | 3,554 | $355.40 |
| Lviv Mahjong Club | 38 | 0 | 0 | 0 | 38 | 0 | 38 | $3.80 |
| Satori | 85 | 0 | 0 | 0 | 85 | 0 | 85 | $8.50 |
| Kharkiv Mahjong Club (仮) | 18 | 0 | 0 | 0 | 18 | 0 | 18 | $1.80 |
| SpilnoHub 🙌 | 35 | 0 | 0 | 0 | 35 | 0 | 35 | $3.50 |
| Board Games Club | 0 | 0 | 0 | 0 | 0 | 0 | 0 | $0.00 |

Загалом:

- chargeable saved games: `1,046`
- tracked games: `81`
- tracked round results: `806`
- tournament table-rounds: `182`
- game credits: `2,820`
- оцінка persisted tournament management: `910`
- разом: `3,730 credits`
- разом за тарифом `$10 / 100 credits`: **$373.00**

## Турніри і ціль "$1 per participant"

| Tournament | Approved participants | Rounds | Table-rounds | Management credits | Credits / participant | $ / participant |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| White Dragon Cup 2026 | 36 | 8 | 72 | 360 | 10.00 | $1.00 |
| Green Dragon Cup 2026 🐉 | 42 | 8 | 80 | 400 | 9.52 | $0.95 |
| Kakapo Cup 3 | 24 | 5 | 30 | 150 | 6.25 | $0.63 |
| Тестовий Турнір | 6 | 0 | 0 | 0 | 0.00 | $0.00 |

Це близько до `$1` на учасника для стандартних 8-round турнірів, якщо рахувати тільки persisted tournament management. Коротші турніри природно коштують менше. Для турнірів, які ведуться live tracking-ом, tracked game/round charges додадуться окремо.

## Рекомендація

V1 billing варто залишити на діях, які або прямо створюють ігровий результат, або є видимою persisted операцією навколо турнірної гри:

- saved/tracked games;
- tracked round results;
- створення persisted tournament table-round через seating/round endpoint або import fallback;
- CSV import.

Не варто списувати кредити за створення event/tournament, membership changes, game rules, teams, reads, previews, poll sends, seating generate, setup/config або idempotent no-op дії.
