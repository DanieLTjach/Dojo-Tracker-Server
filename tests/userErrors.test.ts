import {
    UserWithThisNameAlreadyExists,
    UserWithThisTelegramUsernameAlreadyExists,
    UserWithThisTelegramIdAlreadyExists,
    UserNotFoundById,
    UserNotFoundByTelegramId,
    UserNotFoundByTelegramUsername,
    UserNotFoundByName,
    MissingUserInformationError,
    UserIsNotAdmin,
    UserIsNotActive
} from '../src/error/UserErrors.ts';
import { StatusCodes } from 'http-status-codes';

describe('UserErrors', () => {
    describe('UserWithThisNameAlreadyExists', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserWithThisNameAlreadyExists('John Doe');

            expect(error.message).toBe('User with name John Doe already exists');
            expect(error.errorCode).toBe('userWithThisNameAlreadyExists');
            expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
        });
    });

    describe('UserWithThisTelegramUsernameAlreadyExists', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserWithThisTelegramUsernameAlreadyExists('@johndoe');

            expect(error.message).toBe('User with telegram username @johndoe already exists');
            expect(error.errorCode).toBe('userWithThisTelegramUsernameAlreadyExists');
            expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
        });
    });

    describe('UserWithThisTelegramIdAlreadyExists', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserWithThisTelegramIdAlreadyExists(123456789);

            expect(error.message).toBe('User with telegram id 123456789 already exists');
            expect(error.errorCode).toBe('userWithThisTelegramIdAlreadyExists');
            expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
        });
    });

    describe('UserNotFoundById', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserNotFoundById(42);

            expect(error.message).toBe('User with id 42 not found');
            expect(error.errorCode).toBe('userNotFoundById');
            expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
        });
    });

    describe('UserNotFoundByTelegramId', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserNotFoundByTelegramId(987654321);

            expect(error.message).toBe('User with telegram id 987654321 not found');
            expect(error.errorCode).toBe('userNotFoundByTelegramId');
            expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
        });
    });

    describe('UserNotFoundByTelegramUsername', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserNotFoundByTelegramUsername('@missing');

            expect(error.message).toBe('User not found with telegram username: @missing');
            expect(error.errorCode).toBe('userNotFoundByTelegramUsername');
            expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
        });
    });

    describe('UserNotFoundByName', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserNotFoundByName('Missing Person');

            expect(error.message).toBe('User not found with name: Missing Person');
            expect(error.errorCode).toBe('userNotFoundByName');
            expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
        });
    });

    describe('MissingUserInformationError', () => {
        it('should create error with correct message and error code', () => {
            const error = new MissingUserInformationError();

            expect(error.message).toBe('User information must contain either telegramUsername or name');
            expect(error.errorCode).toBe('missingUserInformation');
            expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
        });
    });

    describe('UserIsNotAdmin', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserIsNotAdmin(5);

            expect(error.message).toBe('User with id 5 is not an admin');
            expect(error.errorCode).toBe('userIsNotAdmin');
            expect(error.statusCode).toBe(StatusCodes.FORBIDDEN);
        });
    });

    describe('UserIsNotActive', () => {
        it('should create error with correct message and error code', () => {
            const error = new UserIsNotActive(10);

            expect(error.message).toBe('User with id 10 is not active');
            expect(error.errorCode).toBe('userIsNotActive');
            expect(error.statusCode).toBe(StatusCodes.FORBIDDEN);
        });
    });
});
