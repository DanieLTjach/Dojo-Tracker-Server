const errors = require('../../config/messages');
const DatabaseManager = require('../db/dbManager');
const db = new DatabaseManager();

exports.addEvent = async (name, type, date_from, date_to, modified_by) => {
    try {
        if (!name || !type || !date_from || !date_to || modified_by === null || modified_by === undefined) {
            return { success: false, result: errors.EmptyFields };
        }

        const result = await db.add_event(name, type, date_from, date_to, modified_by);

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

exports.editEvent = async (id, name, type, date_from, date_to, modified_by) => {
    try {
        if (!id || !name || !type || !date_from || !date_to || !modified_by) {
            return { success: false, result: errors.EmptyFields };
        }

        const result = await db.edit_event(id, name, type, date_from, date_to, modified_by);

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

exports.removeEvent = async (id, modified_by) => {
    try {
        if (!id || !modified_by) {
            return { success: false, result: errors.EmptyFields };
        }

        const result = await db.remove_event(id, modified_by);

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

exports.listEvents = async () => {
    try {
        const result = await db.list_events();

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