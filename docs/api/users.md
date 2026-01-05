# User API Endpoints

Base URL: `http://localhost:3000/api/users`

All endpoints use JSON format for request and response bodies.

## Table of Contents

- [Register User](#register-user)
- [Register User Without Telegram](#register-user-without-telegram)
- [Get All Users](#get-all-users)
- [Get User by ID](#get-user-by-id)
- [Get User by Telegram ID](#get-user-by-telegram-id)
- [Edit User](#edit-user)
- [Activate User](#activate-user)
- [Deactivate User](#deactivate-user)
- [Error Responses](#error-responses)

---

## Register User

Register a new user with Telegram information.

**Endpoint:** `POST /api/users`

**Request Body:**
- `name` (string, required): User's name (cannot be empty)
- `telegramUsername` (string, required): Telegram username (must start with '@')
- `telegramId` (number, required): Telegram user ID (integer)
- `createdBy` (number, optional): ID of the user creating this user (defaults to system user 0)

**Success Response:** `201 Created`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "telegramUsername": "@johndoe",
    "telegramId": 123456789,
    "createdBy": 0
  }'
```

**Example Response:**

```json
{
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
```

**Validation Errors:**
- `400 Bad Request` - If name is empty
- `400 Bad Request` - If telegramUsername doesn't start with '@'
- `400 Bad Request` - If telegramId is not an integer

**Business Logic Errors:**
- `403 Forbidden` - If createdBy user is not an admin
- `409 Conflict` - If user with this name already exists
- `409 Conflict` - If user with this telegram ID already exists
- `409 Conflict` - If user with this telegram username already exists

---

## Register User Without Telegram

Register a new user without Telegram information.

**Endpoint:** `POST /api/users/without-telegram`

**Request Body:**
- `name` (string, required): User's name (cannot be empty)
- `createdBy` (number, required): ID of the user creating this user

**Success Response:** `201 Created`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/users/without-telegram \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "createdBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 2,
  "name": "Jane Smith",
  "telegramUsername": null,
  "telegramId": null,
  "isAdmin": 0,
  "isActive": 1,
  "createdAt": "2024-01-15T10:35:00.000Z",
  "modifiedAt": "2024-01-15T10:35:00.000Z",
  "modifiedBy": "SYSTEM"
}
```

**Errors:**
- `400 Bad Request` - If name is empty
- `403 Forbidden` - If createdBy user is not an admin
- `409 Conflict` - If user with this name already exists

---

## Get All Users

Retrieve all users in the system.

**Endpoint:** `GET /api/users`

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X GET http://localhost:3000/api/users
```

**Example Response:**

```json
[
  {
    "id": 0,
    "name": "SYSTEM",
    "telegramUsername": null,
    "telegramId": null,
    "isAdmin": 1,
    "isActive": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "modifiedAt": "2024-01-01T00:00:00.000Z",
    "modifiedBy": "SYSTEM"
  },
  {
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
]
```

---

## Get User by ID

Retrieve a specific user by their ID.

**Endpoint:** `GET /api/users/:id`

**URL Parameters:**
- `id` (number, required): User ID (integer)

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X GET http://localhost:3000/api/users/1
```

**Example Response:**

```json
{
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
```

**Errors:**
- `400 Bad Request` - If ID is not an integer
- `404 Not Found` - If user with this ID does not exist

---

## Get User by Telegram ID

Retrieve a specific user by their Telegram ID.

**Endpoint:** `GET /api/users/by-telegram-id/:telegramId`

**URL Parameters:**
- `telegramId` (number, required): Telegram user ID (integer)

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X GET http://localhost:3000/api/users/by-telegram-id/123456789
```

**Example Response:**

```json
{
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
```

**Errors:**
- `400 Bad Request` - If telegramId is not an integer
- `404 Not Found` - If user with this Telegram ID does not exist

---

## Edit User

Update user information (name and/or Telegram username).

**Endpoint:** `PATCH /api/users/:id`

**URL Parameters:**
- `id` (number, required): User ID to edit (integer)

**Request Body:**
- `name` (string, optional): New name for the user
- `telegramUsername` (string, optional): New Telegram username (must start with '@')
- `modifiedBy` (number, required): ID of the user making the modification

**Note:** At least one of `name` or `telegramUsername` must be provided.

**Authorization:**
- Users can edit their own information (when `id` matches `modifiedBy`)
- Admins can edit any user's information

**Success Response:** `200 OK`

**Example Request (Edit Name):**

```bash
curl -X PATCH http://localhost:3000/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "modifiedBy": 0
  }'
```

**Example Request (Edit Telegram Username):**

```bash
curl -X PATCH http://localhost:3000/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "telegramUsername": "@johnsmith",
    "modifiedBy": 0
  }'
```

**Example Request (Edit Both):**

```bash
curl -X PATCH http://localhost:3000/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "telegramUsername": "@johnsmith",
    "modifiedBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "name": "John Smith",
  "telegramUsername": "@johnsmith",
  "telegramId": 123456789,
  "isAdmin": 0,
  "isActive": 1,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "modifiedAt": "2024-01-15T11:00:00.000Z",
  "modifiedBy": "SYSTEM"
}
```

**Errors:**
- `400 Bad Request` - If neither name nor telegramUsername is provided
- `400 Bad Request` - If telegramUsername doesn't start with '@'
- `403 Forbidden` - If modifiedBy user is not an admin and doesn't match the user being edited
- `403 Forbidden` - If the user being edited is not active
- `404 Not Found` - If user with this ID does not exist

---

## Activate User

Activate a deactivated user.

**Endpoint:** `POST /api/users/:id/activate`

**URL Parameters:**
- `id` (number, required): User ID to activate (integer)

**Request Body:**
- `modifiedBy` (number, required): ID of the user performing the activation (must be an admin)

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/users/1/activate \
  -H "Content-Type: application/json" \
  -d '{
    "modifiedBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "name": "John Doe",
  "telegramUsername": "@johndoe",
  "telegramId": 123456789,
  "isAdmin": 0,
  "isActive": 1,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "modifiedAt": "2024-01-15T12:00:00.000Z",
  "modifiedBy": "SYSTEM"
}
```

**Errors:**
- `400 Bad Request` - If ID is not an integer
- `403 Forbidden` - If modifiedBy user is not an admin
- `404 Not Found` - If user with this ID does not exist

---

## Deactivate User

Deactivate an active user.

**Endpoint:** `POST /api/users/:id/deactivate`

**URL Parameters:**
- `id` (number, required): User ID to deactivate (integer)

**Request Body:**
- `modifiedBy` (number, required): ID of the user performing the deactivation (must be an admin)

**Success Response:** `200 OK`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/users/1/deactivate \
  -H "Content-Type: application/json" \
  -d '{
    "modifiedBy": 0
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "name": "John Doe",
  "telegramUsername": "@johndoe",
  "telegramId": 123456789,
  "isAdmin": 0,
  "isActive": 0,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "modifiedAt": "2024-01-15T12:30:00.000Z",
  "modifiedBy": "SYSTEM"
}
```

**Errors:**
- `400 Bad Request` - If ID is not an integer
- `403 Forbidden` - If modifiedBy user is not an admin
- `404 Not Found` - If user with this ID does not exist

---

## Error Responses

All endpoints may return the following standard error responses:

### 400 Bad Request

Returned when request validation fails.

```json
{
  "error": "Validation error message"
}
```

### 403 Forbidden

Returned when the user doesn't have permission to perform the action.

```json
{
  "error": "User with id {id} is not admin"
}
```

### 404 Not Found

Returned when a requested resource doesn't exist.

```json
{
  "error": "User with id {id} not found"
}
```

### 409 Conflict

Returned when trying to create a duplicate resource.

```json
{
  "error": "User with this name already exists: {name}"
}
```

### 500 Internal Server Error

Returned for unexpected server errors.

```json
{
  "error": "Internal server error message"
}
```

---

## Notes

1. **Boolean Values**: The API returns `1` for `true` and `0` for `false` for boolean fields (`isAdmin`, `isActive`) due to SQLite storage format.

2. **System User**: User ID `0` is the default system administrator account with username "SYSTEM". This user is used for initial data creation and administrative tasks.

3. **Timestamps**: All timestamps are in ISO 8601 format (UTC).

4. **Authorization**: Most modification endpoints require the requesting user to be an admin, except when users are editing their own information.

5. **Active Users**: Only active users can perform actions. Attempting to use an inactive user's ID will result in a 403 error.
