import { BadRequestError, ForbiddenError, NotFoundError } from "./BaseErrors.ts";

export class UserWithThisNameAlreadyExists extends BadRequestError {
    constructor(name: string) {
        super(`User with name ${name} already exists`, 'userWithThisNameAlreadyExists');
    }
}

export class UserWithThisTelegramUsernameAlreadyExists extends BadRequestError {
    constructor(telegramUsername: string) {
        super(`User with telegram username ${telegramUsername} already exists`, 'userWithThisTelegramUsernameAlreadyExists');
    }
}

export class UserWithThisTelegramIdAlreadyExists extends BadRequestError {
    constructor(telegramId: number) {
        super(`User with telegram id ${telegramId} already exists`, 'userWithThisTelegramIdAlreadyExists');
    }
}

export class UserNotFoundById extends NotFoundError {
    constructor(id: number) {
        super(`User with id ${id} not found`, 'userNotFoundById');
    }
}

export class UserNotFoundByTelegramId extends NotFoundError {
    constructor(telegramId: number) {
        super(`User with telegram id ${telegramId} not found`, 'userNotFoundByTelegramId');
    }
}

export class UserIsNotAdmin extends ForbiddenError {
    constructor(id: number) {
        super(`User with id ${id} is not an admin`, 'userIsNotAdmin');
    }
}

export class UserNotFoundByTelegramUsername extends NotFoundError {
    constructor(telegramUsername: string) {
        super(`User not found with telegram username: ${telegramUsername}`, 'userNotFoundByTelegramUsername');
    }
}

export class UserNotFoundByName extends NotFoundError {
    constructor(name: string) {
        super(`User not found with name: ${name}`, 'userNotFoundByName');
    }
}

export class MissingUserInformationError extends BadRequestError {
    constructor() {
        super('User information must contain either telegramUsername or name', 'missingUserInformation');
    }
}