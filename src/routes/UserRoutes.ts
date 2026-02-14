import { Router } from 'express';
import { UserController } from '../controller/UserController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

const router = Router();
const userController = new UserController();

// Public - user registration
router.post('/', withTransaction((req, res) => userController.registerUser(req, res)));
// Public - get current user status
router.post('/current/status', withTransaction((req, res) => userController.getCurrentUserStatus(req, res)));

// Authenticated users - read operations
router.get('/', requireAuth, withTransaction((req, res) => userController.getAllUsers(req, res)));
router.get('/:id', requireAuth, withTransaction((req, res) => userController.getUserById(req, res)));
router.get(
    '/by-telegram-id/:telegramId',
    requireAuth,
    withTransaction((req, res) => userController.getUserByTelegramId(req, res))
);

// Authenticated users - edit own profile or admin can edit any
router.patch('/:id', requireAuth, withTransaction((req, res) => userController.editUser(req, res)));

// Admin only - activation/deactivation
router.post(
    '/:id/activate',
    requireAuth,
    requireAdmin,
    withTransaction((req, res) => userController.updateUserActivationStatus(req, res, true))
);
router.post(
    '/:id/deactivate',
    requireAuth,
    requireAdmin,
    withTransaction((req, res) => userController.updateUserActivationStatus(req, res, false))
);

export default router;