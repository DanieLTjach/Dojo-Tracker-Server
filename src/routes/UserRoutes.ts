import { Router } from 'express';
import { UserController } from '../controller/UserController.ts';
import { ClubMembershipController } from '../controller/ClubMembershipController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';
import profileRoutes from './ProfileRoutes.ts';

const router = Router();
const userController = new UserController();
const membershipController = new ClubMembershipController();

// Public - user registration
router.post('/', withTransaction((req, res) => userController.registerUser(req, res)));
// Public - get current user status
router.post('/current/status', withTransaction((req, res) => userController.getCurrentUserStatus(req, res)));
// Authenticated - get current user's club memberships
router.get('/current/clubs', requireAuth, withTransaction((req, res) => membershipController.getCurrentUserClubs(req, res)));

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

router.post(
    '/:id/activate',
    requireAuth,
    withTransaction((req, res) => userController.updateUserActivationStatus(req, res, true))
);
router.post(
    '/:id/deactivate',
    requireAuth,
    withTransaction((req, res) => userController.updateUserActivationStatus(req, res, false))
);

// Profile sub-routes
router.use('/:id/profile', profileRoutes);

export default router;
