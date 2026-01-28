import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { ResponseStatusError } from "../error/BaseErrors.ts";
import { ZodError } from "zod";
import { SqliteError } from "better-sqlite3";
import LogService from "../service/LogService.ts";
import { UserService } from "../service/UserService.ts";

const userService = new UserService();

export const handleErrors = (err: Error, req: Request, res: Response, next: NextFunction) => {
    let userInfo = 'unknown';
    if (req.user?.userId) {
        try {
            const user = userService.getUserById(req.user.userId);
            userInfo = `${user.name} (ID: ${user.id})`;
        } catch {
            userInfo = `(ID: ${req.user.userId})`;
        }
    }
    LogService.logError(`Error while processing request ${req.method} ${req.url} from user ${userInfo} with body ${JSON.stringify(req.body)}`, err);

    if (res.headersSent) {
        return next(err)
    }

    if (err instanceof ZodError) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid request data', details: err.issues });
        return;
    }

    if (err instanceof SqliteError) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Database error', details: err.message });
        return;
    }

    const status = err instanceof ResponseStatusError ? err.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({
        errorCode: err instanceof ResponseStatusError ? err.errorCode : undefined,
        message: err.message || 'Internal Server Error',
    });
}