import { StatusCodes } from "http-status-codes";
import { t, type TranslationParams } from "../i18n/index.ts";

/**
 * Resolves an error's user-facing message from its errorCode via the i18n catalog
 * (`errors.<errorCode>`), interpolating any params. The errorCode doubles as the i18n key,
 * so message and code never drift apart.
 */
function resolveMessage(errorCode: string, params?: TranslationParams): string {
    return t(`errors.${errorCode}`, params);
}

export class ResponseStatusError extends Error {
    statusCode: number;
    errorCode: string | undefined;

    constructor(statusCode: number, message: string, errorCode?: string) {
        super(message);
        this.name = 'ResponseStatusError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }
}

export class BadRequestError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.BAD_REQUEST, resolveMessage(errorCode, params), errorCode);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.UNAUTHORIZED, resolveMessage(errorCode, params), errorCode);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.FORBIDDEN, resolveMessage(errorCode, params), errorCode);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.NOT_FOUND, resolveMessage(errorCode, params), errorCode);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.CONFLICT, resolveMessage(errorCode, params), errorCode);
        this.name = 'ConflictError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.INTERNAL_SERVER_ERROR, resolveMessage(errorCode, params), errorCode);
        this.name = 'InternalServerError';
    }
}
