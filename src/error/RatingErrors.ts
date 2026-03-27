import { BadRequestError, InternalServerError } from "./BaseErrors.ts";

export class UserRatingChangeInGameNotFound extends InternalServerError {
    constructor(userId: number, gameId: number) {
        super(`Зміну рейтингу користувача ${userId} в грі ${gameId} не знайдено`, 'userRatingChangeInGameNotFound');
    }
}

export class UserHasNoRatingDespiteHavingPlayedGames extends InternalServerError {
    constructor(userId: number, eventId: number) {
        super(`Користувач ${userId} не має рейтингу в події ${eventId} попри те, що має зіграні ігри`, 'userHasNoRatingDespiteHavingPlayedGames');
    }
}

export class PleaseProvideStartPlaceForAllPlayersToResolveTie extends BadRequestError {
    constructor() {
        super(`Будь ласка, вкажіть стартове місце (вітер) для всіх гравців, щоб розв'язати нічию`, 'pleaseProvideStartPlaceForAllPlayersToResolveTie');
    }
}