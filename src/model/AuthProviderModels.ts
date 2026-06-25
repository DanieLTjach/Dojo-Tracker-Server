import type { User } from './UserModels.ts';

export const AuthProvider = {
    GOOGLE: 'GOOGLE',
    TELEGRAM: 'TELEGRAM',
} as const;

export type AuthProvider = typeof AuthProvider[keyof typeof AuthProvider];

export interface AuthProviderIdentity {
    id: number;
    userId: number;
    provider: AuthProvider;
    providerUserId: string;
    displayName: string | null;
    email: string | null;
    username: string | null;
    createdAt: Date;
    modifiedAt: Date;
}

export interface AuthProviderIdentityWithUser extends AuthProviderIdentity {
    user: User;
}

export interface VerifiedExternalProfile {
    provider: AuthProvider;
    providerUserId: string;
    displayName?: string;
    email?: string;
    username?: string;
    telegramId?: number;
}

export interface ExternalAuthRegistrationRequired {
    registrationRequired: true;
    provider: AuthProvider;
    suggestedName: string | null;
    profile: {
        displayName: string | null;
        email: string | null;
        username: string | null;
    };
}

export interface LinkedAuthProviderDTO {
    provider: AuthProvider;
    displayName: string | null;
    email: string | null;
    username: string | null;
    linkedAt: string;
}
