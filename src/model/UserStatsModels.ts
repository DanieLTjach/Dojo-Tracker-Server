export interface UserEventStats {
    userId: number;
    eventId: number;
    place: number;
    playerRating: number;
    gamesPlayed: number;
    averageIncrement: number;
    averagePlace: number;
    percentageFirstPlace: number;
    percentageSecondPlace: number;
    percentageThirdPlace: number;
    percentageFourthPlace: number;
    percentageOfNegativeRank: number;
    percentageOfGamesPlayedFromAll: number;
    sumOfPoints: number;
    amountOfRatingEarned: number;
    maxPoints: number;
    minPoints: number;
    averagePoints: number;
}

export interface GameStatsData {
    gameId: number;
    userId: number;
    points: number;
    placement: number;
    ratingChange: number;
}
