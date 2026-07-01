import type { Request, Response, NextFunction } from 'express';
import config from '../../config/config.ts';
import {
    InvalidAuthTokenError,
    MissingAuthTokenError,
} from '../error/AuthErrors.ts';
import type { DecodedToken } from '../model/AuthModels.ts';
import type { SmartCompassSession } from '../model/SmartCompassModels.ts';
import { SmartCompassAuthService } from '../service/SmartCompassAuthService.ts';
import { TokenService } from '../service/TokenService.ts';
import { UserService } from '../service/UserService.ts';

declare global {
    namespace Express {
        interface Request {
            smartCompassSession?: SmartCompassSession | undefined;
        }
    }
}

const tokenService = new TokenService();
const userService = new UserService();
const smartCompassAuthService = new SmartCompassAuthService();

export const requireJwtOrSmartCompassGameAuth = (req: Request, _res: Response, next: NextFunction): void => {
    try {
        if (config.tournamentMode) {
            req.user = { userId: config.tournamentUserId! };
            next();
            return;
        }

        const token = getBearerToken(req);
        if (tokenLooksLikeJwt(token)) {
            req.user = authenticateJwtToken(token);
            next();
            return;
        }

        const gameId = Number(req.params['gameId']);
        if (!Number.isInteger(gameId)) {
            throw new InvalidAuthTokenError('Smart Compass token can only be used with a numeric game id');
        }

        const session = smartCompassAuthService.validateSessionTokenForGame(gameId, token);
        req.user = { userId: session.createdBy };
        req.smartCompassSession = session;
        next();
    } catch (error) {
        next(error);
    }
};

function getBearerToken(req: Request): string {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        throw new MissingAuthTokenError();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new InvalidAuthTokenError('Invalid authorization header format. Expected: Bearer <token>');
    }

    return parts[1]!;
}

function tokenLooksLikeJwt(token: string): boolean {
    return token.split('.').length === 3;
}

function authenticateJwtToken(token: string): DecodedToken {
    const decodedToken = tokenService.verifyToken(token);
    const user = userService.getUserById(decodedToken.userId);
    if (!user.isActive) {
        throw new InvalidAuthTokenError('User is not active');
    }
    return decodedToken;
}
