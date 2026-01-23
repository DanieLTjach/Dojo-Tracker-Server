import { BadRequestError, ForbiddenError, NotFoundError } from "./BaseErrors.ts";

export class NameAlreadyTakenByAnotherUser extends BadRequestError {
    constructor(name: string) {
        super(`Ім'я '${name}' вже зайняте іншим користувачем`, 'nameAlreadyTakenByAnotherUser');
    }
}

export class TelegramUsernameAlreadyTakenByAnotherUser extends BadRequestError {
    constructor(telegramUsername: string) {
        super(`Telegram юзернейм '${telegramUsername}' вже зайнятий іншим користувачем`, 'telegramUsernameAlreadyTakenByAnotherUser');
    }
}

export class UserWithThisTelegramIdAlreadyExists extends BadRequestError {
    constructor(telegramId: number) {
        super(`Користувач з Telegram id ${telegramId} вже існує`, 'userWithThisTelegramIdAlreadyExists');
    }
}

export class UserNotFoundById extends NotFoundError {
    constructor(id: number) {
        super(`Користувача з id ${id} не знайдено`, 'userNotFoundById');
    }
}

export class UserNotFoundByTelegramId extends NotFoundError {
    constructor(telegramId: number) {
        super(`Користувача з Telegram id ${telegramId} не знайдено`, 'userNotFoundByTelegramId');
    }
}

export class YouHaveToBeAdminToEditAnotherUser extends ForbiddenError {
    constructor() {
        super('Щоб редагувати іншого користувача, ви повинні бути адміністратором', 'youHaveToBeAdminToEditAnotherUser');
    }
}

export class UserIsNotActive extends ForbiddenError {
    constructor(id: number) {
        super(`Користувач з id ${id} не активний`, 'userIsNotActive');
    }
}