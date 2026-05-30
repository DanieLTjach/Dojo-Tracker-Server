import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { EventAchievementRow } from '../model/AchievementModels.ts';

/** A winning row joined with the winner's display fields, for the tournament page. */
export interface EventAchievementWinnerRow {
    metric: string;
    value: number;
    userId: number;
    name: string;
    profileFirstName: string | null;
    profileLastName: string | null;
}

/** A winning row joined with its owning event, for the profile page. */
export interface UserAchievementRow {
    eventId: number;
    eventName: string;
    metric: string;
    value: number;
}

export class AchievementRepository {

    private deleteByEventStatement(): Statement<{ eventId: number }, void> {
        return dbManager.db.prepare('DELETE FROM eventAchievement WHERE eventId = :eventId');
    }

    private insertStatement(): Statement<EventAchievementRow, void> {
        return dbManager.db.prepare(`
            INSERT INTO eventAchievement (eventId, metric, userId, value)
            VALUES (:eventId, :metric, :userId, :value)`
        );
    }

    private markComputedStatement(): Statement<{ eventId: number, computedAt: string }, void> {
        return dbManager.db.prepare(`
            INSERT INTO eventAchievementComputed (eventId, computedAt)
            VALUES (:eventId, :computedAt)
            ON CONFLICT(eventId) DO UPDATE SET computedAt = excluded.computedAt`
        );
    }

    /** Atomically replace all stored achievements for an event and record the computation time. */
    replaceEventAchievements(eventId: number, rows: EventAchievementRow[], computedAt: Date): void {
        this.deleteByEventStatement().run({ eventId });
        const insert = this.insertStatement();
        for (const row of rows) {
            insert.run(row);
        }
        this.markComputedStatement().run({ eventId, computedAt: computedAt.toISOString() });
    }

    private isEventComputedStatement(): Statement<{ eventId: number }, { eventId: number }> {
        return dbManager.db.prepare('SELECT eventId FROM eventAchievementComputed WHERE eventId = :eventId');
    }

    isEventComputed(eventId: number): boolean {
        return this.isEventComputedStatement().get({ eventId }) !== undefined;
    }

    private findWinnersByEventIdStatement(): Statement<{ eventId: number }, EventAchievementWinnerRow> {
        return dbManager.db.prepare(`
            SELECT ea.metric, ea.value, ea.userId, u.name,
                   p.firstName AS profileFirstName, p.lastName AS profileLastName
            FROM eventAchievement ea
            JOIN user u ON u.id = ea.userId
            LEFT JOIN profile p ON p.userId = ea.userId
            WHERE ea.eventId = :eventId
            ORDER BY ea.metric, u.name`
        );
    }

    findWinnersByEventId(eventId: number): EventAchievementWinnerRow[] {
        return this.findWinnersByEventIdStatement().all({ eventId });
    }

    private findByUserIdStatement(): Statement<{ userId: number }, UserAchievementRow> {
        return dbManager.db.prepare(`
            SELECT ea.eventId, e.name AS eventName, ea.metric, ea.value
            FROM eventAchievement ea
            JOIN event e ON e.id = ea.eventId
            WHERE ea.userId = :userId
            ORDER BY e.id, ea.metric`
        );
    }

    findByUserId(userId: number): UserAchievementRow[] {
        return this.findByUserIdStatement().all({ userId });
    }

    private findUncomputedTournamentEventIdsForUserStatement(): Statement<{ userId: number }, { eventId: number }> {
        return dbManager.db.prepare(`
            SELECT DISTINCT g.eventId AS eventId
            FROM userToGame utg
            JOIN game g ON g.id = utg.gameId
            JOIN event e ON e.id = g.eventId
            LEFT JOIN eventAchievementComputed c ON c.eventId = e.id
            WHERE utg.userId = :userId
              AND e.type = 'TOURNAMENT'
              AND g.status = 'FINISHED'
              AND c.eventId IS NULL`
        );
    }

    /** Tournament events the user played a finished game in that have never been computed. */
    findUncomputedTournamentEventIdsForUser(userId: number): number[] {
        return this.findUncomputedTournamentEventIdsForUserStatement().all({ userId }).map((row) => row.eventId);
    }
}
