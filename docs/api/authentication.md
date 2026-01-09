# Authentication API

Base URL: `http://localhost:3000/api/auth`

The Dojo Tracker Server uses JWT (JSON Web Token) authentication to secure API endpoints. All API requests (except authentication endpoints) require a valid JWT token in the `Authorization` header.

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [Login with Telegram](#login-with-telegram)
- [Auto-Registration](#auto-registration)
- [Using JWT Tokens](#using-jwt-tokens)
- [Token Structure](#token-structure)
- [Error Responses](#error-responses)

---

## Overview

### Authentication Model

- All API endpoints require JWT authentication
- Tokens are issued upon successful login
- Tokens contain user ID, Telegram ID, admin status, and active status
- Tokens must be included in the `Authorization` header as `Bearer <token>`

### Protected Endpoints

All endpoints under `/api/users` and `/api/games` require authentication:
- `GET`, `POST`, `PUT`, `PATCH`, `DELETE` operations
- Both admin and non-admin users require authentication
- Admin-only operations are enforced at the endpoint level

---

## Authentication Flow

```
┌─────────┐                                     ┌─────────┐
│ Client  │                                     │ Server  │
└────┬────┘                                     └────┬────┘
     │                                               │
     │  POST /api/auth/login                         │
     │  { telegramId, telegramUsername }             │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                      ┌─────────────────────┐  │
     │                      │ User exists?        │  │
     │                      │ No → Auto-register  │  │
     │                      │ Yes → Generate JWT  │  │
     │                      └─────────────────────┘  │
     │                                               │
     │  { token, user }                              │
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

## Login with Telegram

Authenticate a user using their Telegram credentials. If the user doesn't exist, they will be automatically registered.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
- `telegramId` (number, required): Telegram user ID (integer)
- `telegramUsername` (string, optional): Telegram username (e.g., "@username")

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "telegramUsername": "@johndoe"
  }'
```

**Example Response (Existing User):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInRlbGVncmFtSWQiOjEyMzQ1Njc4OSwiaXNBZG1pbiI6ZmFsc2UsImlzQWN0aXZlIjp0cnVlLCJpYXQiOjE3MDUzMjE4MDAsImV4cCI6MTcwNTQwODIwMH0.signature",
  "user": {
    "id": 1,
    "name": "John Doe",
    "telegramUsername": "@johndoe",
    "telegramId": 123456789,
    "isAdmin": 0,
    "isActive": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "modifiedAt": "2024-01-15T10:30:00.000Z",
    "modifiedBy": "SYSTEM"
  }
}
```

**Example Response (Auto-Registered User):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 5,
    "name": "User_123456789",
    "telegramUsername": "@johndoe",
    "telegramId": 123456789,
    "isAdmin": 0,
    "isActive": 1,
    "createdAt": "2024-01-15T14:30:00.000Z",
    "modifiedAt": "2024-01-15T14:30:00.000Z",
    "modifiedBy": "SYSTEM"
  }
}
```

**Errors:**
- `400 Bad Request` - If telegramId is missing or invalid
- `403 Forbidden` - If the user account is deactivated
- `500 Internal Server Error` - If auto-registration fails

---

## Auto-Registration

When a user logs in for the first time (not found in the database), the system automatically creates a new user account:

**Auto-Registration Behavior:**
1. System checks if user with `telegramId` exists
2. If not found, creates a new user with:
   - `name`: Auto-generated as `User_{telegramId}`
   - `telegramUsername`: From login request (if provided)
   - `telegramId`: From login request
   - `isAdmin`: `0` (false)
   - `isActive`: `1` (true)
   - `createdBy`: System user (ID: 0)
3. Returns JWT token for the newly created user

**Note:** Auto-registered users can later update their name and username through the `/api/users/:id` PATCH endpoint.

---

## Using JWT Tokens

### Including Tokens in Requests

All protected endpoints require the JWT token in the `Authorization` header using the Bearer scheme:

```bash
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Expiration

- Tokens are valid for **24 hours** from issuance
- After expiration, users must login again to obtain a new token
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
  "telegramId": 123456789,
  "isAdmin": false,
  "isActive": true,
  "iat": 1705321800,
  "exp": 1705408200
}
```

**Claims:**
- `userId` (number): Internal user ID
- `telegramId` (number): Telegram user ID
- `isAdmin` (boolean): Whether the user has admin privileges
- `isActive` (boolean): Whether the user account is active
- `iat` (number): Issued at timestamp (Unix time)
- `exp` (number): Expiration timestamp (Unix time)

**Note:** The server automatically extracts and validates these claims on each request. You don't need to manually parse the token.

---

## Error Responses

### 400 Bad Request

Returned when the request is malformed or missing required fields.

```json
{
  "error": "Invalid request data",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "undefined",
      "path": ["body", "telegramId"],
      "message": "Required"
    }
  ]
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

### 500 Internal Server Error

Returned when auto-registration or token generation fails.

```json
{
  "message": "Failed to auto-register user"
}
```

---

## Example Usage

### Complete Authentication Flow

```bash
# Step 1: Login (or auto-register)
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "telegramUsername": "@johndoe"
  }')

# Step 2: Extract token
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

# Step 3: Use token for authenticated requests
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
4. **Rate Limiting**: Consider implementing rate limiting on the login endpoint
5. **Inactive Users**: Deactivated users cannot authenticate even with valid credentials

---

## Environment Configuration

Required environment variables for authentication:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# Telegram Bot Token (for future integration)
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

See the main README for complete environment setup instructions.
