import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatusError } from '../error/BaseErrors.ts';
import { ZodError } from 'zod';
import { SqliteError } from 'better-sqlite3';
import LogService from '../service/LogService.ts';
import { UserService } from '../service/UserService.ts';
import { DEFAULT_LOCALE, type SupportedLocale, t } from '../i18n/index.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';

const userService = new UserService();
const sensitiveRequestBodyKeys = new Set([
    'credential',
    'idToken',
    'id_token',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'g_csrf_token',
    'code_verifier',
    'codeVerifier',
    'code',
    'registrationToken',
    'client_secret',
    'clientSecret',
]);

export const handleErrors = (err: Error, req: Request, res: Response, next: NextFunction) => {
    let locale: SupportedLocale = DEFAULT_LOCALE;
    let userInfo = 'unknown';
    if (req.user?.userId) {
        try {
            const user = userService.getUserById(req.user.userId);
            userInfo = `${user.name} (ID: ${user.id})`;
            locale = resolveUserLocale(user);
        } catch {
            userInfo = `(ID: ${req.user.userId})`;
        }
    }
    LogService.logError(
        `Error while processing request ${req.method} ${req.url} from user ${userInfo} with body ${
            JSON.stringify(redactSensitiveRequestBody(req.body))
        }`,
        err
    );

    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof ZodError) {
        res.status(StatusCodes.BAD_REQUEST).json({
            error: 'Invalid request data',
            message: t('errors.invalidRequestData', locale),
            details: err.issues,
        });
        return;
    }

    if (err instanceof SqliteError) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: 'Database error',
            message: t('errors.databaseError', locale, { message: err.message }),
            details: err.message,
        });
        return;
    }

    const status = err instanceof ResponseStatusError ? err.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({
        errorCode: err instanceof ResponseStatusError ? err.errorCode : undefined,
        message: err instanceof ResponseStatusError
            ? err.getLocalizedMessage(locale)
            : err.message || t('errors.internalServerError', locale),
    });
};

function redactSensitiveRequestBody(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveRequestBody);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [
                key,
                sensitiveRequestBodyKeys.has(key) ? '[REDACTED]' : redactSensitiveRequestBody(nestedValue),
            ])
        );
    }
    return value;
}
