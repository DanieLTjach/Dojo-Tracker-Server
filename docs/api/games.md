# Game API Endpoints

Base URL: `http://localhost:3000/api/games`

All endpoints use JSON format for request and response bodies.

## Table of Contents

- [Create Game](#create-game)
- [Get Games (with Filters)](#get-games-with-filters)
- [Get Game by ID](#get-game-by-id)
- [Update Game](#update-game)
- [Delete Game](#delete-game)
- [Error Responses](#error-responses)

---

## Create Game

Create a new Mahjong game record with player scores.

**Endpoint:** `POST /api/games`

**Request Body:**
- `eventId` (number, required): ID of the event this game belongs to (integer)
- `playersData` (array, required): Array of exactly 4 player objects
  - `userId` (number, required): User ID of the player (integer)
  - `points` (number, required): Final points for this player (integer)
  - `startPlace` (string, optional): Starting position - one of: 'EAST', 'SOUTH', 'WEST', 'NORTH'
- `createdBy` (number, required): ID of the user creating this game (integer)

**Validation Rules:**
- Exactly 4 players are required
- No duplicate players (same userId cannot appear twice)
- If startPlace is provided, each player must have a unique startPlace
- All players must be active users
- The event must exist

**Success Response:** `201 Created`

**Example Request (with start places):**

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 1,
    "playersData": [
      { "userId": 1, "points": 35000, "startPlace": "EAST" },
      { "userId": 2, "points": 28000, "startPlace": "SOUTH" },
      { "userId": 3, "points": 22000, "startPlace": "WEST" },
      { "userId": 4, "points": 15000, "startPlace": "NORTH" }
    ],
    "createdBy": 0
  }'
```

**Example Request (without start places):**

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 1,
    "playersData": [
      { "userId": 1, "points": 32000 },
      { "userId": 2, "points": 30000 },
      { "userId": 3, "points": 26000 },
      { "userId": 4, "points": 12000 }
    ],
    "createdBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "eventId": 1,
  "createdAt": "2024-01-15T14:30:00.000Z",
  "modifiedAt": "2024-01-15T14:30:00.000Z",
  "modifiedBy": 0,
  "players": [
    {
      "gameId": 1,
      "userId": 1,
      "name": "John Doe",
      "telegramUsername": "@johndoe",
      "points": 35000,
      "startPlace": "EAST"
    },
    {
      "gameId": 1,
      "userId": 2,
      "name": "Jane Smith",
      "telegramUsername": "@janesmith",
      "points": 28000,
      "startPlace": "SOUTH"
    },
    {
      "gameId": 1,
      "userId": 3,
      "name": "Bob Wilson",
      "telegramUsername": "@bobwilson",
      "points": 22000,
      "startPlace": "WEST"
    },
    {
      "gameId": 1,
      "userId": 4,
      "name": "Alice Brown",
      "telegramUsername": "@alicebrown",
      "points": 15000,
      "startPlace": "NORTH"
    }
  ]
}
```

**Validation Errors:**
- `400 Bad Request` - If not exactly 4 players: "4 players are required for a game"
- `400 Bad Request` - If duplicate players: "Player with ID {userId} is present more than once in this game"
- `400 Bad Request` - If duplicate start places: "Each player must have a unique start place"
- `400 Bad Request` - If invalid startPlace value (not EAST/SOUTH/WEST/NORTH)
- `400 Bad Request` - If points is not an integer

**Business Logic Errors:**
- `403 Forbidden` - If createdBy user is not active
- `404 Not Found` - If event with eventId does not exist
- `404 Not Found` - If any player userId does not exist

---

## Get Games (with Filters)

Retrieve a list of games, optionally filtered by various criteria.

**Endpoint:** `GET /api/games`

**Query Parameters (all optional):**
- `eventId` (number): Filter games by event ID
- `userId` (number): Filter games where this user participated
- `dateFrom` (date): Filter games created on or after this date (ISO 8601 format)
- `dateTo` (date): Filter games created on or before this date (ISO 8601 format)

**Success Response:** `200 OK`

**Example Request (no filters - get all games):**

```bash
curl -X GET http://localhost:3000/api/games
```

**Example Request (filter by event):**

```bash
curl -X GET "http://localhost:3000/api/games?eventId=1"
```

**Example Request (filter by user):**

```bash
curl -X GET "http://localhost:3000/api/games?userId=1"
```

**Example Request (filter by date range):**

```bash
curl -X GET "http://localhost:3000/api/games?dateFrom=2024-01-01T00:00:00.000Z&dateTo=2024-12-31T23:59:59.999Z"
```

**Example Request (multiple filters):**

```bash
curl -X GET "http://localhost:3000/api/games?eventId=1&userId=1&dateFrom=2024-01-01T00:00:00.000Z"
```

**Example Response:**

```json
[
  {
    "id": 1,
    "eventId": 1,
    "createdAt": "2024-01-15T14:30:00.000Z",
    "modifiedAt": "2024-01-15T14:30:00.000Z",
    "modifiedBy": 0,
    "players": [
      {
        "gameId": 1,
        "userId": 1,
        "name": "John Doe",
        "telegramUsername": "@johndoe",
        "points": 35000,
        "startPlace": "EAST"
      },
      {
        "gameId": 1,
        "userId": 2,
        "name": "Jane Smith",
        "telegramUsername": "@janesmith",
        "points": 28000,
        "startPlace": "SOUTH"
      },
      {
        "gameId": 1,
        "userId": 3,
        "name": "Bob Wilson",
        "telegramUsername": "@bobwilson",
        "points": 22000,
        "startPlace": "WEST"
      },
      {
        "gameId": 1,
        "userId": 4,
        "name": "Alice Brown",
        "telegramUsername": "@alicebrown",
        "points": 15000,
        "startPlace": "NORTH"
      }
    ]
  },
  {
    "id": 2,
    "eventId": 1,
    "createdAt": "2024-01-15T15:45:00.000Z",
    "modifiedAt": "2024-01-15T15:45:00.000Z",
    "modifiedBy": 0,
    "players": [
      // ... player data
    ]
  }
]
```

**Errors:**
- `400 Bad Request` - If too many games found (>100): "Too many games found. Please narrow down your search criteria."
- `400 Bad Request` - If invalid date format: "Invalid date format"
- `404 Not Found` - If userId filter references non-existent user
- `404 Not Found` - If eventId filter references non-existent event

---

## Get Game by ID

Retrieve detailed information about a specific game.

**Endpoint:** `GET /api/games/:gameId`

**URL Parameters:**
- `gameId` (number, required): Game ID (integer)

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X GET http://localhost:3000/api/games/1
```

**Example Response:**

```json
{
  "id": 1,
  "eventId": 1,
  "createdAt": "2024-01-15T14:30:00.000Z",
  "modifiedAt": "2024-01-15T14:30:00.000Z",
  "modifiedBy": 0,
  "players": [
    {
      "gameId": 1,
      "userId": 1,
      "name": "John Doe",
      "telegramUsername": "@johndoe",
      "points": 35000,
      "startPlace": "EAST"
    },
    {
      "gameId": 1,
      "userId": 2,
      "name": "Jane Smith",
      "telegramUsername": "@janesmith",
      "points": 28000,
      "startPlace": "SOUTH"
    },
    {
      "gameId": 1,
      "userId": 3,
      "name": "Bob Wilson",
      "telegramUsername": "@bobwilson",
      "points": 22000,
      "startPlace": "WEST"
    },
    {
      "gameId": 1,
      "userId": 4,
      "name": "Alice Brown",
      "telegramUsername": "@alicebrown",
      "points": 15000,
      "startPlace": "NORTH"
    }
  ]
}
```

**Errors:**
- `400 Bad Request` - If gameId is not an integer
- `404 Not Found` - If game with this ID does not exist

---

## Update Game

Update an existing game's event or player data. Only admins can update games.

**Endpoint:** `PUT /api/games/:gameId`

**URL Parameters:**
- `gameId` (number, required): Game ID to update (integer)

**Request Body:**
- `eventId` (number, required): New event ID (integer)
- `playersData` (array, required): Array of exactly 4 player objects (same format as create)
- `modifiedBy` (number, required): ID of the user making the modification (must be admin)

**Authorization:** Requires admin privileges

**Success Response:** `200 OK`

**Example Request (update player scores):**

```bash
curl -X PUT http://localhost:3000/api/games/1 \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 1,
    "playersData": [
      { "userId": 1, "points": 40000, "startPlace": "EAST" },
      { "userId": 2, "points": 30000, "startPlace": "SOUTH" },
      { "userId": 3, "points": 20000, "startPlace": "WEST" },
      { "userId": 4, "points": 10000, "startPlace": "NORTH" }
    ],
    "modifiedBy": 0
  }'
```

**Example Request (change players):**

```bash
curl -X PUT http://localhost:3000/api/games/1 \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 1,
    "playersData": [
      { "userId": 5, "points": 35000, "startPlace": "EAST" },
      { "userId": 6, "points": 28000, "startPlace": "SOUTH" },
      { "userId": 7, "points": 22000, "startPlace": "WEST" },
      { "userId": 8, "points": 15000, "startPlace": "NORTH" }
    ],
    "modifiedBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "eventId": 1,
  "createdAt": "2024-01-15T14:30:00.000Z",
  "modifiedAt": "2024-01-15T16:00:00.000Z",
  "modifiedBy": 0,
  "players": [
    {
      "gameId": 1,
      "userId": 1,
      "name": "John Doe",
      "telegramUsername": "@johndoe",
      "points": 40000,
      "startPlace": "EAST"
    },
    {
      "gameId": 1,
      "userId": 2,
      "name": "Jane Smith",
      "telegramUsername": "@janesmith",
      "points": 30000,
      "startPlace": "SOUTH"
    },
    {
      "gameId": 1,
      "userId": 3,
      "name": "Bob Wilson",
      "telegramUsername": "@bobwilson",
      "points": 20000,
      "startPlace": "WEST"
    },
    {
      "gameId": 1,
      "userId": 4,
      "name": "Alice Brown",
      "telegramUsername": "@alicebrown",
      "points": 10000,
      "startPlace": "NORTH"
    }
  ]
}
```

**Validation Errors:**
- `400 Bad Request` - If not exactly 4 players
- `400 Bad Request` - If duplicate players
- `400 Bad Request` - If duplicate start places
- `400 Bad Request` - If invalid gameId (non-integer)

**Business Logic Errors:**
- `403 Forbidden` - If modifiedBy user is not an admin: "User with id {id} is not admin"
- `404 Not Found` - If game does not exist
- `404 Not Found` - If event does not exist
- `404 Not Found` - If any player does not exist

---

## Delete Game

Delete a game record. Only admins can delete games.

**Endpoint:** `DELETE /api/games/:gameId`

**URL Parameters:**
- `gameId` (number, required): Game ID to delete (integer)

**Request Body:**
- `deletedBy` (number, required): ID of the user performing the deletion (must be admin)

**Authorization:** Requires admin privileges

**Success Response:** `204 No Content`

**Example Request:**

```bash
curl -X DELETE http://localhost:3000/api/games/1 \
  -H "Content-Type: application/json" \
  -d '{
    "deletedBy": 0
  }'
```

**Example Response:**

```
(Empty response with 204 status code)
```

**Errors:**
- `400 Bad Request` - If gameId is not an integer
- `403 Forbidden` - If deletedBy user is not an admin
- `404 Not Found` - If game with this ID does not exist

---

## Error Responses

All endpoints may return the following standard error responses:

### 400 Bad Request

Returned when request validation fails (Zod validation errors).

```json
{
  "error": "Invalid request data",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["body", "eventId"],
      "message": "Expected number, received string"
    }
  ]
}
```

### 403 Forbidden

Returned when the user doesn't have permission to perform the action.

```json
{
  "errorCode": "userIsNotAdmin",
  "message": "User with id {id} is not admin"
}
```

### 404 Not Found

Returned when a requested resource doesn't exist.

```json
{
  "errorCode": "gameNotFoundById",
  "message": "Game with id {id} not found"
}
```

```json
{
  "errorCode": "eventNotFoundById",
  "message": "Event with id {id} not found"
}
```

### 500 Internal Server Error

Returned for unexpected server errors.

```json
{
  "message": "Internal server error message"
}
```

---

## Notes

1. **Player Count**: Currently, all games require exactly 4 players (standard yonma mahjong). This is validated on both creation and update.

2. **Start Places**: The valid start places are:
   - `EAST` (東 - ton)
   - `SOUTH` (南 - nan)
   - `WEST` (西 - sha)
   - `NORTH` (北 - pei)

   Start places are optional but if provided, each player must have a unique position.

3. **Points**: Player points must be integers. The API does not validate that points sum to zero or match game rules - this is the responsibility of the client.

4. **Admin Operations**: Creating games requires an active user, but updating and deleting games requires admin privileges. The system admin (ID: 0) can be used for these operations.

5. **Game Updates**: When updating a game, all player data is replaced. You must provide the complete new player list, not just changes.

6. **Timestamps**: All timestamps are in ISO 8601 format (UTC).

7. **Player Information**: The response includes full player information (name, telegramUsername) joined from the user table for convenience.

8. **Filter Limit**: The GET /api/games endpoint returns a maximum of 100 games. If your filters would return more, you'll receive an error asking you to narrow your search criteria.

9. **Event Reference**: All games must be associated with an existing event. Event ID 1 ("Test Event") is created by default in the migrations.
