import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';

export class NameAlreadyTakenByAnotherUser extends BadRequestError {
    constructor(name: string) {
        super('nameAlreadyTakenByAnotherUser', { name });
    }
}

export class NicknameAlreadyTakenError extends BadRequestError {
    constructor(nickname: string) {
        super('nicknameAlreadyTaken', { nickname });
    }
}

export class TelegramUsernameAlreadyTakenByAnotherUser extends BadRequestError {
    constructor(telegramUsername: string) {
        super('telegramUsernameAlreadyTakenByAnotherUser', { telegramUsername });
    }
}

export class UserWithThisTelegramIdAlreadyExists extends BadRequestError {
    constructor(telegramId: number) {
        super('userWithThisTelegramIdAlreadyExists', { telegramId });
    }
}

export class UserNotFoundById extends NotFoundError {
    constructor(id: number) {
        super('userNotFoundById', { id });
    }
}

export class UserNotFoundByTelegramId extends NotFoundError {
    constructor(telegramId: number) {
        super('userNotFoundByTelegramId', { telegramId });
    }
}

export class YouHaveToBeAdminToEditAnotherUser extends ForbiddenError {
    constructor() {
        super('youHaveToBeAdminToEditAnotherUser');
    }
}

export class UserIsNotActive extends ForbiddenError {
    constructor(id: number) {
        super('userIsNotActive', { id });
    }
}
