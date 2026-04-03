import { BadRequestError } from "./BaseErrors.ts";

export class CsvParsingError extends BadRequestError {
    constructor(message: string) {
        super(message, 'csvParsingError');
    }
}

export class UserNotFoundByUsernameError extends BadRequestError {
    constructor(username: string) {
        super(`Користувача з Telegram username ${username} не знайдено`, 'userNotFoundByUsername');
    }
}

export class NoValidGamesInCsvError extends BadRequestError {
    constructor() {
        super('У CSV файлі не знайдено жодної валідної гри', 'noValidGamesInCsv');
    }
}
