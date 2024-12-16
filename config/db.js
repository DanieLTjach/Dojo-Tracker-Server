const sqlite3 = require('sqlite3').verbose();
const users_db = new sqlite3.Database('./storage/users.db');

users_db.serialize(function (){
    users_db.run(`
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_activated BOOL DEFAULT false 
        )
        `)
})

module.exports = users_db;