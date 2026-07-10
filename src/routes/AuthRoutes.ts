import type { RequestHandler } from 'express';
import { Router } from 'express';
import { AuthController } from '../controller/AuthController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const asyncHandler = (handler: RequestHandler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};

/**
 * POST /api/authenticate
 * Authenticates a Telegram Mini App user using initData.
 * InitData should be passed as query parameters.
 *
 * Example: POST /api/authenticate?query_id=...&user=...&auth_date=...&hash=...
 */
export function createAuthRouter(authController: AuthController = new AuthController()) {
    const router = Router();

    router.post('/authenticate', withTransaction((req, res) => authController.authenticate(req, res)));
    router.post('/auth/google', asyncHandler((req, res) => authController.authenticateGoogle(req, res)));
    router.post('/auth/telegram', asyncHandler((req, res) => authController.authenticateTelegram(req, res)));
    router.post('/auth/discord', asyncHandler((req, res) => authController.authenticateDiscord(req, res)));
    router.post('/auth/link/google', requireAuth, asyncHandler((req, res) => authController.linkGoogle(req, res)));
    router.post('/auth/link/telegram', requireAuth, asyncHandler((req, res) => authController.linkTelegram(req, res)));
    router.post('/auth/link/discord', requireAuth, asyncHandler((req, res) => authController.linkDiscord(req, res)));
    router.get('/auth/providers', requireAuth, (req, res) => authController.getLinkedProviders(req, res));

    return router;
}

const router = createAuthRouter();

export default router;
