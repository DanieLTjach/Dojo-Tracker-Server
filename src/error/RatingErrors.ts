import { InternalServerError } from "./BaseErrors.ts";

export class UserRatingChangeInGameNotFound extends InternalServerError {
    constructor(userId: number, gameId: number) {
        super(`Зміну рейтингу користувача ${userId} в грі ${gameId} не знайдено`, 'userRatingChangeInGameNotFound');
    }
}
