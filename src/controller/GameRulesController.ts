import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameRulesService } from '../service/GameRulesService.ts';
import { gameRulesGetByIdSchema, gameRulesGetListSchema } from '../schema/GameRulesSchemas.ts';

export class GameRulesController {
    private gameRulesService: GameRulesService = new GameRulesService();

    getAllGameRules(req: Request, res: Response) {
        const { query } = gameRulesGetListSchema.parse(req);
        const gameRules = this.gameRulesService.getAllGameRules(query?.clubId);
        return res.status(StatusCodes.OK).json(gameRules);
    }

    getGameRulesById(req: Request, res: Response) {
        const { params: { id } } = gameRulesGetByIdSchema.parse(req);
        const gameRules = this.gameRulesService.getGameRulesById(id);
        return res.status(StatusCodes.OK).json(gameRules);
    }
}
