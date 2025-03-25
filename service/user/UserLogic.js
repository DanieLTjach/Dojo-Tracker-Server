const DatabaseManager = require('../db/dbManager');
const { generateShortUserId } = require('../functions/userIdGenerator')
const db = new DatabaseManager();

exports.registation = async (user_name, user_telegram_nickname, user_telegram_id, modified_by) => {
    try {
        const user_id = generateShortUserId(user_telegram_id);
        console.log("Generated user_id:", user_id);

        const is_user_exist = await db.select_by('user_telegram_id', user_telegram_id);
        console.log("Result select_by:", is_user_exist);

        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: "Database query failed" };
        }

        if (is_user_exist.success === true) {
            console.log("User already exists:", is_user_exist.result);
            return { success: false, result: "User already exists" };
        }

        if (is_user_exist.success === false) {
            const result = await db.register(
                user_id, 
                user_name, 
                user_telegram_nickname, 
                user_telegram_id, 
                modified_by
            );

            if (!result) {
                console.error("Registration failed: No result returned");
                return { success: false, result: "Registration failed" };
            }

            return result;
        }

        return { success: false, result: "Unexpected error" };

    } catch (err) {
        console.error("Error during registration:", err);
        return { 
            success: false, 
            result: err.message || "Server error",
            details: err.toString() 
        }; 
    }
};

exports.edit = async (user_id, column, value, modified_by) => {
    try{
        const is_user_exist = await db.select_by('user_id', user_id);

        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: "Database query failed" };
        }

        if(is_user_exist.success === true){
            const result = await db.user_edit(column, value, user_id, modified_by);
            if (!result) {
                console.error("Editing failed: No result returned");
                return { success: false, result: "Edit failed" };
            }
            return result;
        }

        else{
            console.log("User not exists:", is_user_exist.result);
            return {success: false, result: "User not exists"};
        }
    }
    catch (err) {
        console.error("Error during editing:", err);
        return { 
            success: false, 
            result: err.message || "Server error",
            details: err.toString() 
        }; 
    }
};

exports.remove = async (user_id, modified_by) => {
    try{
        const is_user_exist = await db.select_by('user_id', user_id);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: "Database query failed" };
        }

        if(is_user_exist.success === true){
            const result = await db.remove_user(user_id, modified_by);
            if (!result) {
                console.error("Remove failed: No result returned");
                return { success: false, result: "Remove failed" };
            }
            return result;
        }
        
        else{
            return {success: false, result: "User not exists"};
        }
    }
    catch (err) {
        console.error("Error during remoding:", err);
        return { 
            success: false, 
            result: err.message || "Server error",
            details: err.toString() 
        }; 
    }
}

exports.activate_user = async (user_id, modified_by) => {
    try{
        const is_user_exist = await db.select_by('user_id', user_id);
        if (!is_user_exist) {
            console.error("Error: db.select_by() returned null or undefined");
            return { success: false, result: "Database query failed" };
        }

        if(is_user_exist.success === true){
            const result = await db.user_edit('is_active', 1, user_id, modified_by);
            if (!result) {
                console.error("Activation failed: No result returned");
                return { success: false, result: "Activation failed" };
            }
            return result;
        }
        
        else{
            return {success: false, result: "User not exists"};
        }
    }
    catch (err) {
        console.error("Error during activation:", err);
        return { 
            success: false, 
            result: err.message || "Server error",
            details: err.toString() 
        }; 
    }
}