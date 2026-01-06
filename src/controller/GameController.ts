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
        const { body: { eventId, playersData, createdBy } } = gameCreationSchema.parse(req);
        const newGame = this.gameService.addGame(eventId, playersData, createdBy);
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
            body: { playersData, eventId, modifiedBy } 
        } = gameUpdateSchema.parse(req);
        
        const updatedGame = this.gameService.updateGame(
            gameId, 
            eventId, 
            playersData, 
            modifiedBy
        );
        return res.status(StatusCodes.OK).json(updatedGame);
    }

    deleteGame(req: Request, res: Response) {
        const { 
            params: { gameId }, 
            body: { deletedBy } 
        } = gameDeletionSchema.parse(req);
        
        this.gameService.deleteGame(gameId, deletedBy);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
