# Tournament Mode

Tournament Mode bypasses Telegram authentication for offline tournament environments.

## Configuration

Add to your `.env` file:

```bash
TOURNAMENT_MODE=true
TOURNAMENT_USER_ID=1  # User ID to use for all requests (default: 1)
```

## Behavior

**When enabled:**
- No JWT token validation
- No `Authorization` header required
- All requests authenticated as `TOURNAMENT_USER_ID`
- Admin checks still enforced

**When disabled:**
- Normal JWT authentication required

## ⚠️ Security Warning

**Only use in controlled environments!**

✅ Safe for:
- Offline tournaments with single administrator
- Local development/testing
- Closed network environments

❌ Never use:
- Production servers on public internet
- Multi-user environments without access control

## Usage

### Offline Tournament Workflow

```bash
# 1. Pull latest database
npm run db:pull

# 2. Enable tournament mode in .env
TOURNAMENT_MODE=true
TOURNAMENT_USER_ID=1

# 3. Start server
npm run dev

# 4. After tournament: disable mode and push data
TOURNAMENT_MODE=false
npm run db:push
```

### API Usage

```bash
# No Authorization header needed
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"eventId": 1, "playersData": [...]}'
```

## Troubleshooting

**"User is not active" error:**
```sql
UPDATE user SET isActive = 1 WHERE id = 1;
```

**"Insufficient permissions" error:**
```sql
UPDATE user SET isAdmin = 1 WHERE id = 1;
```

**Tournament mode not working:**
1. Verify `TOURNAMENT_MODE=true` in `.env`
2. Restart server after config changes
3. Check server logs for errors
