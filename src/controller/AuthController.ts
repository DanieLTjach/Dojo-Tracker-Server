import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthService } from '../service/AuthService.ts';
import { googleAuthSchema, telegramBrowserAuthSchema, discordAuthSchema } from '../schema/AuthSchemas.ts';
import { AuthProvider } from '../model/AuthProviderModels.ts';

export class AuthController {
    private authService: AuthService;

    constructor(authService: AuthService = new AuthService()) {
        this.authService = authService;
    }

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

    async authenticateGoogle(req: Request, res: Response) {
        const { body: { credential, name } } = googleAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.GOOGLE, { credential }, name);
        return res.status(StatusCodes.OK).json(result);
    }

    async authenticateTelegram(req: Request, res: Response) {
        const { body: { idToken, name } } = telegramBrowserAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.TELEGRAM, { idToken }, name);
        return res.status(StatusCodes.OK).json(result);
    }

    async linkGoogle(req: Request, res: Response) {
        const { body: { credential } } = googleAuthSchema.parse(req);
        const result = await this.authService.linkExternal(req.user!.userId, AuthProvider.GOOGLE, { credential });
        return res.status(StatusCodes.OK).json(result);
    }

    async linkTelegram(req: Request, res: Response) {
        const { body: { idToken } } = telegramBrowserAuthSchema.parse(req);
        const result = await this.authService.linkExternal(req.user!.userId, AuthProvider.TELEGRAM, { idToken });
        return res.status(StatusCodes.OK).json(result);
    }

    async authenticateDiscord(req: Request, res: Response) {
        const { body: { code, name } } = discordAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.DISCORD, { code }, name);
        return res.status(StatusCodes.OK).json(result);
    }

    async linkDiscord(req: Request, res: Response) {
        const { body: { code } } = discordAuthSchema.parse(req);
        const result = await this.authService.linkExternal(req.user!.userId, AuthProvider.DISCORD, { code });
        return res.status(StatusCodes.OK).json(result);
    }

    getLinkedProviders(req: Request, res: Response) {
        const result = this.authService.getLinkedProviders(req.user!.userId);
        return res.status(StatusCodes.OK).json(result);
    }

    getAvailableProviders(_req: Request, res: Response) {
        const result = this.authService.getAvailableProviders();
        return res.status(StatusCodes.OK).json(result);
    }
}
