# Telegram Mini App Authentication

Backend authentication system for Telegram Mini Apps using initData validation and JWT tokens.

## Authentication Flow

```
User opens Telegram Mini App
  ↓
Telegram provides initData with cryptographic hash
  ↓
User registers via POST /api/users (if new)
  ↓
Frontend sends initData as query params to backend
  ↓
Backend validates hash using TELEGRAM_BOT_TOKEN
  ↓
Backend returns JWT accessToken
  ↓
Frontend uses JWT for all subsequent API requests
```

## Endpoint

### POST /api/authenticate

Authenticates Telegram Mini App users using initData passed as query parameters.

**Authentication Required:** No (public endpoint)

**Request Format:**

The initData from Telegram is passed directly as query parameters:

```http
POST /api/authenticate?query_id=AAHdF...&user=%7B%22id%22%3A123456789%7D&auth_date=1234567890&hash=abc123...
```

**Query Parameters:**
- `query_id` (string): Query identifier from Telegram
- `user` (string, required): URL-encoded JSON containing at least `{ "id": <telegram_user_id> }`
- `auth_date` (number, required): Unix timestamp when initData was created
- `hash` (string, required): HMAC-SHA256 hash for validation

**Success Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

- **400 Bad Request:** Missing or invalid initData
  ```json
  { "errorCode": "invalidInitData", "message": "Missing hash parameter" }
  ```
- **400 Bad Request:** Invalid hash (tampered data)
  ```json
  { "errorCode": "invalidInitData", "message": "Hash mismatch" }
  ```
- **400 Bad Request:** Expired initData (older than 24 hours)
  ```json
  { "errorCode": "expiredAuthData", "message": "Authentication data has expired" }
  ```
- **403 Forbidden:** User account is deactivated
- **404 Not Found:** User with Telegram ID not found (register first via POST /api/users)

## Frontend Integration

### Getting initData from Telegram WebApp

```typescript
// Access Telegram WebApp
const tg = window.Telegram.WebApp;

// Get the raw initData string
const initData = tg.initData;

// Send to backend as query string
const response = await fetch(`${API_URL}/api/authenticate?${initData}`, {
  method: 'POST'
});

const { accessToken } = await response.json();
```

### Using the Token

```typescript
// Store the token
localStorage.setItem('token', accessToken);

// Use for authenticated requests
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};
```

## Development Mode

For local testing without a real Telegram bot token, the hash validation is bypassed when `NODE_ENV=development` and no `TELEGRAM_BOT_TOKEN` is set.

**Backend Setup (.env.development):**
```env
NODE_ENV=development
# Leave TELEGRAM_BOT_TOKEN empty or unset
JWT_SECRET=dev-secret-key
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
  '&hash=dev_mode_hash';

// Use in development
const response = await fetch(`${API_URL}/api/authenticate?${mockInitData}`, {
  method: 'POST'
});
```

**Warning:** In production, always set `TELEGRAM_BOT_TOKEN` to enable real signature validation.

## Environment Variables

**Required for Production:**
```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
JWT_SECRET=your_secure_random_secret
```

**Optional:**
```env
JWT_EXPIRES_IN=24h
AUTH_INIT_DATA_VALIDITY_SECONDS=86400
```

## Security Features

- HMAC-SHA256 cryptographic validation of initData
- 24-hour initData expiration check
- Stateless JWT authentication
- User must be pre-registered before authentication
- Dev mode for testing (disabled in production)

## User Registration

Before a user can authenticate, they must be registered:

```bash
# Register a new user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "telegramUsername": "@johndoe",
    "telegramId": 123456789
  }'
```

The user registration endpoint is public and does not require authentication.

## Related Documentation

- [Authentication API](api/authentication.md) - Complete authentication documentation
- [User API](api/users.md) - User registration and management
- [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps)
