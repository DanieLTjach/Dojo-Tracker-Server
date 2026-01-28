# Tournament Mode

## Overview

Tournament Mode is a configuration option that allows the server to operate without Telegram authentication. This is designed for offline tournament environments where participants don't have access to Telegram but still need to track games and ratings.

---

## Use Cases

- **Offline tournaments** - Events held in locations without internet connectivity
- **Local testing** - Development and testing without Telegram bot setup
- **Controlled environments** - Tournaments where a single administrator manages all game entries

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable tournament mode (bypasses Telegram authentication)
TOURNAMENT_MODE=true

# User ID to use for all authenticated requests (default: 1)
TOURNAMENT_USER_ID=1
```

### Default Values

- `TOURNAMENT_MODE`: `false` (authentication required)
- `TOURNAMENT_USER_ID`: `1` (when tournament mode is enabled)

---

## Behavior

### When Tournament Mode is Enabled (`TOURNAMENT_MODE=true`)

1. **Authentication Bypass**
   - All requests to protected endpoints bypass JWT token validation
   - No `Authorization` header required
   - All requests are authenticated as the configured `TOURNAMENT_USER_ID`

2. **API Access**
   - All existing endpoints remain functional
   - Games can be created, updated, and deleted
   - Users can be managed
   - Ratings are calculated normally

3. **Admin Access**
   - The configured `TOURNAMENT_USER_ID` should be an admin user
   - Admin endpoints remain protected by `requireAdmin` middleware
   - Non-admin actions work if the user has appropriate permissions

### When Tournament Mode is Disabled (`TOURNAMENT_MODE=false`)

- Normal JWT authentication is required
- All security measures are enforced
- Telegram Mini App authentication works as usual

---

## Security Considerations

### ⚠️ WARNING

**Tournament mode disables authentication. Only use in controlled environments!**

### When to Use

✅ **Safe scenarios:**
- Offline tournaments with a single trusted administrator
- Local development/testing
- Closed network environments
- Demo/presentation scenarios

❌ **Do NOT use:**
- Production servers accessible from the internet
- Multi-user environments without physical access control
- Any scenario where unauthorized access could occur

### Best Practices

1. **Never enable in production** with public internet access
2. **Use a dedicated user** - Create a specific "Tournament Admin" user for `TOURNAMENT_USER_ID`
3. **Disable after use** - Turn off tournament mode immediately after the event
4. **Backup data** - Always backup the database before and after tournaments
5. **Monitor access** - Log all actions during tournament mode

---

## Setup Guide

### For Offline Tournaments

1. **Before the tournament:**
   ```bash
   # Pull latest database from production
   npm run db:pull

   # Enable tournament mode
   echo "TOURNAMENT_MODE=true" >> .env
   echo "TOURNAMENT_USER_ID=1" >> .env

   # Start server
   npm run dev
   ```

2. **During the tournament:**
   - Administrator uses the application to record games
   - No authentication required
   - All games are recorded under the tournament user

3. **After the tournament:**
   ```bash
   # Disable tournament mode
   # Remove or set TOURNAMENT_MODE=false in .env

   # Push updated database to production
   npm run db:push
   ```

---

## API Behavior

### Request Format

**Normal mode:**
```bash
curl -X POST http://localhost:3000/api/games \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"eventId": 1, "playersData": [...]}'
```

**Tournament mode:**
```bash
# No Authorization header needed
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"eventId": 1, "playersData": [...]}'
```

### Response Format

Responses remain unchanged. The `req.user` object is populated with:

```javascript
{
  userId: <TOURNAMENT_USER_ID>
}
```

---

## Implementation Details

### Code Changes

1. **Config** (`config/config.ts`):
   - Added `tournamentMode: boolean`
   - Added `tournamentUserId?: number`

2. **AuthMiddleware** (`src/middleware/AuthMiddleware.ts`):
   - Check `config.tournamentMode` before JWT validation
   - If enabled, set `req.user = { userId: config.tournamentUserId }`
   - If disabled, proceed with normal authentication

3. **Environment** (`.env.example`):
   - Documented `TOURNAMENT_MODE` and `TOURNAMENT_USER_ID`

### No Changes Required

- ✅ All existing endpoints work without modification
- ✅ Game creation, user management, ratings all function normally
- ✅ Admin middleware still enforces admin checks
- ✅ Database operations unchanged

---

## Testing

### Manual Testing

1. Enable tournament mode:
   ```bash
   TOURNAMENT_MODE=true
   TOURNAMENT_USER_ID=1
   ```

2. Test API access without authentication:
   ```bash
   # Should succeed
   curl http://localhost:3000/api/events

   # Should succeed (if user 1 is admin)
   curl -X POST http://localhost:3000/api/games \
     -H "Content-Type: application/json" \
     -d '{"eventId": 1, "playersData": [...]}'
   ```

3. Disable tournament mode and verify authentication required:
   ```bash
   TOURNAMENT_MODE=false
   ```

   ```bash
   # Should return 401 Unauthorized
   curl http://localhost:3000/api/events
   ```

### Automated Testing

Tournament mode is automatically disabled in test environment (`NODE_ENV=test`), ensuring all tests run with proper authentication.

---

## Troubleshooting

### Issue: "User is not active" error in tournament mode

**Solution:** Ensure the `TOURNAMENT_USER_ID` points to an active user:

```sql
-- Check user status
SELECT id, name, isActive FROM user WHERE id = 1;

-- Activate user if needed
UPDATE user SET isActive = 1 WHERE id = 1;
```

### Issue: "Insufficient permissions" for admin endpoints

**Solution:** Ensure the tournament user has admin privileges:

```sql
-- Check admin status
SELECT id, name, isAdmin FROM user WHERE id = 1;

-- Grant admin if needed
UPDATE user SET isAdmin = 1 WHERE id = 1;
```

### Issue: Tournament mode not working

**Checklist:**
1. Verify `.env` file contains `TOURNAMENT_MODE=true`
2. Restart the server after changing environment variables
3. Check server logs for config values on startup
4. Ensure no typos in environment variable names

---

## Migration Guide

### From Hardcoded Auth Bypass

If you previously used a hardcoded authentication bypass:

```javascript
// Old approach (unsafe)
export const requireAuth = (req, res, next) => {
    req.user = { userId: 1 };
    next();
};
```

**Migration steps:**

1. Remove hardcoded bypass
2. Add environment variables to `.env`:
   ```bash
   TOURNAMENT_MODE=true
   TOURNAMENT_USER_ID=1
   ```
3. Update code to use new config-based approach
4. Test authentication in both modes

---

## Future Enhancements

Potential improvements for tournament mode:

1. **Tournament session tracking**
   - Log start/end times of tournament mode sessions
   - Track which games were created during tournament mode

2. **Multiple tournament users**
   - Support multiple authorized users during tournaments
   - Allow different users for different game tables

3. **Tournament mode API**
   - Dedicated endpoints for tournament management
   - Bulk game entry interface

4. **Audit logging**
   - Enhanced logging for all actions in tournament mode
   - Generate tournament reports

---

## Support

For questions or issues related to tournament mode:

1. Check this documentation
2. Review server logs for configuration errors
3. Verify database user setup
4. Create an issue on GitHub with:
   - Environment variables (sanitized)
   - Error messages
   - Expected vs actual behavior
