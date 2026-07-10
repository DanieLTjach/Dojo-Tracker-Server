export const AuthProvider = {
    GOOGLE: 'GOOGLE',
    TELEGRAM: 'TELEGRAM',
    DISCORD: 'DISCORD',
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

export interface VerifiedExternalProfile {
    provider: AuthProvider;
    providerUserId: string;
    displayName?: string;
    email?: string;
    username?: string;
    telegramId?: number;
}

export type ExternalAuthFlow = 'BROWSER' | 'ACTIVITY';

export type ExternalAuthProviderInput =
    | { credential: string }
    | { idToken: string }
    | { code: string };

export interface VerifiedExternalAuth {
    profile: VerifiedExternalProfile;
}

export interface AvailableAuthProviderDTO {
    provider: AuthProvider;
    flows: ExternalAuthFlow[];
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
