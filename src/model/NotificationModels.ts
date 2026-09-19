export type NotificationType =
    | 'POST_LIKE'
    | 'POST_COMMENT'
    | 'COMMENT_LIKE'
    | 'ACHIEVEMENT_UNLOCK'
    | 'SYSTEM';

export interface Notification {
    id: number;
    userId: number;
    type: NotificationType;
    actorId: number | null;
    postId: number | null;
    commentId: number | null;
    achievementCode: string | null;
    scope: string | null;
    payload: string | null;
    readAt: string | null;
    createdAt: string;
    actorName?: string | null;
    actorAvatarUrl?: string | null;
}

export interface CreateNotificationDTO {
    userId: number;
    type: NotificationType;
    actorId?: number | null;
    postId?: number | null;
    commentId?: number | null;
    achievementCode?: string | null;
    scope?: string | null;
    payload?: string | null;
}
