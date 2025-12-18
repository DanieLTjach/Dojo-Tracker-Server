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

export interface UnresolvedUserInfo {
    telegramUsername?: string | undefined;
    name?: string | undefined;
}

export interface ResolvedUserInfo {
    id: number;
    telegramUsername?: string | undefined;
    name?: string | undefined;
}