import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { ResponseStatusError } from "../error/errors.ts";
import { ZodError } from "zod";

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

    const status = err instanceof ResponseStatusError ? err.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({
        message: err.message || 'Internal Server Error',
    });
}