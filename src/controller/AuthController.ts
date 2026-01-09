import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthService } from '../service/AuthService.ts';

export class AuthController {
    private authService: AuthService = new AuthService();

    /**
     * Authenticates a user using Telegram Mini App initData.
     * Endpoint: POST /api/authenticate?query_id=...&user=...&auth_date=...&hash=...
     *
     * The initData is passed as query parameters (raw from Telegram).
     *
     * @param req - Express request with initData in query params
     * @param res - Express response
     * @returns TokenPair with JWT and user info
     */
    authenticate(req: Request, res: Response) {
        const initDataParams = req.query as Record<string, string>;
        const result = this.authService.authenticate(initDataParams);
        return res.status(StatusCodes.OK).json(result);
    }
}
