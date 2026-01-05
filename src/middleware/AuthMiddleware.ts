import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../service/TokenService.ts';
import {
    MissingAuthTokenError,
    InvalidAuthTokenError,
    InsufficientPermissionsError
} from '../error/AuthErrors.ts';
import { UserIsNotActive } from '../error/UserErrors.ts';
import type { DecodedToken } from '../model/AuthModels.ts';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: DecodedToken;
        }
    }
}

const tokenService = new TokenService();

/**
 * Middleware to require authentication.
 * Extracts and validates JWT token from Authorization header.
 * Attaches decoded user info to req.user.
 *
 * Usage: router.get('/protected', requireAuth, handler)
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new MissingAuthTokenError();
        }

        // Extract token from "Bearer <token>" format
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            throw new InvalidAuthTokenError('Invalid authorization header format. Expected: Bearer <token>');
        }

        const token = parts[1];

        // Verify and decode token
        const decoded = tokenService.verifyToken(token);

        // Check if user is active
        if (!decoded.isActive) {
            throw new UserIsNotActive(decoded.userId);
        }

        // Attach user to request
        req.user = decoded;

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
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    try {
        if (!req.user) {
            throw new MissingAuthTokenError();
        }

        if (!req.user.isAdmin) {
            throw new InsufficientPermissionsError('perform this action');
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware for optional authentication.
 * If token is present and valid, attaches user to req.user.
 * If no token or invalid token, continues without error.
 *
 * Usage: router.get('/maybe-protected', optionalAuth, handler)
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return next();
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return next();
        }

        const token = parts[1];
        const decoded = tokenService.verifyToken(token);

        if (decoded.isActive) {
            req.user = decoded;
        }

        next();
    } catch {
        // Silently continue without authentication
        next();
    }
};
