import { StatusCodes } from 'http-status-codes';
import { t, type TranslationParams } from '../i18n/index.ts';

type ErrorCodeOrParams = string | TranslationParams;

function resolveErrorArgs(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
    if (typeof errorCodeOrParams === 'object') {
        const translationKey = `errors.${messageOrErrorCode}`;
        return {
            message: t(translationKey, errorCodeOrParams),
            errorCode: messageOrErrorCode,
            translationKey,
            translationParams: errorCodeOrParams,
        };
    }

    if (typeof errorCodeOrParams === 'string') {
        return {
            message: messageOrErrorCode,
            errorCode: errorCodeOrParams,
        };
    }

    const key = `errors.${messageOrErrorCode}`;
    const translated = t(key);
    return {
        message: translated === key ? messageOrErrorCode : translated,
        errorCode: translated === key ? undefined : messageOrErrorCode,
        translationKey: translated === key ? undefined : key,
        translationParams: undefined,
    };
}

export class ResponseStatusError extends Error {
    statusCode: number;
    errorCode: string | undefined;
    translationKey: string | undefined;
    translationParams: TranslationParams | undefined;

    constructor(
        statusCode: number,
        message: string,
        errorCode?: string,
        translationKey?: string,
        translationParams?: TranslationParams
    ) {
        super(message);
        this.name = 'ResponseStatusError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.translationKey = translationKey;
        this.translationParams = translationParams;
    }

    getLocalizedMessage(locale?: string | null): string {
        if (this.translationKey === undefined) {
            return this.message;
        }
        return t(this.translationKey, this.translationParams, locale);
    }
}

export class BadRequestError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.BAD_REQUEST, message, errorCode, translationKey, translationParams);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.UNAUTHORIZED, message, errorCode, translationKey, translationParams);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.FORBIDDEN, message, errorCode, translationKey, translationParams);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.NOT_FOUND, message, errorCode, translationKey, translationParams);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.CONFLICT, message, errorCode, translationKey, translationParams);
        this.name = 'ConflictError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode, translationKey, translationParams } = resolveErrorArgs(
            messageOrErrorCode,
            errorCodeOrParams
        );
        super(StatusCodes.INTERNAL_SERVER_ERROR, message, errorCode, translationKey, translationParams);
        this.name = 'InternalServerError';
    }
}
