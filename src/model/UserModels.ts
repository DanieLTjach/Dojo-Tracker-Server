export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';

export interface User {
    id: number;
    name: string;
    telegramUsername: string | null;
    telegramId: number | null;
    isAdmin: boolean;
    isActive: boolean;
    status: UserStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: string;
}

export interface UserShortDTO {
    id: number;
    name: string;
}