import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { TournamentStatus } from '../model/TournamentModels.ts';

export class TournamentRepository {
    private createTournamentStatement(): Statement<{
        eventId: number;
        totalRounds: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO tournament (eventId, totalRounds, createdAt, modifiedAt, modifiedBy)
            VALUES (:eventId, :totalRounds, :createdAt, :modifiedAt, :modifiedBy)
        `);
    }

    createTournament(eventId: number, totalRounds: number, createdAt: Date, modifiedBy: number): void {
        const timestamp = createdAt.toISOString();
        this.createTournamentStatement().run({
            eventId,
            totalRounds,
            createdAt: timestamp,
            modifiedAt: timestamp,
            modifiedBy
        });
    }

    private updateTournamentTotalRoundsStatement(): Statement<{
        eventId: number;
        totalRounds: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE tournament
            SET totalRounds = :totalRounds,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE eventId = :eventId
        `);
    }

    updateTournamentTotalRounds(eventId: number, totalRounds: number, modifiedAt: Date, modifiedBy: number): void {
        this.updateTournamentTotalRoundsStatement().run({
            eventId,
            totalRounds,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy
        });
    }

    private updateTournamentStateStatement(): Statement<{
        eventId: number;
        status: TournamentStatus;
        currentRound: number | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE tournament
            SET status = :status,
                currentRound = :currentRound,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE eventId = :eventId
        `);
    }

    updateTournamentState(
        eventId: number,
        status: TournamentStatus,
        currentRound: number | null,
        modifiedAt: Date,
        modifiedBy: number
    ): void {
        this.updateTournamentStateStatement().run({
            eventId,
            status,
            currentRound,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy
        });
    }

    private deleteTournamentStatement(): Statement<{ eventId: number }, void> {
        return dbManager.db.prepare('DELETE FROM tournament WHERE eventId = :eventId');
    }

    deleteTournament(eventId: number): void {
        this.deleteTournamentStatement().run({ eventId });
    }
}
