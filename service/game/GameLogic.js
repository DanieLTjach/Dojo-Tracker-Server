const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.addGame = async (game_type, players_data, modified_by, created_at, club_id) => {
    try{
        for (const player of players_data) {
            if (!player.user_id || !player.points || player.start_place == null) {
                console.error("Invalid player data:", player);
                return { success: false, result: "Invalid player data" };
            }
            const is_user_exist = await db.player_select_by('user_id', player.user_id);
            if (!is_user_exist || is_user_exist.success === false) {
                console.error("User does not exist:", player.user_id);
                return { success: false, result: "User does not exist" };
            }
        }

        const result = await db.add_game(game_type, players_data, modified_by, created_at, club_id);
        if (result.success === true) {
            return { success: true, result: "Game added successfully" };
        }
        return { success: false, result: result.result || "Failed to add game" };
    }
    catch (err) {
        console.error("Error during adding game:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.editGame = async () => {

};

exports.removeGame = async (game_id, modified_by) => {
    try{
        const result = await db.remove_game(game_id, modified_by);
        if (result.success === true) {
            return { success: true, result: "Game removed successfully" };
        }
        return { success: false, result: result.result || "Failed to remove game" };
    }
    catch (err) {
        console.error("Error during removing game:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.listGames = async (game_type, date_from, date_to, user_id) => {
    try {
        const result = await db.list_games(game_type, date_from, date_to, user_id);
        if (result.success === true) {
            return { success: true, result: result.result };
        }
        return { success: false, result: result.result || "Failed to list games" };
    } catch (err) {
        console.error("Error during listing games:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};

exports.getGame = async (game_id) => {
    try {
        const result = await db.get_game(game_id);
        if (result.success === true) {
            return { success: true, result: result.result };
        }
        return { success: false, result: result.result || "Failed to get game" };
    } catch (err) {
        console.error("Error during getting game:", err);
        return { 
            success: false, 
            result: err.message,
            details: err.toString() 
        }; 
    }
};