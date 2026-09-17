import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    getNotificationsSchema,
    markNotificationsReadSchema,
} from '../schema/NotificationSchemas.ts';
import { NotificationService } from '../service/NotificationService.ts';

export class NotificationController {
    private notificationService: NotificationService;

    constructor(notificationService: NotificationService = new NotificationService()) {
        this.notificationService = notificationService;
    }

    getNotifications(req: Request, res: Response) {
        const { query } = getNotificationsSchema.parse(req);
        const limit = query?.limit ?? 50;
        const offset = query?.offset ?? 0;
        const notifications = this.notificationService.getUserNotifications(
            req.user!.userId,
            limit,
            offset
        );
        return res.status(StatusCodes.OK).json(notifications);
    }

    getUnreadCount(req: Request, res: Response) {
        const unreadCount = this.notificationService.getUnreadCount(req.user!.userId);
        return res.status(StatusCodes.OK).json({ unreadCount });
    }

    markRead(req: Request, res: Response) {
        const { body } = markNotificationsReadSchema.parse(req);
        const count = this.notificationService.markRead(
            req.user!.userId,
            body?.all ? undefined : body?.notificationIds
        );
        return res.status(StatusCodes.OK).json({ success: true, count });
    }
}
