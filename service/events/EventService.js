import errors from '../../config/messages.js';
import DatabaseManager from '../db/dbManager.js';

export class EventService {
    constructor() {
        this.db = new DatabaseManager();
    }

    async addEvent(name, type, date_from, date_to, modified_by) {
        try {
            if (!name || !type || !date_from || !date_to || modified_by === null || modified_by === undefined) {
                return { success: false, result: errors.EmptyFields };
            }

            const result = await this.db.add_event(name, type, date_from, date_to, modified_by);

            if (result.success === true) {
                return { success: true, result: "Event added successfully" };
            } else {
                return { success: false, result: result.result };
            }
        } catch (err) {
            console.error("Error adding event:", err);
            return { success: false, result: err.message };
        }
    }

    async editEvent(id, name, type, date_from, date_to, modified_by) {
        try {
            if (!id || !name || !type || !date_from || !date_to || !modified_by) {
                return { success: false, result: errors.EmptyFields };
            }

            const result = await this.db.edit_event(id, name, type, date_from, date_to, modified_by);

            if (result.success === true) {
                return { success: true, result: "Event edited successfully" };
            } else {
                return { success: false, result: result.result };
            }
        } catch (err) {
            console.error("Error editing event:", err);
            return { success: false, result: err.message };
        }
    }

    async removeEvent(id, modified_by) {
        try {
            if (!id || !modified_by) {
                return { success: false, result: errors.EmptyFields };
            }

            const result = await this.db.remove_event(id, modified_by);

            if (result.success === true) {
                return { success: true, result: "Event removed successfully" };
            } else {
                return { success: false, result: result.result };
            }
        } catch (err) {
            console.error("Error removing event:", err);
            return { success: false, result: err.message };
        }
    }

    async listEvents() {
        try {
            const result = await this.db.list_events();

            if (result.success === true) {
                return { success: true, result: result.data };
            } else {
                return { success: false, result: result.result };
            }
        } catch (err) {
            console.error("Error listing events:", err);
            return { success: false, result: err.message };
        }
    }
}