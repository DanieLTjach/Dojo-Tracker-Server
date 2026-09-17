import { Router } from 'express';
import { NotificationController } from '../controller/NotificationController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const notificationController = new NotificationController();

router.get('/notifications', requireAuth, (req, res) => notificationController.getNotifications(req, res));
router.get('/notifications/unread-count', requireAuth, (req, res) => notificationController.getUnreadCount(req, res));
router.post(
    '/notifications/read',
    requireAuth,
    withTransaction((req, res) => notificationController.markRead(req, res))
);

export default router;
