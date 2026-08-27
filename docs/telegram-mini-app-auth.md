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
Backend validates hash using BOT_TOKEN
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

## Local Development

There is **no development bypass** of hash validation. `AuthService.validateInitData`
verifies the hash in every environment, including `NODE_ENV=development`.

You do not need a real bot token, though. The server validates initData by recomputing
an HMAC from the configured `BOT_TOKEN` — it never checks that token against Telegram.
Signing initData with the same placeholder token you put in `.env.development` produces
initData the server accepts:

```bash
npm run initdata:dev -- --telegram-id 123456789 --username your_handle --name "Your Name"
```

See **[Local Development Setup](local-setup.md)** for the full walkthrough.

## Environment Variables

**Required (all environments):**
```env
NODE_ENV=development        # or production
BOT_TOKEN=your_bot_token_from_botfather
BOT_URL=https://t.me/your_bot
JWT_SECRET=your_secure_random_secret
FRONTEND_URLS=https://your-frontend-origin
```

**Required in production only:**
```env
GLOBAL_LOGS_CHAT_ID=your_logs_chat_id
```

**Optional:**
```env
JWT_EXPIRY=7d
AUTH_INIT_DATA_VALIDITY_SECONDS=86400
```

> The variable is `BOT_TOKEN`. Earlier revisions of this document called it
> `TELEGRAM_BOT_TOKEN`, which the code has never read.

## Security Features

- HMAC-SHA256 cryptographic validation of initData
- 24-hour initData expiration check
- Stateless JWT authentication
- User must be pre-registered before authentication

## User Registration

Before a user can authenticate, they must be registered:

Registration is a public endpoint, but it still requires valid initData in the query
string: the Telegram ID and username are taken from the **signed** initData, not from
the request body. The body carries only the display name.

```bash
# Register a new user (initData in the query string, name in the body)
curl -X POST "http://localhost:3000/api/users?$INIT_DATA" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe"}'
```

Locally, generate `$INIT_DATA` with `npm run initdata:dev` — see
[Local Development Setup](local-setup.md).

## Related Documentation

- [Authentication API](api/authentication.md) - Complete authentication documentation
- [User API](api/users.md) - User registration and management
- [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps)
