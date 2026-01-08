# User Statistics API

## Overview

The User Statistics API provides comprehensive statistical data for players within an event. Statistics are calculated on-demand from game data and rating changes, including placement percentages, points statistics, rating progression, and participation metrics.

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### Get User Event Statistics

Get comprehensive statistics for a specific user in a specific event.

**Endpoint:** `GET /api/events/:eventId/users/:userId/stats`

**URL Parameters:**

-   `eventId` (integer, required): The ID of the event
-   `userId` (integer, required): The ID of the user

**Response:** `200 OK`

```json
{
    "userId": 1,
    "eventId": 1,
    "place": 1,
    "playerRating": 1035.5,
    "gamesPlayed": 10,
    "averageIncrement": 3.55,
    "averagePlace": 2.1,
    "percentageFirstPlace": 30.0,
    "percentageSecondPlace": 30.0,
    "percentageThirdPlace": 20.0,
    "percentageFourthPlace": 20.0,
    "percentageOfNegativeRank": 15.0,
    "percentageOfGamesPlayedFromAll": 85.5,
    "sumOfPoints": 125000,
    "amountOfRatingEarned": 35.5,
    "maxPoints": 45000,
    "minPoints": -8000,
    "averagePoints": 12500.0
}
```

**Response Fields:**

| Field                             | Type   | Description                                                   |
| --------------------------------- | ------ | ------------------------------------------------------------- |
| `userId`                          | number | The user's ID                                                 |
| `eventId`                         | number | The event ID                                                  |
| `place`                           | number | User's current rank position in the event (1 = highest)       |
| `playerRating`                    | number | User's current rating in the event                            |
| `gamesPlayed`                     | number | Total number of games played in the event                     |
| `averageIncrement`                | number | Average rating change per game                                |
| `averagePlace`                    | number | Average placement across all games (1.0 - 4.0)                |
| `percentageFirstPlace`            | number | Percentage of games finishing in 1st place                    |
| `percentageSecondPlace`           | number | Percentage of games finishing in 2nd place                    |
| `percentageThirdPlace`            | number | Percentage of games finishing in 3rd place                    |
| `percentageFourthPlace`           | number | Percentage of games finishing in 4th place                    |
| `percentageOfNegativeRank`        | number | Percentage of games with negative points                      |
| `percentageOfGamesPlayedFromAll`  | number | Percentage of total event games participated in               |
| `sumOfPoints`                     | number | Total points accumulated across all games                     |
| `amountOfRatingEarned`            | number | Total rating change since starting the event                  |
| `maxPoints`                       | number | Highest points scored in a single game                        |
| `minPoints`                       | number | Lowest points scored in a single game                         |
| `averagePoints`                   | number | Average points per game                                       |

**Error Responses:**

`400 Bad Request` - Invalid userId or eventId format

```json
{
    "message": "Invalid request data",
    "errorCode": "zodError"
}
```

`401 Unauthorized` - Missing or invalid authentication token

```json
{
    "message": "No authorization header provided",
    "errorCode": "noAuthorizationHeader"
}
```

`404 Not Found` - User not found

```json
{
    "message": "User with id 99999 not found",
    "errorCode": "userNotFoundById"
}
```

`404 Not Found` - Event not found

```json
{
    "message": "Event with id 99999 not found",
    "errorCode": "eventNotFound"
}
```

---

## Use Cases

### Display Player Profile Statistics

Retrieve comprehensive statistics for display on a player's profile page:

```typescript
const response = await fetch(`/api/events/1/users/5/stats`, {
    headers: {
        Authorization: `Bearer ${token}`,
    },
});

const stats = await response.json();

// Display on player profile
console.log(`Games Played: ${stats.gamesPlayed}`);
console.log(`Current Rating: ${stats.playerRating}`);
console.log(`Average Place: ${stats.averagePlace}`);
console.log(`Win Rate: ${stats.percentageFirstPlace}%`);
```

### Compare Player Performance

Compare statistics between multiple players:

```typescript
const player1Stats = await fetch(`/api/events/1/users/5/stats`, {
    headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

const player2Stats = await fetch(`/api/events/1/users/8/stats`, {
    headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

console.log(
    `Player 1 Win Rate: ${player1Stats.percentageFirstPlace}% vs Player 2: ${player2Stats.percentageFirstPlace}%`
);
```

### Check If User Has Played Games

Determine if a user has participated in an event:

```typescript
const stats = await fetch(`/api/events/1/users/5/stats`, {
    headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

if (stats.gamesPlayed === 0) {
    console.log("User hasn't played any games in this event yet");
} else {
    console.log(`User has played ${stats.gamesPlayed} games`);
}
```

### Analyze Player Consistency

Evaluate player performance consistency:

```typescript
const stats = await fetch(`/api/events/1/users/5/stats`, {
    headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

// Calculate placement distribution variance
const placements = [
    stats.percentageFirstPlace,
    stats.percentageSecondPlace,
    stats.percentageThirdPlace,
    stats.percentageFourthPlace,
];

const isConsistent = Math.max(...placements) - Math.min(...placements) < 15;
console.log(`Player is ${isConsistent ? "consistent" : "inconsistent"}`);
```

---

## Statistics Calculation Details

### Placement Percentages

Placement is determined by ranking players' points in each game:

-   1st place: Highest points in the game
-   2nd place: Second highest points
-   3rd place: Third highest points
-   4th place: Lowest points in the game

Percentages are calculated as: `(count of placement / total games played) * 100`

### Rating Statistics

-   **Current Rating**: Latest rating from the user's rating history in the event
-   **Average Increment**: Total rating change divided by games played
-   **Amount Earned**: Difference between current rating and starting rating (from game rules)

### Points Statistics

-   **Sum of Points**: Cumulative points across all games
-   **Max/Min Points**: Highest and lowest points scored in any single game
-   **Average Points**: Mean points per game
-   **Negative Rank %**: Percentage of games where points were negative

### Participation Metrics

-   **Games Played**: Count of games where the user participated
-   **Participation %**: `(user's games / total event games) * 100`
-   **Place**: User's rank based on current rating compared to other participants

---

## Notes

-   All statistics are calculated on-demand from existing game and rating data
-   Percentage fields are rounded to 2 decimal places
-   Numeric rating and point values are rounded to 2 decimal places
-   Users with zero games played will have default/zero values for all statistics
-   Statistics only include games from the specified event
