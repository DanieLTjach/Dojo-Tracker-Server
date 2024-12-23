const { use } = require('./authRoutes');
const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.register = async (req, res) => {
    const { user_name, user_telegram } = req.body;
    try {
        let result = db.registration(user_name, user_telegram, 0);
        if(result === 400){
            return res.status(400).json({ message: "Користувач з таким telegram вже існує."});
        }
        else{
            return res.status(201).json({ message: "Користвач зареєстрований."})
        }
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ message: "Помилка серверу"})
    }
}

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Тут должна быть логика авторизации
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Помилка серверу" });
    }
};

