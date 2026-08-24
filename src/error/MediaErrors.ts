import { StatusCodes } from 'http-status-codes';
import { BadRequestError, ResponseStatusError } from './BaseErrors.ts';

export class InvalidImageFileError extends BadRequestError {
    constructor() {
        super('invalidImageFile');
    }
}

export class NoImageFileProvidedError extends BadRequestError {
    constructor() {
        super('noImageFileProvided');
    }
}

export class ImageUploadFailedError extends ResponseStatusError {
    constructor() {
        super(StatusCodes.INTERNAL_SERVER_ERROR, 'imageUploadFailed');
    }
}
