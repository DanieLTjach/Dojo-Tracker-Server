const status = require('../../config/config').STATUS;
const errors = require('../../config/messages');

const { addEvent, editEvent, removeEvent, listEvents} = require("./EventLogic");

exports.add = async (req, res) => {
    const { name, type, date_from, date_to, modified_by } = req.body;
    try {
        if (!name || !type || !date_from || !date_to || modified_by === null || modified_by === undefined) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    name: !!name,
                    type: !!type,
                    date_from: !!date_from,
                    date_to: !!date_to,
                    modified_by: !!modified_by
                }
            });
        }

        const result = await addEvent(name, type, date_from, date_to, modified_by);

        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch(error) {
        console.error('Add event error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.edit = async (req, res) => {
    const { id, name, type, date_from, date_to, modified_by } = req.body;
    try {
        if (!id || !name || !type || !date_from || !date_to || !modified_by) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    id: !!id,
                    name: !!name,
                    type: !!type,
                    date: !!date,
                    location: !!location,
                    modified_by: !!modified_by
                }
            });
        }

        const result = await editEvent(id, name, type, date_from, date_to, modified_by);

        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch(error) {
        console.error('Edit event error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.remove = async (req, res) => {
    const { id, modified_by } = req.body;
    try {
        if (!id || !modified_by) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    id: !!id,
                    modified_by: !!modified_by
                }
            });
        }

        const result = await removeEvent(id, modified_by);

        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch(error) {
        console.error('Remove event error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.list = async (req, res) => {
    try {
        const result = await listEvents();
        if (result.success === true) {
            return res.status(status.OK).json({ result: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch(error) {
        console.error('List events error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}