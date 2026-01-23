import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { GameStatsData } from '../model/UserStatsModels.ts';

export class UserStatsRepository {
    // Get all game data for a user in an event (points, placement, rating changes)
    private getUserGameStatsStatement(): Statement<
        { userId: number; eventId: number },
        GameStatsData
    > {
        return dbManager.db.prepare(`
            SELECT
                g.id as gameId,
                utg.userId,
                utg.points,
                (
                    SELECT COUNT(*)
                    FROM userToGame utg2
                    WHERE utg2.gameId = g.id AND utg2.points > utg.points
                ) + 1 as placement,
                urc.ratingChange
             FROM game g
             JOIN userToGame utg ON g.id = utg.gameId
             JOIN userRatingChange urc ON urc.gameId = g.id AND urc.userId = utg.userId
             WHERE g.eventId = :eventId AND utg.userId = :userId
             ORDER BY g.createdAt`
        );
    }

    getUserGameStats(userId: number, eventId: number): GameStatsData[] {
        return this.getUserGameStatsStatement().all({ userId, eventId });
    }

    // Get current rating for a user in an event
    private getUserCurrentRatingStatement(): Statement<
        { userId: number; eventId: number },
        { rating: number }
    > {
        return dbManager.db.prepare(`
            SELECT rating
            FROM userRatingChange
            WHERE userId = :userId AND eventId = :eventId
            ORDER BY timestamp DESC
            LIMIT 1`
        );
    }

    getUserCurrentRating(userId: number, eventId: number): number | undefined {
        const result = this.getUserCurrentRatingStatement().get({ userId, eventId });
        return result?.rating;
    }

    // Get total number of games in an event
    private getTotalGamesInEventStatement(): Statement<{ eventId: number }, { totalGames: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as totalGames
            FROM game
            WHERE eventId = :eventId`
        );
    }

    getTotalGamesInEvent(eventId: number): number {
        return this.getTotalGamesInEventStatement().get({ eventId })!.totalGames;
    }

    // Get user's rank/place in the event based on current rating
    private getUserRankInEventStatement(): Statement<{ userId: number; eventId: number }, { place: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) + 1 as place
            FROM (
                SELECT userId, rating
                FROM userRatingChange
                WHERE eventId = :eventId
                AND (userId, timestamp) IN (
                    SELECT userId, MAX(timestamp)
                    FROM userRatingChange
                    WHERE eventId = :eventId
                    GROUP BY userId
                )
            ) ranked
            WHERE rating > (
                SELECT rating
                FROM userRatingChange
                WHERE userId = :userId AND eventId = :eventId
                ORDER BY timestamp DESC
                LIMIT 1
            )`
        );
    }

    getUserRankInEvent(userId: number, eventId: number): number {
        return this.getUserRankInEventStatement().get({ userId, eventId })!.place;
    }
}
