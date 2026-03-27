import type { Profile } from './ProfileModels.ts';

export const UserStatus = {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE'
} as const;

export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

export interface User {
    id: number;
    name: string;
    telegramUsername: string | null;
    telegramId: number | null;
    isAdmin: boolean;
    isActive: boolean;
    status: UserStatus;
    profile: Profile | null;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: string;
}

export interface UserShortDTO {
    id: number;
    name: string;
}