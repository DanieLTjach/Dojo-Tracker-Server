# Local Development Setup

How to get the backend running on your machine, including how to make authenticated
API calls **without a real Telegram bot**.

## Prerequisites

- Node.js 24.x (see `.nvmrc` — run `nvm use`)
- npm

## 1. Install dependencies

```bash
npm install
```

## 2. Create `.env.development`

`npm run dev` loads **`.env.development`**, not `.env`. Copy the template and edit it:

```bash
cp .env.example .env.development
```

A working local file:

```env
NODE_ENV=development
PORT=3000
DB_PATH=./db/data/data.db

JWT_SECRET=local_dev_secret_change_me
JWT_EXPIRY=7d
AUTH_INIT_DATA_VALIDITY_SECONDS=86400

FRONTEND_URLS=http://localhost:5173

# A placeholder is fine for backend-only work — see "Authenticating locally" below.
BOT_URL=https://t.me/local_dev_placeholder_bot
BOT_TOKEN=1234567890:LOCAL_DEV_PLACEHOLDER_TOKEN
TELEGRAM_NOTIFICATIONS_ENABLED=false
```

### Required variables

The server refuses to start if any of these are missing (`config/config.ts`):

| Variable | Notes |
| :--- | :--- |
| `NODE_ENV` | `development` locally |
| `JWT_SECRET` | Any string locally |
| `BOT_TOKEN` | Required, but **does not have to be a real token** locally |
| `BOT_URL` | Required, any URL locally |
| `FRONTEND_URLS` | Comma-separated CORS origins |

`GLOBAL_LOGS_CHAT_ID` is required **only** when `NODE_ENV=production`.

> The variable is `BOT_TOKEN`, not `TELEGRAM_BOT_TOKEN`. Older docs used the wrong name.

## 3. Start the server

```bash
npm run dev
```

The SQLite database is created and migrated automatically at `DB_PATH` on first
start — there is no seed or migrate step to run. You should see the migrations run
and then:

```
Server is running on port 3000
```

With a placeholder `BOT_TOKEN` you will also see two harmless `401: Unauthorized`
errors from Telegram (`setMyCommands` and `getMe`). **These are logged and ignored —
the HTTP API works normally.** Only bot commands and outgoing Telegram messages are
unavailable.

Check it:

```bash
curl http://localhost:3000/
```

## Authenticating locally (no real bot needed)

This is the part that trips people up. There is **no development bypass** of hash
validation — `AuthService.validateInitData` always verifies the hash, in every
environment.

But the check is self-contained: the server computes
`HMAC-SHA256(data_check_string, HMAC-SHA256(BOT_TOKEN, "WebAppData"))` and compares
it to the `hash` parameter. It never asks Telegram whether `BOT_TOKEN` is real.
So if you sign the initData with the **same placeholder token** that is in your
`.env.development`, the server accepts it.

A helper script does this for you:

```bash
npm run initdata:dev -- --telegram-id 123456789 --username your_handle --name "Your Name"
```

It prints a ready-to-use query string. Full flow:

```bash
# 1. Generate signed initData
QS=$(npm run --silent initdata:dev -- --telegram-id 123456789 --username your_handle --name "Your Name")

# 2. Register the user (public endpoint; initData goes in the query string)
curl -X POST "http://localhost:3000/api/users?$QS" \
  -H "Content-Type: application/json" \
  -d '{"name": "Your Name"}'

# 3. Exchange initData for a JWT
curl -X POST "http://localhost:3000/api/authenticate?$QS"
# → {"accessToken":"eyJ..."}

# 4. Call protected endpoints
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer <accessToken>"
```

initData expires after `AUTH_INIT_DATA_VALIDITY_SECONDS`. Re-run the script to get a
fresh one.

### Making yourself an admin

Admin-only endpoints need the flag set directly in the database:

```bash
sqlite3 ./db/data/data.db "UPDATE user SET isAdmin = 1 WHERE telegramId = 123456789;"
```

Then re-authenticate to get a fresh token.

### Alternative: tournament mode

`TOURNAMENT_MODE=true` skips JWT validation entirely and treats every request as
`TOURNAMENT_USER_ID`. It is coarser than the initData flow — it bypasses auth rather
than exercising it — but is convenient for poking at endpoints. See
[tournament-mode.md](tournament-mode.md).

## Using a real test bot (optional)

Only needed if you are working on bot commands, Telegram notifications, or the Mini
App itself:

1. Create a bot via [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Put the token in `BOT_TOKEN` and the bot link in `BOT_URL`.
3. To open a Mini App from the bot, BotFather needs a **public HTTPS** URL — plain
   `http://localhost:3000` is rejected. Expose your local server with a tunnel
   (`ngrok http 3000`, `cloudflared tunnel --url http://localhost:3000`) and give
   BotFather the resulting HTTPS URL via `/setmenubutton` or `/newapp`.
4. Add the tunnel URL to `FRONTEND_URLS` so CORS allows it.

## Running tests

Tests use `.env.test` (tracked in git) and a separate database — no setup needed:

```bash
npm test
```

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `BOT_TOKEN environment variable is required` | Missing var, or you created `.env` instead of `.env.development`. |
| `Missing hash parameter` | initData was not passed as query params. Use the `initdata:dev` script. |
| `Hash mismatch` | initData was signed with a different token than `BOT_TOKEN`. Regenerate after changing the token. |
| `expiredAuthData` | initData is older than `AUTH_INIT_DATA_VALIDITY_SECONDS`. Regenerate. |
| `404` on `/api/authenticate` | User not registered yet — call `POST /api/users` first. |
| `401: Unauthorized` from Telegram in logs | Expected with a placeholder `BOT_TOKEN`. Harmless. |
| `EADDRINUSE: :::3000` | Port taken: `lsof -ti:3000 \| xargs kill`, or change `PORT`. |
| Migration errors / corrupt local data | `rm -rf db/data` and restart — it rebuilds from scratch. |
