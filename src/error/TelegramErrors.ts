export class TelegramReplyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TelegramReplyError';
    }
}

export class UserNotRegisteredTelegramError extends TelegramReplyError {
    constructor() {
        super('Ви повинні бути зареєстровані в додатку, щоб виконати цю дію');
    }
}

export class UserNotClubOwnerTelegramError extends TelegramReplyError {
    constructor() {
        super('Ви повинні бути власником клубу, щоб виконати цю дію');
    }
}

export class UserNotAdminTelegramError extends TelegramReplyError {
    constructor() {
        super('Ця команда доступна лише адміністраторам');
    }
}

export class NoActiveInvitesTelegramError extends TelegramReplyError {
    constructor() {
        super('У цьому клубі немає активних запрошень');
    }
}