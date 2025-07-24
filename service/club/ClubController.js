const status = require('../../config/config').STATUS;
const errors = require('../../config/messages');

const { addClub, editClub, removeClub, listClubs, getClub } = require('./ClubLogic');

exports.add = async (req, res) => {
    const { club_name, modified_by } = req.body;
    try {
        if (!club_name || modified_by === null) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    club_name: !!club_name
                }
            });
        }

        const result = await addClub(club_name, modified_by);

        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch(error) {
        console.error('Add club error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.edit = async (req, res) => {
    const { club_id, updateField, updateInfo, modified_by } = req.body;
    try {
        if (club_id === null || !updateField || !updateInfo || modified_by === null) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    club_id: !!club_id,
                    updateField: !!updateField,
                    updateInfo: !!updateInfo,
                    modified_by: !!modified_by
                }
            });
        }

        const result = await editClub(club_id, updateField, updateInfo, modified_by);
        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch (error) {
        console.error('Edit club error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.remove = async (req, res) => {
    const { club_id, modified_by } = req.body;
    try {
        if (club_id === null || !modified_by === null) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: { club_id: !!club_id , modified_by: !!modified_by }
            });
        }

        const result = await removeClub(club_id, modified_by);
        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch (error) {
        console.error('Remove club error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.list = async (req, res) => {
    try {
        const result = await listClubs();
        if (result.success === true) {
            return res.status(status.OK).json({ result: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch (error) {
        console.error('List clubs error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}

exports.get = async (req, res) => {
    const { club_id } = req.params;
    try {
        if (!club_id) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: { club_id: !!club_id }
            });
        }

        const result = await getClub(club_id);
        if (result.success === true) {
            return res.status(status.OK).json({ result: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch (error) {
        console.error('Get club error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
}
