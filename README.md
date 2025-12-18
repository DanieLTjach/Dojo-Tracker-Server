# Dojo Tracker Server

A backend server for tracking mahjong games and user statistics. Built with Node.js, Express, and SQLite.

## 🚀 Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** SQLite (via `better-sqlite3`)
- **Validation:** Zod
- **Development:** Nodemon, ts-node

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/DanieLTjach/Dojo-Tracker-Server.git
   cd Dojo-Tracker-Server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (optional):
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   DB_PATH=./db/data/data.db
   ```

### Running the Server

- **Development mode (with auto-reload):**
  ```bash
  npm run dev
  ```

- **Production mode:**
  ```bash
  npm start
  ```

## 📡 API Reference

All endpoints are prefixed with `/api`.

### Users (`/api/users`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/` | Register a new user |
| `GET` | `/` | Get all users |
| `GET` | `/:id` | Get user by ID |
| `GET` | `/by-telegram-id/:telegramId` | Get user by Telegram ID |
| `PATCH` | `/:id` | Edit user details |
| `POST` | `/:id/activate` | Activate a user |
| `POST` | `/:id/deactivate` | Deactivate a user |

#### User Creation Example
```json
{
  "name": "John Doe",
  "telegramUsername": "@johndoe",
  "telegramId": 123456789,
  "createdBy": 1
}
```

### Games (`/api/games`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/` | Add a new game record |
| `GET` | `/` | Get list of games (supports filtering) |
| `GET` | `/:gameId` | Get game details by ID |
| `PUT` | `/:gameId` | Update a game record |
| `DELETE` | `/:gameId` | Delete a game record |

#### Game Creation Example
```json
{
  "eventId": 1,
  "playersData": [
    {
      "user": { "telegramUsername": "@player1" },
      "points": 100,
      "startPlace": "NORTH"
    }
  ],
  "createdBy": 1
}
```

#### Game List Filters (Query Params)
- `dateFrom`: ISO Date string
- `dateTo`: ISO Date string
- `userId`: Filter by user ID
- `eventId`: Filter by event ID

## 📂 Project Structure

- `src/routes`: Express route definitions.
- `src/schema`: Zod validation schemas.
- `src/controller`: Request handlers.
- `src/service`: Service layer.
- `src/repository`: Data access layer.
- `src/db`: Database initialization and migration logic.
- `db/migrations`: SQL migration files.
