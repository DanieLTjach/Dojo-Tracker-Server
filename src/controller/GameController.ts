import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameService } from '../service/GameService.ts';
import { 
    gameCreationSchema,
    trackedGameCreationSchema,
    gameGetByIdSchema, 
    gameGetListSchema, 
    gameUpdateSchema, 
    gameDeletionSchema,
    gameRoundPostSchema,
    gameRoundPreviewSchema,
    gameRoundDeleteSchema,
    gameFinishSchema,
    gameUndoFinishSchema,
    gameStartSchema
} from '../schema/GameSchemas.ts';
import { TrackedGameService } from '../service/TrackedGameService.ts';

export class GameController {

    private gameService: GameService = new GameService();
    private trackedGameService: TrackedGameService = new TrackedGameService();

    addGame(req: Request, res: Response) {
        const { body: { eventId, playersData, createdAt, hideNewGameMessage, tournamentRound, tournamentTable } } = gameCreationSchema.parse(req);
        const createdBy = req.user!.userId;
        const newGame = this.gameService.addGame(eventId, playersData, createdBy, createdAt ?? undefined, hideNewGameMessage ?? false, tournamentRound ?? null, tournamentTable ?? null);
        return res.status(StatusCodes.CREATED).json(newGame);
    }

    addTrackedGame(req: Request, res: Response) {
        const { body: { eventId, players } } = trackedGameCreationSchema.parse(req);
        const createdBy = req.user!.userId;
        const newGame = this.trackedGameService.createTrackedGame(eventId, players, createdBy, "IN_PROGRESS");
        return res.status(StatusCodes.CREATED).json(newGame);
    }

    getGames(req: Request, res: Response) {
        const { query } = gameGetListSchema.parse(req);
        const games = this.gameService.getGames(query || {});
        return res.status(StatusCodes.OK).json(games);
    }

    getGameById(req: Request, res: Response) {
        const { params: { gameId } } = gameGetByIdSchema.parse(req);
        const game = this.gameService.getDetailedGameById(gameId);
        return res.status(StatusCodes.OK).json(game);
    }

    postRoundResult(req: Request, res: Response) {
        const { params: { gameId, roundId }, body } = gameRoundPostSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const game = this.trackedGameService.addGameRoundResult(gameId, roundId, body, modifiedBy);
        return res.status(StatusCodes.OK).json(game);
    }

    previewRoundResult(req: Request, res: Response) {
        const { params: { gameId, roundId }, body } = gameRoundPreviewSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const result = this.trackedGameService.previewGameRoundResult(gameId, roundId, body, modifiedBy);
        return res.status(StatusCodes.OK).json(result);
    }

    deleteRoundResult(req: Request, res: Response) {
        const { params: { gameId, roundId } } = gameRoundDeleteSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const game = this.trackedGameService.deleteGameRoundResult(gameId, roundId, modifiedBy);
        return res.status(StatusCodes.OK).json(game);
    }

    startTrackedGame(req: Request, res: Response) {
        const { params: { gameId } } = gameStartSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const game = this.trackedGameService.startTrackedGame(gameId, modifiedBy);
        return res.status(StatusCodes.OK).json(game);
    }

    finishGame(req: Request, res: Response) {
        const { params: { gameId } } = gameFinishSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const game = this.trackedGameService.finishGame(gameId, modifiedBy);
        return res.status(StatusCodes.OK).json(game);
    }

    undoFinishGame(req: Request, res: Response) {
        const { params: { gameId } } = gameUndoFinishSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const game = this.trackedGameService.undoFinishGame(gameId, modifiedBy);
        return res.status(StatusCodes.OK).json(game);
    }

    editGame(req: Request, res: Response) {
        const {
            params: { gameId },
            body: { playersData, eventId, createdAt, tournamentRound, tournamentTable }
        } = gameUpdateSchema.parse(req);

        const modifiedBy = req.user!.userId; // Non-null assertion safe because requireAdmin ensures user exists
        const updatedGame = this.gameService.updateGame(
            gameId,
            eventId,
            playersData,
            modifiedBy,
            createdAt ?? undefined,
            tournamentRound ?? null,
            tournamentTable ?? null
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
