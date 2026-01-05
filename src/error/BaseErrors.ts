import { StatusCodes } from "http-status-codes";

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
    constructor(message: string, errorCode?: string) {
        super(StatusCodes.BAD_REQUEST, message, errorCode);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ResponseStatusError {
    constructor(message: string, errorCode?: string) {
        super(StatusCodes.UNAUTHORIZED, message, errorCode);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(message: string, errorCode?: string) {
        super(StatusCodes.FORBIDDEN, message, errorCode);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(message: string, errorCode?: string) {
        super(StatusCodes.NOT_FOUND, message, errorCode);
        this.name = 'NotFoundError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(message: string, errorCode?: string) {
        super(StatusCodes.INTERNAL_SERVER_ERROR, message, errorCode);
        this.name = 'InternalServerError';
    }
}