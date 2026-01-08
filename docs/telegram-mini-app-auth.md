# Telegram Mini App Authentication Guide

This guide explains how to integrate your Telegram Mini App frontend with the Dojo Tracker backend authentication system.

## Overview

The backend now supports **Telegram initData** authentication, which is the standard way to authenticate users in Telegram Mini Apps. No chicken-and-egg problem - users are automatically authenticated via Telegram's cryptographic signature.

## Authentication Flow

```
1. User opens your Telegram Mini App
   ↓
2. Telegram provides initData with user info + cryptographic hash
   ↓
3. Frontend sends initData to backend
   ↓
4. Backend validates the hash (proves data came from Telegram)
   ↓
5. Backend auto-creates user if new, or retrieves existing user
   ↓
6. Backend returns JWT token + user info
   ↓
7. Frontend stores JWT and uses it for all API requests
```

## New Endpoint

### POST /api/auth/telegram

**Purpose**: Authenticate Telegram Mini App users using initData

**Authentication Required**: ❌ No (public endpoint)

**Request (Option 1 - RECOMMENDED - Standard Telegram approach):**
```http
POST /api/auth/telegram
Authorization: tma query_id=AAH...&user={"id":123456789,"first_name":"John"...}&auth_date=1704067200&hash=abc123...
Content-Type: application/json
```

**Request (Option 2 - Alternative - Body parameter):**
```http
POST /api/auth/telegram
Content-Type: application/json

{
  "initData": "query_id=AAH...&user={\"id\":123456789,\"first_name\":\"John\"...}&auth_date=1704067200&hash=abc123..."
}
```

**Response (Success - 200 OK):**
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

**Note**: The `isNewUser` field indicates whether this user was just created during this authentication request (`true`) or already existed (`false`). This is useful for showing onboarding flows or welcome messages to new users.

**Response (Error - 400 Bad Request):**
```json
{
  "error": "initData is required and must be a string"
}
```

**Response (Error - 400 Bad Request - Invalid Hash):**
```json
{
  "message": "Failed to validate Telegram initData: Invalid initData hash - data may have been tampered with"
}
```

**Response (Error - 400 Bad Request - Expired Data):**
```json
{
  "message": "Failed to validate Telegram initData: InitData is too old (older than 24 hours)"
}
```

## Frontend Integration (React/TypeScript)

### Step 1: Install Telegram WebApp SDK

```bash
npm install @twa-dev/sdk
```

### Step 2: Get initData from Telegram

```typescript
import WebApp from '@twa-dev/sdk'

// Get the initData from Telegram
const initData = WebApp.initData;

if (!initData) {
  console.error('Running outside Telegram - no initData available');
  // Handle development/testing mode
}
```

### Step 3: Send to Backend

**Option 1: Using Authorization Header (RECOMMENDED - Telegram Standard)**

```typescript
async function authenticateWithTelegram() {
  try {
    const response = await fetch('http://localhost:3000/api/auth/telegram', {
      method: 'POST',
      headers: {
        'Authorization': `tma ${WebApp.initData}`, // Standard Telegram Mini App format
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error);
    }

    const data = await response.json();

    // Store the JWT token
    localStorage.setItem('jwt_token', data.token);

    // Store user info
    localStorage.setItem('user', JSON.stringify(data.user));

    // Handle new user onboarding
    if (data.isNewUser) {
      console.log('Welcome new user! Show onboarding flow.');
      // You can redirect to onboarding, show a tutorial, etc.
    }

    return data;
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}
```

**Option 2: Using Request Body (Alternative)**

```typescript
async function authenticateWithTelegram() {
  try {
    const response = await fetch('http://localhost:3000/api/auth/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        initData: WebApp.initData
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error);
    }

    const data = await response.json();

    // Store the JWT token
    localStorage.setItem('jwt_token', data.token);

    // Store user info
    localStorage.setItem('user', JSON.stringify(data.user));

    // Handle new user onboarding
    if (data.isNewUser) {
      console.log('Welcome new user! Show onboarding flow.');
      // You can redirect to onboarding, show a tutorial, etc.
    }

    return data;
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}
```

### Step 4: Use JWT for Subsequent Requests

