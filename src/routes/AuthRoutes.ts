import { Router } from 'express';
import { AuthController } from '../controller/AuthController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';

const router = Router();
const authController = new AuthController();

/**
 * POST /api/auth/telegram
 * Authenticates a Telegram Mini App user using initData.
 * Body: { initData: "query_id=...&user=...&auth_date=...&hash=..." }
 *
 * This is the recommended endpoint for Telegram Mini Apps.
 * Returns JWT token and user info. Auto-registers new users.
 *
 * No authentication required (public endpoint).
 */
router.post(
    '/telegram',
    withTransaction((req, res) => authController.authenticateWithTelegram(req, res))
);

/**
 * POST /api/auth/authenticate (LEGACY)
 * Authenticates a Telegram Mini App user using initData.
 * InitData should be passed as query parameters.
 *
 * Example: POST /api/auth/authenticate?query_id=...&user=...&auth_date=...&hash=...
 *
 * Note: Use /api/auth/telegram instead (cleaner API)
 */
router.post(
    '/authenticate',
    withTransaction((req, res) => authController.authenticate(req, res))
);

export default router;
