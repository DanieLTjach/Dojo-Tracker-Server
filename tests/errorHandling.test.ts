import type { Request, Response, NextFunction } from 'express';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { StatusCodes } from 'http-status-codes';
import { BadRequestError, NotFoundError } from '../src/error/BaseErrors.ts';
import { ZodError } from 'zod';
import { SqliteError } from 'better-sqlite3';
import { jest } from '@jest/globals';

describe('ErrorHandling Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
        mockReq = {
            method: 'GET',
            url: '/test',
            body: { test: 'data' }
        };
        mockRes = {
            status: jest.fn().mockReturnThis() as any,
            json: jest.fn().mockReturnThis() as any,
            headersSent: false
        };
        mockNext = jest.fn();
        consoleErrorSpy = jest.spyOn(console, 'error');
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('should handle ZodError and return 400 with error details', () => {
        const zodError = new ZodError([
            {
                code: 'invalid_type',
                expected: 'string',
                path: ['name'],
                message: 'Expected string, received number'
            }
        ]);

        handleErrors(zodError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockRes.json).toHaveBeenCalledWith({
            error: 'Invalid request data',
            details: zodError.issues
        });
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle SqliteError and return 500 with error details', () => {
        const sqliteError = new SqliteError('UNIQUE constraint failed', 'SQLITE_CONSTRAINT_UNIQUE');

        handleErrors(sqliteError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            error: 'Database error',
            details: sqliteError.message
        });
    });

    it('should handle ResponseStatusError with correct status code and error code', () => {
        const customError = new BadRequestError('Invalid input', 'invalidInput');

        handleErrors(customError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: 'invalidInput',
            message: 'Invalid input'
        });
    });

    it('should handle NotFoundError with 404 status', () => {
        const notFoundError = new NotFoundError('Resource not found', 'notFound');

        handleErrors(notFoundError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: 'notFound',
            message: 'Resource not found'
        });
    });

    it('should handle generic Error with 500 status and no error code', () => {
        const genericError = new Error('Something went wrong');

        handleErrors(genericError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: undefined,
            message: 'Something went wrong'
        });
    });

    it('should use default message for error without message', () => {
        const errorWithoutMessage = new Error();
        errorWithoutMessage.message = '';

        handleErrors(errorWithoutMessage, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: undefined,
            message: 'Internal Server Error'
        });
    });

    it('should call next if headers already sent', () => {
        const error = new Error('Test error');
        mockRes.headersSent = true;

        handleErrors(error, mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(error);
        expect(mockRes.status).not.toHaveBeenCalled();
        expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should log request information and error', () => {
        const error = new Error('Test error');

        handleErrors(error, mockReq as Request, mockRes as Response, mockNext);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Error while processing request GET /test with body {"test":"data"}'
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });
});
