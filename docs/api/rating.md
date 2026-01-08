# Rating API

The Rating API provides endpoints for tracking and retrieving player rating information across events.

## Overview

The rating system tracks player performance over time using an UMA-based calculation system. Ratings are updated automatically when games are created, and history is maintained for each player per event.

**Features:**

- Current ratings leaderboard for an event
- Rating changes over time periods
- Individual player rating history
- Automatic rating calculation based on game results

## Authentication

All rating endpoints require JWT authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Get All Users Current Rating

Get the current ratings for all users in a specific event.

**Endpoint:** `GET /api/events/:eventId/rating`

**Parameters:**

- `eventId` (path, required): The ID of the event

**Response (200 OK):**

```json
[
    {
        "user": {
            "id": 1,
            "name": "Player1",
            "telegramUsername": "@player1",
            "telegramId": 123456789
        },
        "rating": 1050
    },
    {
        "user": {
            "id": 2,
            "name": "Player2",
            "telegramUsername": "@player2",
            "telegramId": 987654321
        },
        "rating": 1020
    }
]
```

**Notes:**

- Results are sorted by rating (descending)
- Rating values depend on event's game rules and starting rating
- Returns all users who have played at least one game in the event

---

### Get Rating Changes During Period

Get total rating changes for all users during a specific time period.

**Endpoint:** `GET /api/events/:eventId/rating/change`

**Parameters:**

- `eventId` (path, required): The ID of the event
- `dateFrom` (query, required): Start date in ISO 8601 format
- `dateTo` (query, required): End date in ISO 8601 format

**Example Request:**

```http
GET /api/events/1/rating/change?dateFrom=2026-01-01T00:00:00Z&dateTo=2026-01-31T23:59:59Z
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**

```json
[
    {
        "user": {
            "id": 1,
            "name": "Player1",
            "telegramUsername": "@player1",
            "telegramId": 123456789
        },
        "ratingChange": 75
    },
    {
        "user": {
            "id": 2,
            "name": "Player2",
            "telegramUsername": "@player2",
            "telegramId": 987654321
        },
        "ratingChange": -25
    }
]
```

**Notes:**

- Returns sum of all rating changes for each user within the period
- Useful for monthly/weekly rankings or tournaments
- Returns empty array if no games played during period
- Dates must be valid ISO 8601 format

---

### Get User Rating History

Get the complete rating history for a specific user in an event.

**Endpoint:** `GET /api/events/:eventId/users/:userId/rating/history`

**Parameters:**

- `eventId` (path, required): The ID of the event
- `userId` (path, required): The ID of the user

**Response (200 OK):**

```json
[
    {
        "timestamp": "2026-01-15T14:30:00Z",
        "rating": 1000
    },
    {
        "timestamp": "2026-01-15T16:45:00Z",
        "rating": 1025
    },
    {
        "timestamp": "2026-01-16T19:20:00Z",
        "rating": 1050
    }
]
```

**Notes:**

- Results ordered chronologically (oldest first)
- Each entry represents rating after a game
- Returns empty array if user has no games in the event
- Useful for plotting rating progression charts

## Rating Calculation

Ratings are calculated automatically when games are created using the following formula:

```
New Rating = Previous Rating + (Points Diff / 1000) + UMA
```

**Components:**

- **Points Diff**: Player's final points minus starting points (e.g., 30000)
- **UMA**: Placement bonus from game rules (e.g., +15, +5, -5, -15)
- **Starting Rating**: Defined in event's game rules (typically 1000)

**Example:**

- Game rules: Standard yonma (UMA: 15, 5, -5, -15)
- Player finishes 1st with 35000 points
- Starting points: 30000
- Calculation: 1000 + (5000/1000) + 15 = 1020

**Tie Handling:**
Players with identical scores split their UMA values evenly.

## Error Responses

### 400 Bad Request

```json
{
    "message": "Invalid date format"
}
```

### 401 Unauthorized

```json
{
    "message": "Authentication required"
}
```

### 404 Not Found

```json
{
    "message": "Event with id 999 not found"
}
```

## Use Cases

### Leaderboard Display

```typescript
const response = await fetch('/api/events/1/rating', {
    headers: { Authorization: `Bearer ${token}` },
});
const leaderboard = await response.json();
// Display sorted leaderboard
```

### Monthly Tournament Rankings

```typescript
const startOfMonth = new Date('2026-01-01').toISOString();
const endOfMonth = new Date('2026-01-31').toISOString();

const response = await fetch(`/api/events/1/rating/change?dateFrom=${startOfMonth}&dateTo=${endOfMonth}`, {
    headers: { Authorization: `Bearer ${token}` },
});
const monthlyChanges = await response.json();
```

### Player Progress Chart

```typescript
const response = await fetch('/api/events/1/users/5/rating/history', {
    headers: { Authorization: `Bearer ${token}` },
});
const history = await response.json();
// Plot history data on chart
```

## Related Documentation

- [Game API](./games.md) - Creating games triggers rating updates
- [Event API](./events.md) - Events define rating rules
- [Authentication](../telegram-mini-app-auth.md) - JWT token setup
