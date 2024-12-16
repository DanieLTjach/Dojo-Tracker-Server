const users_db = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { use } = require('./authRoutes');

exports.register = async (req, res) => {
    const { username, email, password } = req.body;
    console.log(username, email, password, req.body)

    try {
        const existingUser = await isUserExistbyEmail(email);
        
        if(existingUser > 0){
            return res.status(400).json({ message: "Користувач з таким email вже існує"});
        }
        else{
        const password_hash = await bcrypt.hash(password, 10)
        const user_id = await registerUser(username, email, password_hash);

        //const token = jwt.sign({id: user_id}, process.env.JWT_SECRET, { expiresIn: "7d"});

        res.status(201).json({message: "Користвач зареєстрований."})
        }
    }
    catch(error){
        res.status(500).json({ message: "Помилка серверу"})
        console.log(error);
    }
}

// functions
async function registerUser(username, email, password_hash) {
    return new Promise((resolve, reject) => {
        let user_id = generateRandomId();
        while(isUserExistbyID(user_id) > 0){
            user_id = generateRandomId();
        }
        users_db.run(`INSERT INTO Users (user_id, name, password_hash, email) VALUES (${user_id}, "${username}", "${password_hash}", "${email}")`);
            resolve(user_id);
            return
    })    
}

function generateRandomId() {
    const numbers = '0123456789';
    let id = '';

    for (let i = 0; i < 4; i++) {
        id += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    return id;
  }

  async function isUserExistbyID(user_id){
    return new Promise((resolve, reject) =>{
        users_db.all(`SELECT COUNT(*) AS exist FROM Users WHERE user_id = ${user_id}`, async (err, row) =>{
            if(err){
                reject(err);
                return;
            }
            resolve(row.exist);
            return;
        })
    })
}

async function isUserExistbyEmail(email){
    return new Promise((resolve, reject) =>{
        users_db.all(`SELECT COUNT(*) AS exist FROM Users WHERE email = "${email}"`, async (err, row) =>{
            if(err){
                reject(err);
                return;
            }
            resolve(row[0].exist);
            return;
        })
    })
}
