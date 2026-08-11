import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';

export class TournamentRepository {
    private createTournamentStatement(): Statement<{
        eventId: number;
        status: TournamentStatus;
        totalRounds: number;
        roundDurationSec: number | null;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO tournament (
                eventId, status, totalRounds, roundDurationSec, createdAt, modifiedAt, modifiedBy
            )
            VALUES (
                :eventId, :status, :totalRounds, :roundDurationSec, :createdAt, :modifiedAt, :modifiedBy
            )
        `);
    }

    createTournament(
        eventId: number,
        totalRounds: number,
        roundDurationSec: number | null,
        createdAt: Date,
        modifiedBy: number
    ): void {
        const timestamp = createdAt.toISOString();
        this.createTournamentStatement().run({
            eventId,
            status: TournamentStatus.CREATED,
            totalRounds,
            roundDurationSec,
            createdAt: timestamp,
            modifiedAt: timestamp,
            modifiedBy,
        });
    }

    private updateTournamentConfigStatement(): Statement<{
        eventId: number;
        totalRounds: number;
        roundDurationSec: number | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE tournament
            SET totalRounds = :totalRounds,
                roundDurationSec = :roundDurationSec,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE eventId = :eventId
        `);
    }

    updateTournamentConfig(
        eventId: number,
        totalRounds: number,
        roundDurationSec: number | null,
        modifiedAt: Date,
        modifiedBy: number
    ): void {
        this.updateTournamentConfigStatement().run({
            eventId,
            totalRounds,
            roundDurationSec,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
    }

    private updateTournamentStateStatement(): Statement<{
        eventId: number;
        status: TournamentStatus;
        currentRound: number | null;
        currentRoundStartedAt: string | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE tournament
            SET status = :status,
                currentRound = :currentRound,
                currentRoundStartedAt = :currentRoundStartedAt,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE eventId = :eventId
        `);
    }

    updateTournamentState(
        eventId: number,
        status: TournamentStatus,
        currentRound: number | null,
        currentRoundStartedAt: Date | null,
        modifiedAt: Date,
        modifiedBy: number
    ): void {
        this.updateTournamentStateStatement().run({
            eventId,
            status,
            currentRound,
            currentRoundStartedAt: currentRoundStartedAt?.toISOString() ?? null,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
    }

    private deleteTournamentStatement(): Statement<{ eventId: number }, void> {
        return dbManager.db.prepare('DELETE FROM tournament WHERE eventId = :eventId');
    }

    deleteTournament(eventId: number): void {
        this.deleteTournamentStatement().run({ eventId });
    }
}
