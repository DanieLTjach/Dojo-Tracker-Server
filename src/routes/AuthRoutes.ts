import { Router } from 'express';
import { AuthController } from '../controller/AuthController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';

const router = Router();
const authController = new AuthController();

/**
 * POST /api/authenticate
 * Authenticates a Telegram Mini App user using initData.
 * InitData should be passed as query parameters.
 *
 * Example: POST /api/authenticate?query_id=...&user=...&auth_date=...&hash=...
 */
router.post('/authenticate', withTransaction((req, res) => authController.authenticate(req, res)));

/**
 * POST /api/authenticate/refresh
 * Refreshes an access token using a rotating refresh token.
 */
router.post('/authenticate/refresh', (req, res) => authController.refresh(req, res));

export default router;
