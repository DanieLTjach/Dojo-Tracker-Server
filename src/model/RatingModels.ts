import { UserShortDTO } from "./UserModels.ts";

export interface UserRatingChange {
    userId: number;
    eventId: number;
    gameId: number;
    ratingChange: number;
    rating: number;
    timestamp: Date;
}

export interface UserRating {
    user: UserShortDTO;
    rating: number;
    gamesPlayed: number;
}

export interface UserRatingChangeShortDTO {
    user: UserShortDTO;
    ratingChange: number;
}

export interface RatingSnapshot {
    timestamp: Date;
    rating: number;
}