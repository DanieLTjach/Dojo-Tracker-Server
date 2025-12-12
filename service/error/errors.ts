import { StatusCodes } from "http-status-codes";

export class ResponseStatusError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = 'ResponseStatusError';
        this.statusCode = statusCode;
    }
}

export class BadRequestError extends ResponseStatusError {
    constructor(message: string) {
        super(StatusCodes.BAD_REQUEST, message);
        this.name = 'BadRequestError';
    }
}

export class ForbiddenError extends ResponseStatusError {
    constructor(message: string) {
        super(StatusCodes.FORBIDDEN, message);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ResponseStatusError {
    constructor(message: string) {
        super(StatusCodes.NOT_FOUND, message);
        this.name = 'NotFoundError';
    }
}

export class InternalServerError extends ResponseStatusError {
    constructor(message: string) {
        super(StatusCodes.INTERNAL_SERVER_ERROR, message);
        this.name = 'InternalServerError';
    }
}

export class DatabaseError extends InternalServerError {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}