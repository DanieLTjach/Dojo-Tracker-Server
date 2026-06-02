import { StatusCodes } from "http-status-codes";
import { BadRequestError, ResponseStatusError } from "./BaseErrors.ts";
import { t, type TranslationParams } from "../i18n/index.ts";

// CsvParsingError messages live under the `import.*` i18n section (not `errors.*`), so it
// resolves the full key itself rather than going through the errorCode-prefixed base path.
export class CsvParsingError extends ResponseStatusError {
    constructor(messageKey: string, params?: TranslationParams) {
        super(StatusCodes.BAD_REQUEST, t(messageKey, params), 'csvParsingError');
        this.name = 'CsvParsingError';
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
