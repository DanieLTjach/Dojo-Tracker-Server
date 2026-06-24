import { BadRequestError } from './BaseErrors.ts';

export class CsvParsingError extends BadRequestError {
    constructor(message: string) {
        super(message, 'csvParsingError');
    }
}

export class UserNotFoundByUsernameError extends BadRequestError {
    constructor(username: string) {
        super('userNotFoundByUsername', { username });
    }
}

export class NoValidGamesInCsvError extends BadRequestError {
    constructor() {
        super('noValidGamesInCsv');
    }
}
