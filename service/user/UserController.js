const { use } = require('./UserRoutes');
const DatabaseManager = require('../db/dbManager');
const status = require('../../config/config').STATUS;
const db = new DatabaseManager();

exports.register = async (req, res) => {
    const { user_name, user_telegram, user_telegram_id } = req.body;
    try {
        let result = db.registration(user_name, user_telegram, user_telegram_id, user_telegram_id);
        if(result === true){
            return res.status(status.OK).json({ message: "Користувач з таким telegram вже існує."});
        }
        else{
            return res.status(status.ERROR).json({ message: "Користвач зареєстрований."})
        }
    }
    catch(error){
        console.log(error);
        return res.status(status.SERVER_ERROR).json({ message: "Помилка серверу"})
    }
}

exports.edit = async (req, res) => {
    const { user_id, updateField, updateInfo, modified_by } = req.body;

    try {
        let result = db.edit_user(user_id, updateField, updateInfo, modified_by);
        if(result = true){
            return res.status(status.OK).json({message: "Користувача змінено"});
        }
        else{
            return res.status(201).json({ message: "Помилка"});
        }
    } catch (error) {
        console.error(error);
        return res.status(status.SERVER_ERROR).json({ message: "Помилка серверу" });
    }
};

exports.remove_user = async (req, res) => {
    const { user_id, modified_by } = req.body;

    try {
        let result = db.remove_user(user_id, modified_by);
        if(result = true){
            return res.status(status.OK).json({message: "Користувача видалено"});
        }
        else{
            return res.status(status.ERROR).json({ message: "Помилка"});
        }
    } catch (error) {
        console.error(error);
        return res.status(status.SERVER_ERROR).json({ message: "Помилка серверу" });
    }

}

