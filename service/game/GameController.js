import { status } from '../../config/constants.js';
import errors from '../../config/messages.js';
import { GameService } from './GameService.js';

export class GameController {
    constructor() {
        this.gameService = new GameService();
    }

    async add(req, res) {
        const { type, players_data, modified_by, created_at, club_id, event_id } = req.body;
        try {
            console.log("Received game data:", { type, players_data, modified_by });
            if (type == null || !players_data || club_id === null) {
                console.log(1);
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        type: !!type,
                        players_data: !!players_data,
                        club_id: !!club_id,
                    }
                });
            }

            const result = await this.gameService.addGame(type, players_data, modified_by, created_at, club_id, event_id);

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
        catch (error) {
            console.error('Add game error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async edit(req, res) {
        const { id, updateField, updateInfo, modified_by } = req.body;
        try {
            if (!id || !updateField || !updateInfo || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        id: !!id,
                        updateField: !!updateField,
                        updateInfo: !!updateInfo,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.gameService.editGame(game_id, updateField, updateInfo, modified_by);
            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Edit game error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async remove(req, res) {
        const { game_id, modified_by } = req.body;
        try {
            if (!game_id || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { game_id: !!game_id, modified_by: !!modified_by }
                });
            }

            const result = await this.gameService.removeGame(game_id, modified_by);
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
    }

    async list(req, res) {
        const { type, date_from, date_to, user_id, club_id } = req.body;
        try {
            if (type == null || !date_from || !date_to || club_id === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        type: !!type,
                        date_from: !!date_from,
                        date_to: !!date_to,
                        club_id: !!club_id,
                    }
                });
            }
            const games = await this.gameService.listGames(type, date_from, date_to, user_id, club_id);
            if (games.success === true) {
                return res.status(status.OK).json({ games: games.result });
            } else {
                return res.status(status.ERROR).json({
                    message: games.result,
                    details: games
                });
            }
        } catch (error) {
            console.error('List games error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async get(req, res) {
        const { game_id } = req.body;
        try {
            if (!game_id) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { game_id: !!game_id }
                });
            }

            const game = await this.gameService.getGame(game_id);
            if (game.success === true) {
                return res.status(status.OK).json({ game: game.result });
            } else {
                return res.status(status.ERROR).json({
                    message: game.result,
                    details: game
                });
            }
        } catch (error) {
            console.error('Get game error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }
}
