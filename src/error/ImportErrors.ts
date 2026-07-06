import { BadRequestError } from './BaseErrors.ts';

export class CsvMissingHeaderOrDataRowError extends BadRequestError {
    constructor() {
        super('import.csvMissingHeaderOrDataRow');
    }
}

export class CsvMissingRequiredColumnError extends BadRequestError {
    constructor(column: string) {
        super('import.csvMissingRequiredColumn', { column });
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
