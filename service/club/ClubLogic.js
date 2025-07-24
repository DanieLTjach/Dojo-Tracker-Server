const errors = require('../../config/messages');
const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.addClub = async (club_name, modified_by) => {
    try {
        if (!club_name || modified_by === null) {
            return { success: false, result: errors.EmptyFields };
        }

        const clubCheck = await db.custom_select(`SELECT club_id FROM clubs WHERE club_name = ?;`, [club_name]);
        
        if (clubCheck.success === true && clubCheck.result.length > 0) {
            return { success: false, result: errors.ClubExists };
        }

        const result = await db.addClub(club_name, modified_by);

        if (result.success === true) {
            return { success: true, result: errors.ClubAdded };
        } else if(result.success === false) {
            return { success: false, result: errors.DatabaseError };
        }
    } catch (error) {
        console.error('Add club error:', error);
        return { success: false, result: error.message };
    }
}

exports.editClub = async (club_id, updateField, updateInfo, modified_by) => {
    try {
        if (club_id === null || updateField === null || !updateInfo || modified_by === null) {
            return { success: false, result: errors.EmptyFields };
        }

        const isClubExist = await db.custom_select(`SELECT * FROM clubs WHERE club_id = ?;`, [club_id]);
        
        if (!isClubExist) {
            return { success: false, result: errors.ClubNotFound };
        }

        const result = await db.editClub(club_id, updateField, updateInfo, modified_by);
        
        if (result.success === true) {
            return { success: true, result: errors.ClubUpdated };
        } else if(result.success === false) {
            return { success: false, result: errors.DatabaseError };
        }
    } catch (error) {
        console.error('Edit club error:', error);
        return { success: false, result: error.message };
    }
}

exports.removeClub = async (club_id, modified_by) => {
    try {
        if (club_id === null || !modified_by === null) {
            return { success: false, result: errors.EmptyFields };
        }

        const isClubExist = await db.custom_select(`SELECT club_id FROM clubs WHERE club_id = ?;`, [club_id]);
        
        if (!isClubExist) {
            return { success: false, result: errors.ClubNotFound };
        }

        const result = await db.removeClub(club_id, modified_by);
        
        if (result.success === true) {
            return { success: true, result: errors.ClubRemoved };
        } else if(result.success === false) {
            return { success: false, result: errors.DatabaseError };
        }
    } catch (error) {
        console.error('Remove club error:', error);
        return { success: false, result: error.message };
    }
}

exports.listClubs = async (club_id) => {
    try {
        const result = await db.custom_select(`SELECT * FROM clubs;`);
        
        if (result.success === true) {
            return { success: true, result: result.result };
        } else if(result.success === false){
            return { success: false, result: errors.DatabaseError };
        }
    } catch (error) {
        console.error('List clubs error:', error);
        return { success: false, result: error.message };
    }
}

exports.getClub = async (club_id) => {
    try {
        if (club_id === null) {
            return { success: false, result: errors.EmptyFields };
        }

        const result = await db.custom_select(`SELECT * FROM clubs WHERE club_id = ?;`, [club_id]);
        
        if (result.success === true && result.result.length > 0) {
            return { success: true, result: result.result[0] };
        } else if(result.success === false) {
            return { success: false, result: errors.ClubNotFound };
        }
    } catch (error) {
        console.error('Get club error:', error);
        return { success: false, result: error.message };
    }
}
