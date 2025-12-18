import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { ResponseStatusError } from "../error/BaseErrors.ts";
import { ZodError } from "zod";
import { SqliteError } from "better-sqlite3";

export const handleErrors = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`Error while processing request ${req.method} ${req.url} with body ${JSON.stringify(req.body)}`);
    console.error(err);

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