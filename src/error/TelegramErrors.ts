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

export class CannotDeleteGameRulesInUseTelegramError extends TelegramReplyError {
    constructor(gameRulesName: string, eventCount: number) {
        super(`Неможливо видалити правила "${gameRulesName}" — вони використовуються в ${eventCount} подіях`);
    }
}

export class TelegramPendingCreationMissingError extends TelegramReplyError {
    constructor() {
        super('Сесію створення правил не знайдено або вона закінчилася. Спробуйте ще раз: /game_rules');
    }
}