import { InternalServerError } from './BaseErrors.ts';

export class UserRatingChangeInGameNotFound extends InternalServerError {
    constructor(userId: number, gameId: number) {
        super(`User rating change for user ${userId} in game ${gameId} not found`, 'userRatingChangeInGameNotFound');
    }
}
