# Discord Activity — get the app launchable in a test server

**Full Path**: `/Users/mac/projects/Dojo-Tracker-Server/notes/handoffs/discord-activity-launch-setup.md`

## Context

We built a Discord Activity (embedded app) integration across two repos:
- Backend: `/Users/mac/projects/Dojo-Tracker-Server`, branch `feat/external-auth-providers` (PR [#110](https://github.com/DanieLTjach/Dojo-Tracker-Server/pull/110)). Already had complete Discord ACTIVITY-flow auth (`POST /api/auth/discord`); we added `GET /api/users/current`.
- Frontend: separate git worktree `/Users/mac/projects/Ranked-Telegram-App-discord`, branch `feat/discord-activity` (PR [#69](https://github.com/DanieLTjach/Ranked-Telegram-App/pull/69)). Adds Discord host detection (`frame_id` query param), `/.proxy`-prefixed API routing, a lazy `@discord/embedded-app-sdk` platform adapter, the Activity auth transport, and a minimal registration form for new Discord identities.

Both PRs are pushed and code-complete per automated tests (backend 1166 tests, frontend 959 tests, both green; builds pass). What's left is **manual Discord Developer Portal / client configuration** to actually launch and see the app working end-to-end — this has NOT been verified live yet.

Discord application: name **"Janren (dev)"**, Client ID `1526904818617028608`. Test server created: **"Dojo Dev Test"**.

## Reproduce Steps (what's been done so far, to get back to where we left off)

1. Backend `.env.development` (gitignored, not committed) has `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BROWSER_REDIRECT_URI=https://127.0.0.1` set. Backend requires **all three** set or the adapter reports "not configured", even though ACTIVITY flow itself doesn't use the redirect URI.
2. Frontend worktree `.env` (gitignored) has `VITE_DISCORD_CLIENT_ID=1526904818617028608`.
3. Fresh prod DB backup was synced and migrated successfully (see below — required a one-time backfill).
4. In Discord Developer Portal (`discord.com/developers/applications/1526904818617028608`):
   - **Activities → Settings → Enable Activities**: toggled ON.
   - **Activities → URL Mappings → Root Mapping**: target set to an ngrok/cloudflared tunnel host pointed at the frontend dev server (Vite, port 5174 — NOT the backend's 3000; Vite already proxies `/api` → `localhost:3000`).
   - User also tried the **Application Test Mode** modal (Discord client → User Settings → Advanced → Application Test Mode) with Application ID `1526904818617028608` and "Localhost" origin type — this needs **port 5174**, not 8080 (8080 was the wrong default the user had entered; unclear if corrected).
   - **App Testers** page (Overview → App Testers): 0 testers currently invited. User was told to invite their own Discord username there, since unpublished/unverified Activities are typically only launchable by testers even in Test Mode — **this step's outcome is unconfirmed**, conversation ended here.
5. In the Discord client: created server "Dojo Dev Test", joined the "General" voice channel, opened the Activities picker (grid/apps icon in the voice control tray, bottom-left), searched — app has not yet successfully appeared in the picker as of last check.

## Current Issue

The Discord Activity has never successfully launched. Blocked on **portal/client configuration**, not application code. Last unresolved step: whether adding self as an App Tester (Overview → App Testers → invite `discord.username`) makes the app appear in the voice-channel Activities picker. Need to:
1. Confirm the tester invite was completed (check "Invited Testers (X of 50)" count > 0).
2. Rejoin the voice channel, reopen Activities picker, search "Janren" — confirm it now appears.
3. If it still doesn't appear, other likely causes to check next: whether "Application Test Mode" toggle in the Discord *client* (not the portal) is still active and pointed at the right port; whether the tunnel (ngrok/cloudflared) is still running and its URL still matches the Root Mapping (free ngrok URLs change on restart); whether the ngrok free-tier interstitial page is blocking the iframe load (need `ngrok http 5174 --request-header-add "ngrok-skip-browser-warning:true"` or equivalent).

## How to Verify

Once the Activity launches inside Discord:
- It should load the frontend dev server through `/.proxy/api` → confirm no CSP/network errors in the Activity's console (Discord doesn't expose devtools easily inside the client; may need to test via a browser-based Discord session with devtools open, or the desktop client's activity debugging).
- Auth: should hit `POST /api/auth/discord` with `{flow: 'ACTIVITY', code}` and either log in an existing linked Discord user or show the name+nickname registration screen (`src/components/ExternalAuthRegistrationForm.civet` in the FE worktree).
- Backend logs (`npm run dev` in Dojo-Tracker-Server) should show the incoming `/api/auth/discord` request when the Activity boots.

## Relevant Files

- Frontend Discord auth transport: `/Users/mac/projects/Ranked-Telegram-App-discord/src/utils/discordAuth.civet`
- Frontend platform adapter: `/Users/mac/projects/Ranked-Telegram-App-discord/src/platform/discordPlatform.civet`, `discordSdk.civet`, `detect.civet`
- Frontend boot wiring: `/Users/mac/projects/Ranked-Telegram-App-discord/src/pages/RegisterPage.civet`
- Backend Discord verifier: `/Users/mac/projects/Dojo-Tracker-Server/src/service/ExternalAuthTokenVerifier.ts` (`DiscordAuthTokenVerifier`)
- Backend new endpoint: `/Users/mac/projects/Dojo-Tracker-Server/src/routes/UserRoutes.ts`, `src/controller/UserController.ts` (`getCurrentUser`)
- Design docs: `/Users/mac/projects/Dojo-Tracker-Server/db/data/docs/telegram-discord-embedding-integration.md`, `discord-embedded-app-integration.md`
- Prior plan doc: `/Users/mac/.claude/plans/checkout-to-this-branch-rustling-owl.md`

## Notes

- Fresh prod DB backup at `db/data/prod-backup-20260715-140353.db` initially crashed on migration 013 (`NOT NULL constraint failed: user_new.nickname`) — 17 users had null `telegramUsername`. Fixed by running `node scripts/backfill-telegram-usernames.mjs --db db/data/prod-backup-20260715-140353.db` (filled 16; SYSTEM user id=0 handled inline by the migration). Manifest saved at `scripts/nickname-backfill-2026-07-15T11-07-09-882Z.json` if a revert via `--cleanup` is ever needed.
- Do not paste Discord client secrets into chat/commits again — one was pasted in plaintext earlier this session and written directly into the gitignored `.env.development`/`.env` files only (never committed).
