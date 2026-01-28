import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameRulesService } from '../service/GameRulesService.ts';
import { gameRulesGetByIdSchema, gameRulesCreateSchema, gameRulesUpdateSchema, gameRulesDeleteSchema } from '../schema/GameRulesSchemas.ts';

export class GameRulesController {
    private gameRulesService: GameRulesService = new GameRulesService();

    getAllGameRules(_req: Request, res: Response) {
        const gameRules = this.gameRulesService.getAllGameRules();
        return res.status(StatusCodes.OK).json(gameRules);
    }

    getGameRulesById(req: Request, res: Response) {
        const { params: { id } } = gameRulesGetByIdSchema.parse(req);
        const gameRules = this.gameRulesService.getGameRulesById(id);
        return res.status(StatusCodes.OK).json(gameRules);
    }

    createGameRules(req: Request, res: Response) {
        const { body } = gameRulesCreateSchema.parse(req);
        const gameRules = this.gameRulesService.createGameRules(body);
        return res.status(StatusCodes.CREATED).json(gameRules);
    }

    updateGameRules(req: Request, res: Response) {
        const { params: { id }, body } = gameRulesUpdateSchema.parse(req);
        const gameRules = this.gameRulesService.updateGameRules(id, body);
        return res.status(StatusCodes.OK).json(gameRules);
    }

    deleteGameRules(req: Request, res: Response) {
        const { params: { id } } = gameRulesDeleteSchema.parse(req);
        this.gameRulesService.deleteGameRules(id);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
