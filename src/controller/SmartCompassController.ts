import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    smartCompassPairingCodeCreationSchema,
    smartCompassSessionListSchema,
    smartCompassSessionRedemptionSchema,
    smartCompassSessionRevocationSchema,
} from '../schema/SmartCompassSchemas.ts';
import { SmartCompassAuthService } from '../service/SmartCompassAuthService.ts';

export class SmartCompassController {
    private smartCompassAuthService: SmartCompassAuthService = new SmartCompassAuthService();

    createPairingCode(req: Request, res: Response) {
        const { params: { gameId } } = smartCompassPairingCodeCreationSchema.parse(req);
        const result = this.smartCompassAuthService.createPairingCode(gameId, req.user!.userId);
        return res.status(StatusCodes.CREATED).json(result);
    }

    redeemSession(req: Request, res: Response) {
        const { body: { code, deviceLabel } } = smartCompassSessionRedemptionSchema.parse(req);
        const result = this.smartCompassAuthService.redeemPairingCode(code, deviceLabel ?? null);
        return res.status(StatusCodes.CREATED).json(result);
    }

    listSessions(req: Request, res: Response) {
        const { params: { gameId } } = smartCompassSessionListSchema.parse(req);
        const sessions = this.smartCompassAuthService.listSessions(gameId, req.user!.userId);
        return res.status(StatusCodes.OK).json(sessions);
    }

    revokeSession(req: Request, res: Response) {
        const { params: { gameId, sessionId } } = smartCompassSessionRevocationSchema.parse(req);
        this.smartCompassAuthService.revokeSession(gameId, sessionId, req.user!.userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
