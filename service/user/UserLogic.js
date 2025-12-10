const errors = require('../../config/messages');
const { generateShortUserId } = require('../functions/userIdGenerator')
const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.registration = async (user_name, user_telegram_nickname, user_telegram_id = null, user_id, modified_by) => {
    try {
        if(user_id === null || user_id === undefined || user_id === '') {
            user_id = generateShortUserId(user_telegram_id);
            console.log("Generated user_id:", user_id);
        }

        const userCheck = await db.custom_select(`select id from user where (? is not null and id = ?) or (? is not null and telegram_id = ?);`, [user_id, user_id, user_telegram_id, user_telegram_id]);
        console.log("User check result:", userCheck);

        if (userCheck.success === true) {
            console.error("User already exists:", userCheck.result);
            return { success: false, result: errors.UserExists };
        }

        if(userCheck.success === false) {
            const result = await db.register(
                user_id, 
                user_name, 
                user_telegram_nickname, 
                user_telegram_id, 
                modified_by
            );

            if (!result) {
                console.error("Registration failed: No result returned");
                return { success: false, result: errors.RegisterFailed };
            }

            return result;
        }

        return { success: false, result: errors.UnexpectedError };

    } catch (err) {
        console.error("Error during registration:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.edit = async (user_telegram_id, column, value, modified_by) => {
    try{
        const is_user_exist = await db.user_select_by('telegram_id', user_telegram_id);

        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: errors.DatabaseError };
        }

        if(is_user_exist.success === true){
            const result = await db.user_edit(column, value, user_telegram_id, modified_by);
            if (!result) {
                console.error("Editing failed: No result returned");
                return { success: false, result: errors.EditFailed };
            }
            return result;
        }

        else{
            console.error("User not exists:", is_user_exist.result);
            return {success: false, result: errors.UserNotExists};
        }
    }
    catch (err) {
        console.error("Error during editing:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.remove = async (user_id, modified_by) => {
    try{
        const is_user_exist = await db.user_select_by('id', user_id);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: errors.DatabaseError };
        }

        if(is_user_exist.success === true){
            const result = await db.remove_user(user_id, modified_by);
            if (!result) {
                console.error("Remove failed: No result returned");
                return { success: false, result: errors.RemoveFailed };
            }
            return result;
        }
        
        else{
            return {success: false, result: errors.UserNotExists};
        }
    }
    catch (err) {
        console.error("Error during remoding:", err);
        return { 
            success: false, 
            result: err.message ,
            details: err.toString() 
        }; 
    }
}

exports.activate_user = async (user_id, modified_by) => {
    try{
        const is_user_exist = await db.user_select_by('id', user_id);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: errors.DatabaseError };
        }

        if(is_user_exist.success === true){
            const result = await db.user_edit('is_active', 1, user_id, modified_by);
            if (!result) {
                console.error("Activation failed: No result returned");
                return { success: false, result: errors.ActivateFailed };
            }
            return result;
        }
        
        else{
            return {success: false, result: errors.UserNotExists};
        }
    }
    catch (err) {
        console.error("Error during activation:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
}

exports.get_user = async (user_telegram_id) => {
    try{
        const is_user_exist = await db.user_select_by('telegram_id', user_telegram_id);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: errors.DatabaseError };
        }

        if(is_user_exist.success === true){
            return is_user_exist;
        }
        
        else{
            return {success: false, result: errors.UserNotExists};
        }
    }
    catch (err) {
        console.error("Error during getting user:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
}

exports.get_by = async(column, value) => {
   try{
        const is_user_exist = await db.user_select_by(column, value);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: errors.DatabaseError };
        }

        if(is_user_exist.success === true){
            return is_user_exist;
        }
        
        else{
            return {success: false, result: errors.UserNotExists};
        }
    }
    catch (err) {
        console.error("Error during getting user:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
}