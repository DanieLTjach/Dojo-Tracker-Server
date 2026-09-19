# System notifications (broadcast announcements)

How to send a one-off announcement — a release note, a tournament call, a
schedule change — to every active user's notification bell.

`SYSTEM` is one of the five `notification.type` values. Unlike the others it has
no actor, post or achievement: it carries a JSON `payload` instead.

**No code changes are needed to send a new one.** The script is generic; adding
an announcement is two steps — write the copy, run the script.

---

## The model: keys, not text

The `notification` table has **no title or body column**. A broadcast stores a
stable key, and the frontend resolves it through i18n when the drawer renders:

```json
{"key": "tournament_2026_10", "url": "/events"}
```

Text is resolved at **read** time, not write time. This matters: a user's
language comes from `localStorage['app_locale']` in the mini-app and can change
at any moment. Storing Ukrainian text at write time would freeze the wrong
language for anyone who later switches, and would need a per-user locale the
`user` table does not have.

A practical consequence: **you can reword an announcement after sending it.**
The copy lives in the frontend catalog, so editing the YAML and redeploying
changes what every already-delivered notification says.

---

## Step 1 — add the copy (frontend repo)

Add the same key to **both** locale files in `Ranked-Telegram-App`:

- `src/i18n/locales/uk/notifications.yaml`
- `src/i18n/locales/en/notifications.yaml`

```yaml
notifications:
  system:
    welcome_2026_09: "🏯 Зустрічайте оновлений дизайн! ..."
    tournament_2026_10: "🀄 Реєстрація на осінній турнір відкрита!"   # new
```

A key present in only one locale is a bug — the other language silently falls
back and drifts. Add the pair in the same commit.

**Deploy the frontend before sending.** The copy must be live when the
notification arrives, or early readers see the raw JSON payload until the new
build lands.

Naming convention: `<topic>_<year>_<month>` (`welcome_2026_09`,
`tournament_2026_10`). Keys must be unique forever — the key is what makes the
send idempotent, so never reuse one for different text.

---

## Step 2 — send it (backend, on the server)

**Prerequisite: the backend release carrying the script must be deployed.** The
script lives in the app image, so running it against an older image fails with
`npm error Missing script: "welcome:send"`. Check before you start:

```bash
docker compose -f /root/app/docker-compose.yml exec -T dojo-tracker-app \
  ls /app/src/script/
```

`sendWelcomeNotification.ts` must be listed. If it is not, release the backend
first (a GitHub Release triggers the deploy).

Always dry-run first:

```bash
docker compose -f /root/app/docker-compose.yml exec -T dojo-tracker-app \
  npm run welcome:send -- --key tournament_2026_10 --url /events --dry-run
```

Check the recipient count, then send for real by dropping `--dry-run`:

```bash
docker compose -f /root/app/docker-compose.yml exec -T dojo-tracker-app \
  npm run welcome:send -- --key tournament_2026_10 --url /events
```

Locally, against a prod copy, use the `:dev` variant which loads
`.env.development`:

```bash
npm run welcome:send:dev -- --key tournament_2026_10 --url /events --dry-run
```

### Flags

| Flag | Meaning | Default |
|---|---|---|
| `--key` | i18n key under `notifications.system.*` | `welcome_2026_09` |
| `--url` | in-app route opened on tap (`/events`, `/info`, `/clubs`) | `/info` |
| `--dry-run` | count recipients, write nothing | off |

⚠️ **Always pass `--key` explicitly.** Both flags default to the original
welcome values, so a bare `npm run welcome:send` re-runs that announcement —
which inserts nothing and looks indistinguishable from a silent failure.

---

## Behaviour worth knowing

**Idempotent per key.** Re-running the same key inserts 0 rows. The guard is in
the query (`NOT EXISTS ... json_extract(n.payload,'$.key') = :key`), not an
index — the table's unique index is *partial* and covers only
`ACHIEVEMENT_UNLOCK`.

**Keys are independent.** A user who already received `welcome_2026_09` still
receives `tournament_2026_10`. Verified against a production copy: two different
keys each reached all 267 active users.

**Recipients are computed at send time**, and are active users excluding the
system user (`id = 0`). Anyone registering later never sees it. Re-running the
same key afterwards is safe and picks up only the new users.

**In-app only.** Nothing is pushed to Telegram — `NotificationService` never
calls `TelegramMessageService`. Sending a Telegram DM is a separate, deliberate
action.

**A missing i18n key degrades, it does not crash.** The drawer falls back to
rendering the raw payload string, so a bare `notifications.system.foo` never
leaks into the UI. It looks wrong, but nothing breaks.

**There is no undo.** Sent notifications are rows. Removing them means a manual
delete:

```sql
DELETE FROM notification
WHERE type = 'SYSTEM' AND json_extract(payload, '$.key') = 'tournament_2026_10';
```

This is why the dry-run exists.

---

## Where the code lives

| Piece | File |
|---|---|
| Broadcast query + transaction | `src/repository/NotificationRepository.ts` → `broadcastSystemNotification` |
| CLI script | `src/script/sendWelcomeNotification.ts` |
| npm scripts | `welcome:send`, `welcome:send:dev` |
| Tests | `tests/notificationBroadcast.test.ts` |
| Table schema | `db/migrations/021_add_notifications.sql` |
| Frontend rendering | `Ranked-Telegram-App` → `src/components/notifications/NotificationDrawer.civet` (`renderSystemContent`) |
| Frontend copy | `Ranked-Telegram-App` → `src/i18n/locales/{uk,en}/notifications.yaml` |
