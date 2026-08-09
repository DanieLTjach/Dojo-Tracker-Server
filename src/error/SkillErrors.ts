import { BadRequestError } from './BaseErrors.ts';

export class InvalidGameSizeError extends BadRequestError {
    constructor(gameSize: number) {
        super('invalidGameSize', { gameSize });
    }
}
