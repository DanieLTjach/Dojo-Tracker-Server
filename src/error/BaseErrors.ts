import { StatusCodes } from 'http-status-codes';
import { DEFAULT_LOCALE, type SupportedLocale, t, type TranslationParams } from '../i18n/index.ts';

export class ResponseStatusError extends Error {
    statusCode: number;
    errorCode: string;
    translationKey: string;
    params: TranslationParams | undefined;

    constructor(
        statusCode: number,
        errorCode: string,
        params?: TranslationParams
    ) {
        const translationKey = `errors.${errorCode}`;
        super(t(translationKey, DEFAULT_LOCALE, params));
        this.name = 'ResponseStatusError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.translationKey = translationKey;
        this.params = params;
    }

    getLocalizedMessage(locale: SupportedLocale): string {
        return t(this.translationKey, locale, this.params);
    }
}

export class BadRequestError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.BAD_REQUEST, errorCode, params);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.UNAUTHORIZED, errorCode, params);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.FORBIDDEN, errorCode, params);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.NOT_FOUND, errorCode, params);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.CONFLICT, errorCode, params);
        this.name = 'ConflictError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(errorCode: string, params?: TranslationParams) {
        super(StatusCodes.INTERNAL_SERVER_ERROR, errorCode, params);
        this.name = 'InternalServerError';
    }
}
