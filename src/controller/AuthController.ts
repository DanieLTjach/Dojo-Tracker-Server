import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthService } from '../service/AuthService.ts';
import {
    googleAuthSchema,
    telegramBrowserAuthSchema,
    discordAuthSchema,
    externalAuthRegistrationSchema,
    claimExternalAuthSchema,
    claimTelegramSchema,
} from '../schema/AuthSchemas.ts';
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
        const { body: { credential } } = googleAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.GOOGLE, { credential });
        return res.status(StatusCodes.OK).json(result);
    }

    async authenticateTelegram(req: Request, res: Response) {
        const { body: { idToken } } = telegramBrowserAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.TELEGRAM, { idToken });
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
        const { body } = discordAuthSchema.parse(req);
        const result = await this.authService.authenticateExternal(AuthProvider.DISCORD, body);
        return res.status(StatusCodes.OK).json(result);
    }

    async linkDiscord(req: Request, res: Response) {
        const { body } = discordAuthSchema.parse(req);
        const result = await this.authService.linkExternal(req.user!.userId, AuthProvider.DISCORD, body);
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

    registerExternal(req: Request, res: Response) {
        const { body: { registrationToken, name, nickname } } = externalAuthRegistrationSchema.parse(req);
        const result = this.authService.registerExternal(registrationToken, name, nickname);
        return res.status(StatusCodes.OK).json(result);
    }

    claimExternal(req: Request, res: Response) {
        const { body: { registrationToken, linkCode } } = claimExternalAuthSchema.parse(req);
        const result = this.authService.claimExternal(registrationToken, req.user?.userId, linkCode);
        return res.status(StatusCodes.OK).json(result);
    }

    claimTelegram(req: Request, res: Response) {
        const { body: { linkCode } } = claimTelegramSchema.parse(req);
        const result = this.authService.claimTelegramMiniApp(req.query as Record<string, string>, linkCode);
        return res.status(StatusCodes.OK).json(result);
    }

    createLinkCode(req: Request, res: Response) {
        const result = this.authService.createLinkCode(req.user!.userId);
        return res.status(StatusCodes.OK).json(result);
    }
}
