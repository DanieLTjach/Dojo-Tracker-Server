import { ForbiddenError, NotFoundError } from "../error/errors.ts";

export class UserWithTelegramIdAlreadyExists extends ForbiddenError {
    constructor(telegramId: number) {
        super(`User with telegram id ${telegramId} already exists`);
    }
}

export class UserNotFoundById extends NotFoundError {
    constructor(id: number) {
        super(`User with id ${id} not found`);
    }
}

export class UserNotFoundByTelegramId extends NotFoundError {
    constructor(telegramId: number) {
        super(`User with telegram id ${telegramId} not found`);
    }
}

export class UserIsNotAdmin extends ForbiddenError {
    constructor(id: number) {
        super(`User with id ${id} is not an admin`);
    }
}