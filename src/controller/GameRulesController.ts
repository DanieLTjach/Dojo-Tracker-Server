import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameRulesService } from '../service/GameRulesService.ts';
import { gameRulesGetByIdSchema } from '../schema/GameRulesSchemas.ts';

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
}
