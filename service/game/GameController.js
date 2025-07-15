const status = require('../../config/config').STATUS;
const errors = require('../../config/messages');

const { addGame, editGame, removeGame, listGames, getGame } = require('./GameLogic');

exports.add = async (req, res) => {
    const {game_type, players_data, modified_by} = req.body;
    try{
        console.log("Received game data:", { game_type, players_data, modified_by });
        if (game_type == null || !players_data) {
            console.log(1);
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    game_type: !!game_type,
                    players_data: !!players_data
                }
            });
        }

        const result = await addGame(game_type, players_data, modified_by);

        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            console.log(2);
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    }
    catch(error) {
        console.error('Add game error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
};

exports.edit = async (req, res) => {

};

exports.remove = async (req, res) => {
    const { game_id, modified_by } = req.body;
    try {
        if (!game_id || !modified_by) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: { game_id: !!game_id , modified_by: !!modified_by }
            });
        }

        const result = await removeGame(game_id, modified_by);
        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result,
                details: result
            });
        }
    } catch (error) {
        console.error('Remove game error:', error);
        return res.status(status.ERROR).json({ 
            message: errors.InternalServerError, 
            details: error.message 
        });
    }
};

exports.list = async (req, res) => {

};

exports.get = async (req, res) => {

};