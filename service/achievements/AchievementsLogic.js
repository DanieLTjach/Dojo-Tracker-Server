const errors = require('../../config/messages');
const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.new_Achievement = async(name, description, modified_by) =>{
    try {
        const result = await db.add_achievement(name, description, modified_by);
        if (result.success === true) {
            return { success: true, result: "Achievement created successfully" };
        }
        return { success: false, result: result.result || "Failed to create achievement" };
    } catch (err) {
        console.error("Error during creating achievement:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.grant_Achievement = async(user_id, achievement_id, modified_by) =>{
    try{
        const result = await db.grant_achievement(user_id, achievement_id, modified_by);
        if (result.success === true) {
            return { success: true, result: "Achievement granted successfully" };
        }
        return { success: false, result: result.result || "Failed to grant achievement" };
    }
    catch (err) {
        console.error("Error during granting achievement:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.list_Achievements = async () => {
    try {
        const result = await db.list_achievements();
        if (result.success === true) {
            return { success: true, result: result.result };
        }
        return { success: false, result: result.result || "Failed to list achievements" };
    } catch (err) {
        console.error("Error during listing achievements:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.user_achievements = async (user_id) => {
    try {
        const result = await db.user_achievements(user_id);
        if (result.success === true) {
            return { success: true, result: result.result };
        }
        return { success: false, result: result.result || "Failed to get user achievements" };
    } catch (err) {
        console.error("Error during getting user achievements:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }

};