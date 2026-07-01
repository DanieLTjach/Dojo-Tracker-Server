import crypto from 'crypto';
import config from '../../config/config.ts';
import {
    CannotPairFinishedGameError,
    InvalidSmartCompassPairingCodeError,
    InvalidSmartCompassSessionTokenError,
    SmartCompassSessionExpiredError,
    SmartCompassSessionForFinishedGameError,
    SmartCompassSessionNotFoundError,
    SmartCompassSessionScopeError,
} from '../error/SmartCompassErrors.ts';
import { GameStatus } from '../model/GameModels.ts';
import type {
    SmartCompassPairingCodeResponse,
    SmartCompassSession,
    SmartCompassSessionSummary,
    SmartCompassSessionTokenResponse,
} from '../model/SmartCompassModels.ts';
import { SmartCompassRepository } from '../repository/SmartCompassRepository.ts';
import { HashUtil } from '../util/HashUtil.ts';
import { EventService } from './EventService.ts';
import { GameService } from './GameService.ts';
import { UserService } from './UserService.ts';

const PAIRING_CODE_DIGITS = 8;
const PAIRING_CODE_MODULUS = 100_000_000;
const TOKEN_BYTES = 32;
const GENERATION_ATTEMPTS = 20;

export class SmartCompassAuthService {
    private repository: SmartCompassRepository = new SmartCompassRepository();
    private gameService: GameService = new GameService();
    private eventService: EventService = new EventService();
    private userService: UserService = new UserService();

    createPairingCode(gameId: number, createdBy: number): SmartCompassPairingCodeResponse {
        this.authorizeGamePairing(gameId, createdBy);

        const now = new Date();
        const expiresAt = addSeconds(now, config.smartCompassPairingTtlSeconds);
        const { code, codeHash } = this.generateUniquePairingCode();

        this.repository.createPairingCode({
            gameId,
            codeHash,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy,
        });

        return {
            code,
            gameId,
            expiresAt,
            ttlSeconds: config.smartCompassPairingTtlSeconds,
        };
    }

    redeemPairingCode(code: string, deviceLabel: string | null): SmartCompassSessionTokenResponse {
        const pairingCode = this.repository.findPairingCodeByHash(this.hashPairingCode(code));
        if (
            pairingCode === undefined || pairingCode.redeemedAt !== null ||
            pairingCode.expiresAt.getTime() <= Date.now()
        ) {
            throw new InvalidSmartCompassPairingCodeError();
        }

        const game = this.gameService.getGameById(pairingCode.gameId);
        if (game.status === GameStatus.FINISHED) {
            throw new CannotPairFinishedGameError();
        }

        const now = new Date();
        const expiresAt = addSeconds(now, config.smartCompassSessionTtlSeconds);
        const { token, tokenHash } = this.generateSessionToken();

        this.repository.createSession({
            gameId: pairingCode.gameId,
            pairingCodeId: pairingCode.id,
            tokenHash,
            deviceLabel,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy: pairingCode.createdBy,
            modifiedAt: now.toISOString(),
            modifiedBy: pairingCode.createdBy,
        });
        this.repository.markPairingCodeRedeemed(pairingCode.id, now);

        return {
            accessToken: token,
            tokenType: 'Bearer',
            gameId: pairingCode.gameId,
            expiresAt,
        };
    }

    validateSessionTokenForGame(gameId: number, token: string): SmartCompassSession {
        const session = this.repository.findSessionByTokenHash(this.hashSessionToken(token));
        if (session === undefined || session.revokedAt !== null) {
            throw new InvalidSmartCompassSessionTokenError();
        }
        if (session.gameId !== gameId) {
            throw new SmartCompassSessionScopeError();
        }
        if (session.expiresAt.getTime() <= Date.now()) {
            throw new SmartCompassSessionExpiredError();
        }

        const user = this.userService.getUserById(session.createdBy);
        if (!user.isActive) {
            throw new InvalidSmartCompassSessionTokenError();
        }

        const game = this.gameService.getGameById(gameId);
        if (game.status === GameStatus.FINISHED) {
            throw new SmartCompassSessionForFinishedGameError();
        }

        this.repository.touchSession(session.id, new Date());
        return session;
    }

    listSessions(gameId: number, requestedBy: number): SmartCompassSessionSummary[] {
        this.authorizeGameAccess(gameId, requestedBy);
        return this.repository.findSessionsByGameId(gameId).map(toSessionSummary);
    }

    revokeSession(gameId: number, sessionId: number, revokedBy: number): void {
        this.authorizeGameAccess(gameId, revokedBy);

        const session = this.repository.findSessionById(sessionId);
        if (session === undefined || session.gameId !== gameId) {
            throw new SmartCompassSessionNotFoundError(sessionId);
        }

        this.repository.revokeSession(sessionId, new Date(), revokedBy);
    }

    private authorizeGamePairing(gameId: number, userId: number): void {
        const game = this.authorizeGameAccess(gameId, userId);
        if (game.status === GameStatus.FINISHED) {
            throw new CannotPairFinishedGameError();
        }
    }

    private authorizeGameAccess(gameId: number, userId: number) {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);
        this.gameService.authorizeTrackedGameAction(game, event, userId);
        return game;
    }

    private generateUniquePairingCode(): { code: string, codeHash: string } {
        for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
            const code = crypto.randomInt(PAIRING_CODE_MODULUS).toString().padStart(PAIRING_CODE_DIGITS, '0');
            const codeHash = this.hashPairingCode(code);
            if (!this.repository.pairingCodeHashExists(codeHash)) {
                return { code, codeHash };
            }
        }
        throw new Error('Failed to generate a unique Smart Compass pairing code');
    }

    private generateSessionToken(): { token: string, tokenHash: string } {
        const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
        return { token, tokenHash: this.hashSessionToken(token) };
    }

    private hashPairingCode(code: string): string {
        return this.hashSecret(`pairing:${code}`);
    }

    private hashSessionToken(token: string): string {
        return this.hashSecret(`session:${token}`);
    }

    private hashSecret(value: string): string {
        return HashUtil.hmac(value, config.jwtSecret).toString('hex');
    }
}

function addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
}

function toSessionSummary(session: SmartCompassSession): SmartCompassSessionSummary {
    return {
        id: session.id,
        gameId: session.gameId,
        deviceLabel: session.deviceLabel,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        lastUsedAt: session.lastUsedAt,
        createdAt: session.createdAt,
        createdBy: session.createdBy,
        isActive: session.revokedAt === null && session.expiresAt.getTime() > Date.now(),
    };
}
