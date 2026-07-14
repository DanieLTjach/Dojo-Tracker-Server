import type { Request, Response, NextFunction } from 'express';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatusError } from '../src/error/BaseErrors.ts';
import { ZodError } from 'zod';
import { SqliteError } from 'better-sqlite3';
import { NOTEN_PENALTY_DIVISIBILITY_MESSAGE } from '../src/schema/GameRulesSchemas.ts';
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
            body: { test: 'data' },
            user: { userId: 123 },
        };
        mockRes = {
            status: jest.fn().mockReturnThis() as any,
            json: jest.fn().mockReturnThis() as any,
            headersSent: false,
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
                message: 'Expected string, received number',
            },
        ]);

        handleErrors(zodError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockRes.json).toHaveBeenCalledWith({
            error: 'Invalid request data',
            message: 'Некоректні дані запиту',
            details: zodError.issues,
        });
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should return localized field errors without raw Zod data for game-rules requests', () => {
        mockReq.url = '/api/game-rules';
        const zodError = new ZodError([
            {
                code: 'custom',
                path: ['body', 'details', 'rules', 'noten_penalty'],
                message: NOTEN_PENALTY_DIVISIBILITY_MESSAGE,
            },
        ]);

        handleErrors(zodError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: 'gameRulesValidationFailed',
            message: 'Виправте виділені поля правил гри',
            validationErrors: [{
                path: 'details.rules.noten_penalty',
                code: 'notenPenaltySplit',
                message: 'Штраф за нотен має ділитися на цілу кількість очок для цієї кількості гравців.',
            }],
        });
    });

    it('should handle SqliteError and return 500 with error details', () => {
        const sqliteError = new SqliteError('UNIQUE constraint failed', 'SQLITE_CONSTRAINT_UNIQUE');

        handleErrors(sqliteError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            error: 'Database error',
            message: 'Помилка бази даних: UNIQUE constraint failed',
            details: sqliteError.message,
        });
    });

    it('should handle ResponseStatusError with correct status code and error code', () => {
        const customError = new ResponseStatusError(StatusCodes.BAD_REQUEST, 'invalidInput');

        handleErrors(customError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: 'invalidInput',
            message: 'errors.invalidInput',
        });
    });

    it('should handle NotFoundError with 404 status', () => {
        const notFoundError = new ResponseStatusError(StatusCodes.NOT_FOUND, 'notFound');

        handleErrors(notFoundError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: 'notFound',
            message: 'errors.notFound',
        });
    });

    it('should handle generic Error with 500 status and no error code', () => {
        const genericError = new Error('Something went wrong');

        handleErrors(genericError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: undefined,
            message: 'Something went wrong',
        });
    });

    it('should use default message for error without message', () => {
        const errorWithoutMessage = new Error();
        errorWithoutMessage.message = '';

        handleErrors(errorWithoutMessage, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(mockRes.json).toHaveBeenCalledWith({
            errorCode: undefined,
            message: 'Внутрішня помилка сервера',
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
            'Error while processing request GET /test from user (ID: 123) with body {"test":"data"}',
            error
        );
    });
});