```typescript
// Get stored token
const token = localStorage.getItem('jwt_token');

// Make authenticated request
const response = await fetch('http://localhost:3000/api/users', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Step 5: Handle Authentication State

```typescript
import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user already has a token
    const storedToken = localStorage.getItem('jwt_token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      setUser(JSON.parse(storedUser));
      setLoading(false);
      return;
    }

    // Otherwise, authenticate with Telegram
    if (WebApp.initData) {
      authenticateWithTelegram()
        .then(data => {
          setUser(data.user);
        })
        .catch(error => {
          console.error('Auth failed:', error);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Development mode - no Telegram data available
      console.warn('No Telegram initData - running in development mode');
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please open this app in Telegram</div>;
  }

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      {/* Your app content */}
    </div>
  );
}
```

## Development/Testing Without Telegram

For local development, you can mock the initData using the special `dev_mode_hash`:

```typescript
// ⚠️ ONLY FOR DEVELOPMENT - DO NOT USE IN PRODUCTION
const MOCK_INIT_DATA = 'query_id=test&user=' +
  encodeURIComponent(JSON.stringify({
    id: 123456789,
    first_name: "Test",
    username: "testuser"
  })) +
  '&auth_date=' + Math.floor(Date.now() / 1000) +
  '&hash=dev_mode_hash';

// In your auth function
const initData = process.env.NODE_ENV === 'development'
  ? MOCK_INIT_DATA
  : WebApp.initData;
```

**Development Mode Behavior:**
- The backend automatically detects when `hash=dev_mode_hash` and `NODE_ENV=development` (or `TELEGRAM_BOT_TOKEN` is not set)
- In this mode, cryptographic validation is **skipped** and the backend will log: `⚠️  Development mode: Skipping Telegram initData validation`
- This allows you to test the authentication flow without a real Telegram bot token
- **Production**: The backend will reject `dev_mode_hash` and require valid Telegram signatures

**Note**: For production, you must configure your backend's `TELEGRAM_BOT_TOKEN` environment variable for proper validation.

## Security Features

✅ **Cryptographic Validation**: initData hash is verified using your bot token
✅ **Expiration Check**: initData older than 24 hours is rejected
✅ **Auto-Registration**: New users are created automatically (no manual signup)
✅ **No Password Required**: Users authenticated via Telegram credentials
✅ **JWT Tokens**: Stateless authentication for API requests
✅ **Token Expiration**: JWT tokens expire after 24 hours (configurable)

## API Endpoints Reference

### Public Endpoints (No JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/telegram` | Authenticate with Telegram initData |

### Protected Endpoints (JWT Required)

All other endpoints require `Authorization: Bearer <token>` header:

| Method | Endpoint | Description | Admin Only |
|--------|----------|-------------|------------|
| GET | `/api/users` | Get all users | No |
| GET | `/api/users/:id` | Get user by ID | No |
| GET | `/api/users/by-telegram-id/:telegramId` | Get user by Telegram ID | No |
| PATCH | `/api/users/:id` | Edit user | Admin or Self |
| POST | `/api/users/:id/activate` | Activate user | Yes |
| POST | `/api/users/:id/deactivate` | Deactivate user | Yes |
| GET | `/api/games` | Get all games | No |
| GET | `/api/games/:id` | Get game by ID | No |
| POST | `/api/games` | Create game | No |
| PUT | `/api/games/:id` | Update game | Yes |
| DELETE | `/api/games/:id` | Delete game | Yes |

## Error Handling

### 401 Unauthorized
Token is missing, invalid, or expired. User should re-authenticate.

```typescript
if (response.status === 401) {
  // Clear stored token
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user');

  // Re-authenticate
  await authenticateWithTelegram();
}
```

### 403 Forbidden
User doesn't have permission (e.g., non-admin trying admin operation).

```typescript
if (response.status === 403) {
  alert('You do not have permission to perform this action');
}
```

## Environment Variables

Make sure your backend has these configured:

```env
# Required for Telegram authentication
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# JWT configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h
```

## Complete Example: Axios Interceptor

For apps using Axios, set up an interceptor to automatically include the JWT:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api'
});

// Request interceptor: Add JWT to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle 401 errors
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Token expired or invalid - re-authenticate
      try {
        await authenticateWithTelegram();
        // Retry the original request
        return api.request(error.config);
      } catch (authError) {
        // Authentication failed
        return Promise.reject(authError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

## Questions?

If you encounter any issues:
1. Check browser console for error messages
2. Verify `TELEGRAM_BOT_TOKEN` is set correctly on backend
3. Ensure you're testing in actual Telegram (not browser) for production
4. Check that initData is not older than 24 hours

For more details, see:
- [Authentication API Documentation](./api/authentication.md)
- [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps)
