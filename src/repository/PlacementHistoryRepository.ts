import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { EventType } from '../model/EventModels.ts';
import { parseEventType } from '../util/EnumUtil.ts';

export interface UserEventHistoryDBEntity {
    eventId: number;
    eventName: string;
    eventType: string;
    clubId: number;
    clubName: string;
    dateFrom: string | null;
    dateTo: string | null;
    createdAt: string;
    minimumGamesForRating: number;
    gamesPlayed: number;
    rating: number | null;
}

export interface UserEventHistoryItem {
    eventId: number;
    eventName: string;
    eventType: EventType;
    clubId: number;
    clubName: string;
    dateFrom: Date | null;
    dateTo: Date | null;
    createdAt: Date;
    minimumGamesForRating: number;
    gamesPlayed: number;
    rating: number;
}

export class PlacementHistoryRepository {
    private findEventsPlayedByUserStatement(): Statement<{ userId: number }, UserEventHistoryDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.id as eventId,
                e.name as eventName,
                e.type as eventType,
                e.clubId,
                c.name as clubName,
                e.dateFrom,
                e.dateTo,
                e.createdAt,
                e.minimumGamesForRating,
                COUNT(DISTINCT g.id) as gamesPlayed,
                (
                    SELECT urc.rating
                    FROM userRatingChange urc
                    WHERE urc.userId = :userId AND urc.eventId = e.id
                    ORDER BY urc.timestamp DESC, urc.gameId DESC
                    LIMIT 1
                ) as rating
            FROM game g
            JOIN event e ON g.eventId = e.id
            JOIN club c ON e.clubId = c.id
            JOIN userToGame utg ON g.id = utg.gameId
            WHERE utg.userId = :userId
              AND g.status = 'FINISHED'
              AND NOT EXISTS (
                  SELECT 1 FROM eventRegistration er
                  WHERE er.eventId = e.id
                    AND er.userId = :userId
                    AND er.isFillerPlayer = 1
              )
            GROUP BY e.id
            ORDER BY COALESCE(e.dateFrom, e.createdAt) DESC, e.id DESC`);
    }

    findEventsPlayedByUser(userId: number): UserEventHistoryItem[] {
        return this.findEventsPlayedByUserStatement()
            .all({ userId })
            .map(userEventHistoryFromDBEntity);
    }
}

function userEventHistoryFromDBEntity(dbEntity: UserEventHistoryDBEntity): UserEventHistoryItem {
    return {
        eventId: dbEntity.eventId,
        eventName: dbEntity.eventName,
        eventType: parseEventType(dbEntity.eventType),
        clubId: dbEntity.clubId,
        clubName: dbEntity.clubName,
        dateFrom: dbEntity.dateFrom !== null ? new Date(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? new Date(dbEntity.dateTo) : null,
        createdAt: new Date(dbEntity.createdAt),
        minimumGamesForRating: dbEntity.minimumGamesForRating,
        gamesPlayed: dbEntity.gamesPlayed,
        rating: dbEntity.rating ?? 0,
    };
}
