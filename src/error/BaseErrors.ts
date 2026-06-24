import { StatusCodes } from 'http-status-codes';
import { t, type TranslationParams } from '../i18n/index.ts';

type ErrorCodeOrParams = string | TranslationParams;

function resolveErrorArgs(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
    if (typeof errorCodeOrParams === 'object') {
        return {
            message: t(`errors.${messageOrErrorCode}`, errorCodeOrParams),
            errorCode: messageOrErrorCode,
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
    };
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
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.BAD_REQUEST, message, errorCode);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.UNAUTHORIZED, message, errorCode);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.FORBIDDEN, message, errorCode);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.NOT_FOUND, message, errorCode);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.CONFLICT, message, errorCode);
        this.name = 'ConflictError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(messageOrErrorCode: string, errorCodeOrParams?: ErrorCodeOrParams) {
        const { message, errorCode } = resolveErrorArgs(messageOrErrorCode, errorCodeOrParams);
        super(StatusCodes.INTERNAL_SERVER_ERROR, message, errorCode);
        this.name = 'InternalServerError';
    }
}
