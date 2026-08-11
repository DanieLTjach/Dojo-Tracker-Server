import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatusError } from '../error/BaseErrors.ts';
import { ZodError } from 'zod';
import { SqliteError } from 'better-sqlite3';
import LogService from '../service/LogService.ts';
import { UserService } from '../service/UserService.ts';
import { DEFAULT_LOCALE, type SupportedLocale, t } from '../i18n/index.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';
import { normalizeGameRulesValidationIssues } from '../util/GameRulesValidationUtil.ts';

const userService = new UserService();

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
            JSON.stringify(req.body)
        }`,
        err
    );

    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof ZodError) {
        const requestPath = req.originalUrl ?? `${req.baseUrl ?? ''}${req.url}`;
        if (requestPath.startsWith('/api/game-rules')) {
            res.status(StatusCodes.BAD_REQUEST).json({
                errorCode: 'gameRulesValidationFailed',
                message: t('errors.gameRulesValidationFailed', locale),
                validationErrors: normalizeGameRulesValidationIssues(err.issues, locale),
            });
            return;
        }

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
