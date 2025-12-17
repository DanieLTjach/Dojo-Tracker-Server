export interface User {
    id: number;
    name: string;
    telegram_username: string | null;
    telegram_id: number | null;
    is_admin: boolean;
    is_active: boolean;
    created_at: string;
    modified_at: string;
    modified_by: string;
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