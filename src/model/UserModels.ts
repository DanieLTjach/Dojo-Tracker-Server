export interface User {
    id: number;
    name: string;
    telegramUsername: string | null;
    telegramId: number | null;
    isAdmin: boolean;
    isActive: boolean;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: string;
}