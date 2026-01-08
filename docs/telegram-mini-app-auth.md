# Telegram Mini App Authentication

Backend authentication system for Telegram Mini Apps using initData validation and JWT tokens.

## Authentication Flow

```
User opens Telegram Mini App
  ↓
Telegram provides initData with cryptographic hash
  ↓
Frontend sends initData to backend
  ↓
Backend validates hash using TELEGRAM_BOT_TOKEN
  ↓
Backend auto-creates user if new, returns JWT + user info
  ↓
Frontend uses JWT for all subsequent API requests
```

## Endpoint

### POST /api/auth/telegram

Authenticates Telegram Mini App users using initData.

**Authentication Required:** No (public endpoint)

**Request Options:**

1. **Authorization Header (Recommended):**
   ```http
   POST /api/auth/telegram
   Authorization: tma <initDataRaw>
   ```

2. **Request Body (Alternative):**
   ```http
   POST /api/auth/telegram
   Content-Type: application/json

   {
     "initData": "<initDataRaw>"
   }
   ```

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "telegramId": 123456789,
    "name": "John",
    "telegramUsername": "@john",
    "isAdmin": false,
    "isActive": true
  },
  "isNewUser": false
}
```

- `isNewUser`: `true` if user was just created, `false` if already existed
- Use this flag for onboarding flows

**Error Responses:**

- **400 Bad Request:** Missing or invalid initData
- **400 Bad Request:** Invalid hash (tampered data)
- **400 Bad Request:** Expired initData (older than 24 hours)

## Development Mode

For local testing without a real Telegram bot token:

**Backend Setup:**
```env
NODE_ENV=development
# Leave TELEGRAM_BOT_TOKEN empty or unset
```

**Frontend Mock Data:**
```typescript
const mockInitData = 'query_id=test&user=' +
  encodeURIComponent(JSON.stringify({
    id: 123456789,
    first_name: "Test",
    username: "testuser"
  })) +
  '&auth_date=' + Math.floor(Date.now() / 1000) +
  '&hash=dev_mode_hash';  // Special dev mode hash
```

When the backend detects `hash=dev_mode_hash` and `NODE_ENV=development`, it skips cryptographic validation.

⚠️ **Production:** Set `TELEGRAM_BOT_TOKEN` to enable real signature validation.

## Environment Variables

**Required for Production:**
```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
JWT_SECRET=your_secure_random_secret
```

**Optional:**
```env
JWT_EXPIRY=24h
AUTH_INIT_DATA_VALIDITY_SECONDS=86400
```

## Security Features

- ✅ HMAC-SHA256 cryptographic validation
- ✅ 24-hour initData expiration check
- ✅ Automatic user registration
- ✅ Stateless JWT authentication
- ✅ Dev mode for testing (disabled in production)

## Related Documentation

- [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps)
- API endpoint documentation (see other docs in this folder)
