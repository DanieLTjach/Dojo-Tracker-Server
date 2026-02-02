import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameService } from '../service/GameService.ts';
import { 
    gameCreationSchema, 
    gameGetByIdSchema, 
    gameGetListSchema, 
    gameUpdateSchema, 
    gameDeletionSchema 
} from '../schema/GameSchemas.ts';

export class GameController {

    private gameService: GameService = new GameService();

    addGame(req: Request, res: Response) {
        const { body: { eventId, playersData, createdAt, hideNewGameMessage } } = gameCreationSchema.parse(req);
        const createdBy = req.user!.userId;
        const newGame = this.gameService.addGame(eventId, playersData, createdBy, createdAt ?? undefined, hideNewGameMessage ?? false);
        return res.status(StatusCodes.CREATED).json(newGame);
    }

    getGames(req: Request, res: Response) {
        const { query } = gameGetListSchema.parse(req);
        const games = this.gameService.getGames(query || {});
        return res.status(StatusCodes.OK).json(games);
    }

    getGameById(req: Request, res: Response) {
        const { params: { gameId } } = gameGetByIdSchema.parse(req);
        const game = this.gameService.getGameById(gameId);
        return res.status(StatusCodes.OK).json(game);
    }

    editGame(req: Request, res: Response) {
        const {
            params: { gameId },
            body: { playersData, eventId, createdAt }
        } = gameUpdateSchema.parse(req);

        const modifiedBy = req.user!.userId; // Non-null assertion safe because requireAdmin ensures user exists
        const updatedGame = this.gameService.updateGame(
            gameId,
            eventId,
            playersData,
            modifiedBy,
            createdAt ?? undefined
        );
        return res.status(StatusCodes.OK).json(updatedGame);
    }

    deleteGame(req: Request, res: Response) {
        const { params: { gameId } } = gameDeletionSchema.parse(req);
        const deletedBy = req.user!.userId;

        this.gameService.deleteGame(gameId, deletedBy);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
