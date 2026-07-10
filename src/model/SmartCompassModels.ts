export interface SmartCompassPairingCode {
    id: number;
    gameId: number;
    codeHash: string;
    expiresAt: Date;
    redeemedAt: Date | null;
    createdAt: Date;
    createdBy: number;
}

export interface SmartCompassSession {
    id: number;
    gameId: number;
    pairingCodeId: number;
    tokenHash: string;
    deviceLabel: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    createdBy: number;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface SmartCompassPairingCodeResponse {
    code: string;
    gameId: number;
    expiresAt: Date;
    ttlSeconds: number;
}

export interface SmartCompassSessionTokenResponse {
    accessToken: string;
    tokenType: 'Bearer';
    gameId: number;
    expiresAt: Date;
}

export interface SmartCompassSessionSummary {
    id: number;
    gameId: number;
    deviceLabel: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    createdBy: number;
    isActive: boolean;
}
