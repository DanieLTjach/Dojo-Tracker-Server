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

export type DiscordExternalAuthInput =
    | { flow: 'BROWSER', code: string, codeVerifier: string }
    | { flow: 'ACTIVITY', code: string };

export type ExternalAuthProviderInput =
    | { credential: string }
    | { idToken: string }
    | DiscordExternalAuthInput;

export interface ExternalAuthProviderSession {
    provider: AuthProvider;
    accessToken: string;
    expiresIn: number;
}

export interface VerifiedExternalAuth {
    profile: VerifiedExternalProfile;
    providerSession?: ExternalAuthProviderSession;
}

export interface AvailableAuthProviderDTO {
    provider: AuthProvider;
    flows: ExternalAuthFlow[];
}

export interface ExternalAuthRegistrationRequired {
    registrationRequired: true;
    registrationToken: string;
    suggestedNickname: string;
    provider: AuthProvider;
    suggestedName: string | null;
    profile: {
        displayName: string | null;
        email: string | null;
        username: string | null;
    };
}

export interface PendingExternalAuthRegistration {
    tokenHash: string;
    profile: VerifiedExternalProfile;
    createdAt: Date;
    expiresAt: Date;
}

export interface AuthLinkCode {
    codeHash: string;
    userId: number;
    createdAt: Date;
    expiresAt: Date;
}

export interface LinkCodeDTO {
    code: string;
    expiresAt: string;
}

export interface LinkedAuthProviderDTO {
    provider: AuthProvider;
    displayName: string | null;
    email: string | null;
    username: string | null;
    linkedAt: string;
}
