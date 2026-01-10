# Authentication API

Base URL: `http://localhost:3000/api`

The Dojo Tracker Server uses JWT (JSON Web Token) authentication to secure API endpoints. All API requests (except authentication and user registration endpoints) require a valid JWT token in the `Authorization` header.

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [Authenticate with Telegram initData](#authenticate-with-telegram-initdata)
- [Using JWT Tokens](#using-jwt-tokens)
- [Token Structure](#token-structure)
- [Error Responses](#error-responses)

---

## Overview

### Authentication Model

- All API endpoints require JWT authentication (except `/api/authenticate` and `POST /api/users`)
- Tokens are issued upon successful authentication via Telegram Mini App initData
- Tokens contain the user ID
- Tokens must be included in the `Authorization` header as `Bearer <token>`

### Protected Endpoints

All endpoints under `/api/users` (except registration) and `/api/games` require authentication:
- `GET`, `POST`, `PUT`, `PATCH`, `DELETE` operations
- Both admin and non-admin users require authentication
- Admin-only operations are enforced at the endpoint level

### Public Endpoints

- `POST /api/authenticate` - Telegram Mini App authentication
- `POST /api/users` - User registration

---

## Authentication Flow

```
┌─────────┐                                     ┌─────────┐
│ Client  │                                     │ Server  │
└────┬────┘                                     └────┬────┘
     │                                               │
     │  POST /api/authenticate?query_id=...         │
     │  &user=...&auth_date=...&hash=...            │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                      ┌─────────────────────┐  │
     │                      │ Validate hash       │  │
     │                      │ Check auth_date     │  │
     │                      │ Lookup user         │  │
     │                      │ Generate JWT        │  │
     │                      └─────────────────────┘  │
     │                                               │
     │  { accessToken }                              │
     │<──────────────────────────────────────────────┤
     │                                               │
     │  Subsequent API calls                         │
     │  Authorization: Bearer <token>                │
     ├──────────────────────────────────────────────>│
     │                                               │
     │  Response                                     │
     │<──────────────────────────────────────────────┤
     │                                               │
```

---

## Authenticate with Telegram initData

Authenticate a user using Telegram Mini App initData. The initData is passed as query parameters (raw from Telegram).

**Endpoint:** `POST /api/authenticate`

**Authentication Required:** No (public endpoint)

**Query Parameters:**
- `query_id` (string): Query identifier from Telegram
- `user` (string, required): URL-encoded JSON with user data (must contain `id` field)
- `auth_date` (number, required): Unix timestamp when initData was created
- `hash` (string, required): HMAC-SHA256 hash for validation

**Note:** The user must already exist in the system. Use `POST /api/users` to register new users first.

**Success Response:** `200 OK`

**Example Request:**

```bash
# The initData from Telegram is passed directly as query parameters
curl -X POST "http://localhost:3000/api/authenticate?query_id=AAHdF...&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%7D&auth_date=1234567890&hash=abc123..."
```

**Example Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTcwNTMyMTgwMCwiZXhwIjoxNzA1NDA4MjAwfQ.signature"
}
```

**Errors:**
- `400 Bad Request` - If hash is missing or invalid
- `400 Bad Request` - If user parameter is missing or malformed
- `400 Bad Request` - If auth_date is missing, invalid, or expired (>24 hours old)
- `403 Forbidden` - If the user account is deactivated
- `404 Not Found` - If no user exists with the Telegram ID from initData

---

## Using JWT Tokens

### Including Tokens in Requests

All protected endpoints require the JWT token in the `Authorization` header using the Bearer scheme:

```bash
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Expiration

- Tokens are valid for **24 hours** from issuance (configurable via `JWT_EXPIRES_IN`)
- After expiration, users must authenticate again to obtain a new token
- The expiration time is included in the token payload as the `exp` claim

### Token Storage

**Best Practices:**
- Store tokens securely (e.g., secure HTTP-only cookies, secure storage)
- Never expose tokens in URLs or logs
- Clear tokens on logout

---

## Token Structure

JWT tokens contain the following claims:

```json
{
  "userId": 1,
  "iat": 1705321800,
  "exp": 1705408200
}
```

**Claims:**
- `userId` (number): Internal user ID
- `iat` (number): Issued at timestamp (Unix time)
- `exp` (number): Expiration timestamp (Unix time)

**Note:** The server automatically extracts and validates these claims on each request. You don't need to manually parse the token.

---

## Error Responses

### 400 Bad Request

Returned when initData validation fails.

```json
{
  "errorCode": "invalidInitData",
  "message": "Missing hash parameter"
}
```

```json
{
  "errorCode": "invalidInitData",
  "message": "Hash mismatch"
}
```

```json
{
  "errorCode": "expiredAuthData",
  "message": "Authentication data has expired"
}
```

### 401 Unauthorized

Returned when the JWT token is missing, invalid, or expired.

```json
{
  "message": "Authentication required"
}
```

```json
{
  "message": "Invalid or expired token"
}
```

### 403 Forbidden

Returned when the user account is deactivated.

```json
{
  "errorCode": "userIsNotActive",
  "message": "User with id {id} is not active"
}
```

Returned when trying to perform admin-only operations without admin privileges.

```json
{
  "message": "Insufficient permissions to perform this action"
}
```

### 404 Not Found

Returned when user with the Telegram ID from initData does not exist.

```json
{
  "errorCode": "userNotFoundByTelegramId",
  "message": "User with telegram id {telegramId} not found"
}
```

---

## Example Usage

### Complete Authentication Flow

```bash
# Step 1: Register user (if new)
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "telegramUsername": "@johndoe",
    "telegramId": 123456789
  }'

# Step 2: Authenticate using Telegram initData (query params from Telegram)
# In real usage, the frontend passes initData directly from Telegram WebApp
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/authenticate?query_id=test&user=%7B%22id%22%3A123456789%7D&auth_date=1234567890&hash=...")

# Step 3: Extract token
TOKEN=$(echo $RESPONSE | jq -r '.accessToken')

# Step 4: Use token for authenticated requests
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/games \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 1,
    "playersData": [
      { "userId": 1, "points": 35000, "startPlace": "EAST" },
      { "userId": 2, "points": 28000, "startPlace": "SOUTH" },
      { "userId": 3, "points": 22000, "startPlace": "WEST" },
      { "userId": 4, "points": 15000, "startPlace": "NORTH" }
    ]
  }'
```

---

## Security Considerations

1. **HTTPS Only**: In production, always use HTTPS to prevent token interception
2. **Token Secret**: The JWT secret is configured via environment variable `JWT_SECRET`
3. **Token Rotation**: Tokens expire after 24 hours; implement token refresh if needed
4. **Rate Limiting**: Consider implementing rate limiting on the authentication endpoint
5. **Inactive Users**: Deactivated users cannot authenticate even with valid initData
6. **Hash Validation**: The server validates initData using HMAC-SHA256 with the bot token

---

## Environment Configuration

Required environment variables for authentication:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# Telegram Bot Token (required for hash validation in production)
TELEGRAM_BOT_TOKEN=your-bot-token-here

# Optional: initData validity period (default: 86400 seconds = 24 hours)
AUTH_INIT_DATA_VALIDITY_SECONDS=86400
```

See the main README for complete environment setup instructions.
