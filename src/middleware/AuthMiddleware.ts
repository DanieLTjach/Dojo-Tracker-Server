import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../service/TokenService.ts';
import { UserService } from '../service/UserService.ts';
import {
    MissingAuthTokenError,
    InvalidAuthTokenError,
    InsufficientPermissionsError
} from '../error/AuthErrors.ts';
import type { DecodedToken } from '../model/AuthModels.ts';
import config from '../../config/config.ts';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: DecodedToken | undefined;
        }
    }
}

const tokenService = new TokenService();
const userService = new UserService();

/**
 * Middleware to require authentication.
 * In tournament mode, bypasses token validation and uses configured user ID.
 * Otherwise, extracts and validates JWT token from Authorization header.
 * Attaches decoded user info to req.user.
 *
 * Usage: router.get('/protected', requireAuth, handler)
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
    try {
        // Tournament mode: bypass authentication
        if (config.tournamentMode) {
            req.user = { userId: config.tournamentUserId! };
            next();
            return;
        }

        // Normal mode: validate JWT token
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new MissingAuthTokenError();
        }

        // Extract token from "Bearer <token>" format
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            throw new InvalidAuthTokenError('Invalid authorization header format. Expected: Bearer <token>');
        }

        const token = parts[1]!;

        // Verify and decode token
        const decodedToken = tokenService.verifyToken(token);

        // User could have been deactivated since token was issued
        const user = userService.getUserById(decodedToken.userId);
        if (!user.isActive) {
            throw new InvalidAuthTokenError('User is not active');
        }

        // Attach user to request
        req.user = decodedToken;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware to require admin privileges.
 * Must be used AFTER requireAuth middleware.
 *
 * Usage: router.delete('/admin-only', requireAuth, requireAdmin, handler)
 */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
    try {
        if (!req.user) {
            throw new MissingAuthTokenError();
        }

        const user = userService.getUserById(req.user.userId);
        if (!user.isAdmin) {
            throw new InsufficientPermissionsError(); 
        }

        next();
    } catch (error) {
        next(error);
    }
};
