import errors from '../../config/messages.js';
import DatabaseManager from '../db/dbManager.js';

export class ClubService {
    constructor() {
        this.db = new DatabaseManager();
    }

    async addClub(club_name, modified_by) {
        try {
            if (!club_name || modified_by === null) {
                return { success: false, result: errors.EmptyFields };
            }

            const clubCheck = await this.db.custom_select(`SELECT id FROM club WHERE name = ?;`, [club_name]);

            if (clubCheck.success === true && clubCheck.result.length > 0) {
                return { success: false, result: errors.ClubExists };
            }

            const result = await this.db.addClub(club_name, modified_by);

            if (result.success === true) {
                return { success: true, result: errors.ClubAdded };
            } else if (result.success === false) {
                return { success: false, result: errors.DatabaseError };
            }
        } catch (error) {
            console.error('Add club error:', error);
            return { success: false, result: error.message };
        }
    }

    async editClub(club_id, updateField, updateInfo, modified_by) {
        try {
            if (club_id === null || updateField === null || !updateInfo || modified_by === null) {
                return { success: false, result: errors.EmptyFields };
            }

            const isClubExist = await this.db.custom_select(`SELECT * FROM club WHERE id = ?;`, [club_id]);

            if (!isClubExist) {
                return { success: false, result: errors.ClubNotFound };
            }

            const result = await this.db.editClub(club_id, updateField, updateInfo, modified_by);

            if (result.success === true) {
                return { success: true, result: errors.ClubUpdated };
            } else if (result.success === false) {
                return { success: false, result: errors.DatabaseError };
            }
        } catch (error) {
            console.error('Edit club error:', error);
            return { success: false, result: error.message };
        }
    }

    async removeClub(club_id, modified_by) {
        try {
            if (club_id === null || !modified_by === null) {
                return { success: false, result: errors.EmptyFields };
            }

            const isClubExist = await this.db.custom_select(`SELECT id FROM club WHERE id = ?;`, [club_id]);

            if (!isClubExist) {
                return { success: false, result: errors.ClubNotFound };
            }

            const result = await this.db.removeClub(club_id, modified_by);

            if (result.success === true) {
                return { success: true, result: errors.ClubRemoved };
            } else if (result.success === false) {
                return { success: false, result: errors.DatabaseError };
            }
        } catch (error) {
            console.error('Remove club error:', error);
            return { success: false, result: error.message };
        }
    }

    async listClubs(club_id) {
        try {
            const result = await this.db.custom_select(`SELECT * FROM club;`);

            if (result.success === true) {
                return { success: true, result: result.result };
            } else if (result.success === false) {
                return { success: false, result: errors.DatabaseError };
            }
        } catch (error) {
            console.error('List clubs error:', error);
            return { success: false, result: error.message };
        }
    }

    async getClub(club_id) {
        try {
            if (club_id === null) {
                return { success: false, result: errors.EmptyFields };
            }

            const result = await this.db.custom_select(`SELECT * FROM club WHERE id = ?;`, [club_id]);

            if (result.success === true && result.result.length > 0) {
                return { success: true, result: result.result[0] };
            } else if (result.success === false) {
                return { success: false, result: errors.ClubNotFound };
            }
        } catch (error) {
            console.error('Get club error:', error);
            return { success: false, result: error.message };
        }
    }
}
