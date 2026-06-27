import { UserShortDTO } from './UserModels.ts';

export interface UserRatingChange {
    userId: number;
    eventId: number;
    gameId: number;
    ratingChange: number;
    rating: number;
    timestamp: Date;
    // Team attribution, frozen at game-finish time. null for non-team games / players.
    teamId?: number | null | undefined;
    teamRating?: number | null | undefined;
}

export interface UserRating {
    user: UserShortDTO;
    rating: number;
    gamesPlayed: number;
    minimumGamesPlayed: boolean;
}

export interface UserRatingWithPlace extends UserRating {
    place: number | null;
}

export interface UserRatingChangeShortDTO {
    user: UserShortDTO;
    ratingChange: number;
}

export interface RatingSnapshot {
    timestamp: Date;
    rating: number;
}
