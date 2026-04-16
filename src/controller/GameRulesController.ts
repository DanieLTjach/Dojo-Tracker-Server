import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { GameRulesService } from '../service/GameRulesService.ts';
import { gameRulesDetailsUpdateSchema, gameRulesGetByIdSchema, gameRulesGetListSchema } from '../schema/GameRulesSchemas.ts';
import { gameRulesCatalog } from '../data/gameRulesCatalog.ts';
import { gameRulesPresets } from '../data/gameRulesPresets.ts';

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

    getCatalog(_req: Request, res: Response) {
        return res.status(StatusCodes.OK)
            .set('Cache-Control', 'public, max-age=300')
            .json(gameRulesCatalog);
    }

    getPresets(_req: Request, res: Response) {
        return res.status(StatusCodes.OK)
            .set('Cache-Control', 'public, max-age=300')
            .json(gameRulesPresets);
    }

    updateGameRulesDetails(req: Request, res: Response) {
        const { params: { id }, body: { details } } = gameRulesDetailsUpdateSchema.parse(req);
        const userId = req.user!.userId;
        const gameRules = this.gameRulesService.updateGameRulesDetails(id, details, userId);
        return res.status(StatusCodes.OK).json(gameRules);
    }
}
