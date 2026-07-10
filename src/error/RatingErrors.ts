import { BadRequestError, InternalServerError } from './BaseErrors.ts';

export class UserRatingChangeInGameNotFound extends InternalServerError {
    constructor(userId: number, gameId: number) {
        super('userRatingChangeInGameNotFound', { userId, gameId });
    }
}

export class UserHasNoRatingDespiteHavingPlayedGames extends InternalServerError {
    constructor(userId: number, eventId: number) {
        super('userHasNoRatingDespiteHavingPlayedGames', { userId, eventId });
    }
}

export class PleaseProvideStartPlaceForAllPlayersToResolveTie extends BadRequestError {
    constructor() {
        super('pleaseProvideStartPlaceForAllPlayersToResolveTie');
    }
}
