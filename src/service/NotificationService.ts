import { NotificationRepository } from '../repository/NotificationRepository.ts';
import type {
    CreateNotificationDTO,
    Notification,
} from '../model/NotificationModels.ts';

export class NotificationService {
    private notificationRepository: NotificationRepository;

    constructor(notificationRepository: NotificationRepository = new NotificationRepository()) {
        this.notificationRepository = notificationRepository;
    }

    notify(dto: CreateNotificationDTO): number | null {
        // Suppress self-notifications (e.g. liking or commenting on one's own post)
        if (dto.actorId && dto.actorId === dto.userId) {
            return null;
        }

        return this.notificationRepository.createNotification(dto);
    }

    getUserNotifications(userId: number, limit?: number, offset?: number): Notification[] {
        return this.notificationRepository.findNotificationsByUserId(userId, limit, offset);
    }

    getUnreadCount(userId: number): number {
        return this.notificationRepository.countUnreadByUserId(userId);
    }

    markRead(userId: number, notificationIds?: number[]): number {
        return this.notificationRepository.markRead(userId, notificationIds);
    }
}
