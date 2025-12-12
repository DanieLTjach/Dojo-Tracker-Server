import errors from '../../config/messages.js';
import DatabaseManager from '../db/dbManager.js';

export class AchievementsService {
    constructor() {
        this.db = new DatabaseManager();
    }

    async new_Achievement(name, description, modified_by) {
        try {
            const result = await this.db.add_achievement(name, description, modified_by);
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
    }

    async grant_Achievement(user_id, achievement_id, modified_by) {
        try {
            const result = await this.db.grant_achievement(user_id, achievement_id, modified_by);
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
    }

    async list_Achievements() {
        try {
            const result = await this.db.list_achievements();
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
    }

    async user_achievements(user_id) {
        try {
            const result = await this.db.user_achievements(user_id);
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
    }
}