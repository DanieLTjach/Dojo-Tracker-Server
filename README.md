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

3. Set up environment variables:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   DB_PATH=./db/data/data.db
   JWT_SECRET=your-secret-key-here-change-in-production
   JWT_EXPIRES_IN=24h
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   ```

   **Important:** Change `JWT_SECRET` to a strong, random string in production.

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

All endpoints are prefixed with `/api` and require JWT authentication (except `/api/auth/login`).

For detailed API documentation with curl examples, see:
- **[Authentication](docs/api/authentication.md)** - JWT authentication and login
- **[User Endpoints](docs/api/users.md)** - Complete documentation for `/api/users`
- **[Game Endpoints](docs/api/games.md)** - Complete documentation for `/api/games`

### Authentication

The API uses JWT (JSON Web Token) authentication. To access protected endpoints:

1. **Login** via `/api/auth/login` with your Telegram credentials
2. **Receive** a JWT token in the response
3. **Include** the token in subsequent requests using the `Authorization` header:
   ```bash
   Authorization: Bearer <your-jwt-token>
   ```

**Quick Example:**
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"telegramId": 123456789, "telegramUsername": "@johndoe"}'

# Use the returned token for authenticated requests
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer <token-from-login>"
```

See the [Authentication documentation](docs/api/authentication.md) for complete details.

### Auth (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Login with Telegram (auto-registers new users) | No |

### Users (`/api/users`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Register a new user | Yes (Admin) |
| `POST` | `/without-telegram` | Register a new user without Telegram | Yes (Admin) |
| `GET` | `/` | Get all users | Yes |
| `GET` | `/:id` | Get user by ID | Yes |
| `GET` | `/by-telegram-id/:telegramId` | Get user by Telegram ID | Yes |
| `PATCH` | `/:id` | Edit user details | Yes (Admin or Self) |
| `POST` | `/:id/activate` | Activate a user | Yes (Admin) |
| `POST` | `/:id/deactivate` | Deactivate a user | Yes (Admin) |

### Games (`/api/games`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Add a new game record | Yes |
| `GET` | `/` | Get list of games (supports filtering) | Yes |
| `GET` | `/:gameId` | Get game details by ID | Yes |
| `PUT` | `/:gameId` | Update a game record | Yes (Admin) |
| `DELETE` | `/:gameId` | Delete a game record | Yes (Admin) |

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
