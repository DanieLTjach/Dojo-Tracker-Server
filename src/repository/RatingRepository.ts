import type { Statement } from "better-sqlite3";
import { dbManager } from "../db/dbInit.ts";
import type { RatingSnapshot, UserRating, UserRatingChange, UserRatingChangeShortDTO } from "../model/RatingModels.ts";

export class RatingRepository {

    private findUserRatingChangeInGameStatement(): Statement<{
        userId: number,
        gameId: number
    }, UserRatingChangeDBEntity> {
        return dbManager.db.prepare(`
            SELECT * FROM userRatingChange
            WHERE userId = :userId AND gameId = :gameId`
        );
    }

    findUserRatingChangeInGame(userId: number, gameId: number): UserRatingChange | undefined {
        const userRatingChangeDBEntity = this.findUserRatingChangeInGameStatement().get({ userId, gameId });
        return userRatingChangeDBEntity !== undefined ? userRatingChangeFromDBEntity(userRatingChangeDBEntity) : undefined;
    }

    private findUserLatestRatingChangeBeforeDateStatement(): Statement<{
        userId: number,
        eventId: number,
        beforeDate: string
    }, UserRatingChangeDBEntity> {
        return dbManager.db.prepare(`
            SELECT * FROM userRatingChange
            WHERE userId = :userId AND eventId = :eventId AND timestamp < :beforeDate
            ORDER BY timestamp DESC LIMIT 1`
        );
    }

    findUserLatestRatingChangeBeforeDate(userId: number, eventId: number, beforeDate: Date): UserRatingChange | undefined {
        const userRatingChangeDBEntity = this.findUserLatestRatingChangeBeforeDateStatement()
            .get({ userId, eventId, beforeDate: beforeDate.toISOString() });
        return userRatingChangeDBEntity !== undefined ? userRatingChangeFromDBEntity(userRatingChangeDBEntity) : undefined;
    }

    private findAllUsersCurrentRatingStatement(): Statement<{ eventId: number }, UserRatingDBEntity> {
        return dbManager.db.prepare(`
            SELECT u.id as userId, u.name as userName, urc.rating as rating
            FROM (
                SELECT userId,
                        rating,
                        ROW_NUMBER() OVER (PARTITION BY userId ORDER BY timestamp DESC) as rn
                FROM userRatingChange
                WHERE eventId = :eventId
            ) urc
            JOIN user u ON urc.userId = u.id
            WHERE urc.rn = 1`
        );
    }

    findAllUsersCurrentRating(eventId: number): UserRating[] {
        return this.findAllUsersCurrentRatingStatement().all({ eventId }).map(userRatingFromDBEntity);
    }

    private getAllUsersTotalRatingChangeDuringPeriodStatement(): Statement<{
        eventId: number,
        dateFrom: string,
        dateTo: string
    }, UserRatingChangeShortDTODBEntity> {
        return dbManager.db.prepare(`
            SELECT u.id as userId, u.name as userName, SUM(urc.ratingChange) as ratingChange
            FROM userRatingChange urc
            JOIN user u ON urc.userId = u.id
            WHERE urc.eventId = :eventId AND urc.timestamp >= :dateFrom AND urc.timestamp <= :dateTo
            GROUP BY urc.userId`
        );
    }

    getAllUsersTotalRatingChangeDuringPeriod(
        eventId: number,
        dateFrom: Date,
        dateTo: Date
    ): UserRatingChangeShortDTO[] {
        return this.getAllUsersTotalRatingChangeDuringPeriodStatement()
            .all({
                eventId,
                dateFrom: dateFrom.toISOString(),
                dateTo: dateTo.toISOString()
            })
            .map(userRatingChangeShortDTOFromDBEntity);
    }

    private getUserRatingHistoryStatement(): Statement<{
        userId: number,
        eventId: number
    }, RatingSnapshotDBEntity> {
        return dbManager.db.prepare(`
            SELECT timestamp, rating
            FROM userRatingChange
            WHERE userId = :userId AND eventId = :eventId
            ORDER BY timestamp`
        );
    }

    getUserRatingHistory(userId: number, eventId: number): RatingSnapshot[] {
        return this.getUserRatingHistoryStatement().all({ userId, eventId }).map(ratingSnapshotFromDBEntity);
    }

    private addUserRatingChangeStatement(): Statement<UserRatingChangeDBEntity, void> {
        return dbManager.db.prepare(`
            INSERT INTO userRatingChange (userId, eventId, gameId, ratingChange, rating, timestamp)
            VALUES (:userId, :eventId, :gameId, :ratingChange, :rating, :timestamp)`
        );
    }

    addUserRatingChange(userRatingChange: UserRatingChange): void {
        this.addUserRatingChangeStatement().run(userRatingChangeToDBEntity(userRatingChange));
    }

    private deleteRatingChangesFromGameStatement(): Statement<{ gameId: number }, void> {
        return dbManager.db.prepare(
            `DELETE FROM userRatingChange WHERE gameId = :gameId`
        );
    }

    deleteRatingChangesFromGame(gameId: number): void {
        this.deleteRatingChangesFromGameStatement().run({ gameId });
    }

    private updateUserRatingChangesAfterDateStatement(): Statement<{
        userId: number,
        eventId: number,
        ratingDelta: number,
        afterDate: string
    }> {
        return dbManager.db.prepare(`
            UPDATE userRatingChange
            SET rating = rating + :ratingDelta
            WHERE userId = :userId and eventId = :eventId and timestamp > :afterDate`
        );
    }

    updateUserRatingChangesAfterDate(
        userId: number,
        eventId: number,
        ratingDelta: number,
        afterDate: Date
    ): void {
        this.updateUserRatingChangesAfterDateStatement().run(
            {
                userId,
                eventId,
                ratingDelta,
                afterDate: afterDate.toISOString()
            }
        );
    }
}

interface UserRatingChangeDBEntity {
    userId: number;
    eventId: number;
    gameId: number;
    ratingChange: number;
    rating: number;
    timestamp: string;
}

function userRatingChangeToDBEntity(userRatingChange: UserRatingChange): UserRatingChangeDBEntity {
    return { ...userRatingChange, timestamp: userRatingChange.timestamp.toISOString() };
}

function userRatingChangeFromDBEntity(dbEntity: UserRatingChangeDBEntity): UserRatingChange {
    return { ...dbEntity, timestamp: new Date(dbEntity.timestamp) };
}

interface UserRatingDBEntity {
    userId: number;
    userName: string;
    rating: number;
}

function userRatingFromDBEntity(dbEntity: UserRatingDBEntity): UserRating {
    return {
        user: { id: dbEntity.userId, name: dbEntity.userName },
        rating: dbEntity.rating
    };
}

interface UserRatingChangeShortDTODBEntity {
    userId: number;
    userName: string;
    ratingChange: number;
}

function userRatingChangeShortDTOFromDBEntity(dbEntity: UserRatingChangeShortDTODBEntity): UserRatingChangeShortDTO {
    return {
        user: { id: dbEntity.userId, name: dbEntity.userName },
        ratingChange: dbEntity.ratingChange
    };
}

interface RatingSnapshotDBEntity {
    timestamp: string;
    rating: number;
}

function ratingSnapshotFromDBEntity(dbEntity: RatingSnapshotDBEntity): RatingSnapshot {
    return {
        timestamp: new Date(dbEntity.timestamp),
        rating: dbEntity.rating
    };
}