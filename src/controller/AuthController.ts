import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthService } from '../service/AuthService.ts';
import { UserService } from '../service/UserService.ts';
import { TokenService } from '../service/TokenService.ts';
import { validateTelegramInitData } from '../util/TelegramAuth.ts';

export class AuthController {
    private authService: AuthService;
    private userService: UserService;
    private tokenService: TokenService;

    constructor() {
        this.authService = new AuthService();
        this.userService = new UserService();
        this.tokenService = new TokenService();
    }

    /**
     * Authenticates a user using Telegram Mini App initData (legacy query param version).
     * Endpoint: POST /api/authenticate?query_id=...&user=...&auth_date=...&hash=...
     *
     * The initData is passed as query parameters (raw from Telegram).
     *
     * @param req - Express request with initData in query params
     * @param res - Express response
     * @returns TokenPair with JWT and user info
     */
    authenticate(req: Request, res: Response) {
        // Extract all query parameters (this is the raw initData from Telegram)
        const initDataParams = req.query as Record<string, string>;

        // Authenticate and get tokens
        const result = this.authService.authenticate(initDataParams);

        return res.status(StatusCodes.OK).json(result);
    }

    /**
     * Authenticates a user using Telegram initData.
     * Endpoint: POST /api/auth/telegram
     *
     * Accepts initData in either:
     * 1. Authorization header: "Authorization: tma <initDataRaw>" (RECOMMENDED - Telegram standard)
     * 2. Request body: { "initData": "<initDataRaw>" }
     *
     * This is the recommended endpoint for Telegram Mini Apps.
     * Auto-registers new users.
     *
     * @param req - Express request with initData in header or body
     * @param res - Express response
     * @returns JWT token and user info
     */
    authenticateWithTelegram(req: Request, res: Response) {
        // Try to get initData from Authorization header first (standard approach)
        let initData: string | undefined;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('tma ')) {
            // Extract initData from "tma <initDataRaw>" format
            initData = authHeader.substring(4); // Remove "tma " prefix
        } else if (req.body.initData) {
            // Fallback to body parameter
            initData = req.body.initData;
        }

        if (!initData || typeof initData !== 'string') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'initData is required in Authorization header (format: "tma <initDataRaw>") or request body',
            });
        }

        // Validate and parse Telegram initData
        const validatedData = validateTelegramInitData(initData);

        if (!validatedData.user) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'User data is missing from initData',
            });
        }

        const telegramUser = validatedData.user;

        // Get or create user by Telegram ID
        const { user, isNewUser } = this.userService.getOrCreateUserByTelegramId(
            telegramUser.id,
            JSON.stringify(telegramUser)
        );

        // Generate JWT token
        const tokenPair = this.tokenService.createTokenPair(user);

        return res.status(StatusCodes.OK).json({
            token: tokenPair.accessToken,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                name: user.name,
                telegramUsername: user.telegramUsername,
                isAdmin: !!user.isAdmin,
                isActive: !!user.isActive,
            },
            isNewUser,
        });
    }
}
