import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type {
    ClubSkillConfig,
    SkillRating,
    SkillRatingGame,
} from '../model/SkillModels.ts';

export class SkillRatingRepository {
    private upsertSkillRatingStatement(): Statement<{
        clubId: number;
        userId: number;
        gameSize: number;
        mu: number;
        sigma: number;
        gamesPlayed: number;
        firstRatedGameAt: string;
        lastRatedGameAt: string;
        modifiedAt: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO skillRating (
                clubId, userId, gameSize, mu, sigma, gamesPlayed, firstRatedGameAt, lastRatedGameAt, modifiedAt
            ) VALUES (
                :clubId, :userId, :gameSize, :mu, :sigma, :gamesPlayed, :firstRatedGameAt, :lastRatedGameAt, :modifiedAt
            )
            ON CONFLICT (clubId, userId, gameSize) DO UPDATE SET
                mu = excluded.mu,
                sigma = excluded.sigma,
                gamesPlayed = excluded.gamesPlayed,
                firstRatedGameAt = excluded.firstRatedGameAt,
                lastRatedGameAt = excluded.lastRatedGameAt,
                modifiedAt = excluded.modifiedAt`);
    }

    upsertSkillRating(rating: SkillRating): void {
        this.upsertSkillRatingStatement().run({
            clubId: rating.clubId,
            userId: rating.userId,
            gameSize: rating.gameSize,
            mu: rating.mu,
            sigma: rating.sigma,
            gamesPlayed: rating.gamesPlayed,
            firstRatedGameAt: rating.firstRatedGameAt.toISOString(),
            lastRatedGameAt: rating.lastRatedGameAt.toISOString(),
            modifiedAt: rating.modifiedAt.toISOString(),
        });
    }

    private findSkillRatingStatement(): Statement<
        { clubId: number, userId: number, gameSize: number },
        SkillRatingDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT * FROM skillRating
            WHERE clubId = :clubId AND userId = :userId AND gameSize = :gameSize`);
    }

    findSkillRating(clubId: number, userId: number, gameSize: number): SkillRating | undefined {
        const row = this.findSkillRatingStatement().get({ clubId, userId, gameSize });
        return row ? skillRatingFromDBEntity(row) : undefined;
    }

    private findUserSkillRatingsStatement(): Statement<{ userId: number }, SkillRatingDBEntity> {
        return dbManager.db.prepare(`
            SELECT * FROM skillRating
            WHERE userId = :userId
            ORDER BY clubId ASC, gameSize ASC`);
    }

    findUserSkillRatings(userId: number): SkillRating[] {
        return this.findUserSkillRatingsStatement().all({ userId }).map(skillRatingFromDBEntity);
    }

    private findClubSkillRatingsWithUsersStatement(): Statement<
        { clubId: number, gameSize: number },
        SkillRatingWithUserDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT
                sr.clubId,
                sr.userId,
                sr.gameSize,
                sr.mu,
                sr.sigma,
                sr.gamesPlayed,
                sr.firstRatedGameAt,
                sr.lastRatedGameAt,
                sr.modifiedAt,
                u.name as userName,
                u.telegramUsername,
                p.firstName as profileFirstName,
                p.lastName as profileLastName,
                p.hideProfile as profileHidden
            FROM skillRating sr
            JOIN user u ON sr.userId = u.id
            LEFT JOIN profile p ON sr.userId = p.userId
            WHERE sr.clubId = :clubId AND sr.gameSize = :gameSize`);
    }

    findClubSkillRatingsWithUsers(clubId: number, gameSize: number): SkillRatingWithUserDBEntity[] {
        return this.findClubSkillRatingsWithUsersStatement().all({ clubId, gameSize });
    }

    private findNonProvisionalTrackRatingsStatement(): Statement<
        { clubId: number, gameSize: number, threshold: number },
        SkillRatingDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT * FROM skillRating
            WHERE clubId = :clubId AND gameSize = :gameSize AND gamesPlayed >= :threshold`);
    }

    findNonProvisionalTrackRatings(clubId: number, gameSize: number, threshold: number): SkillRating[] {
        return this.findNonProvisionalTrackRatingsStatement().all({ clubId, gameSize, threshold }).map(
            skillRatingFromDBEntity
        );
    }

    private insertSkillRatingGameStatement(): Statement<{
        gameId: number;
        userId: number;
        clubId: number;
        gameSize: number;
        rank: number;
        muBefore: number;
        sigmaBefore: number;
        muAfter: number;
        sigmaAfter: number;
        playedAt: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO skillRatingGame (
                gameId, userId, clubId, gameSize, rank, muBefore, sigmaBefore, muAfter, sigmaAfter, playedAt
            ) VALUES (
                :gameId, :userId, :clubId, :gameSize, :rank, :muBefore, :sigmaBefore, :muAfter, :sigmaAfter, :playedAt
            )`);
    }

    insertSkillRatingGame(game: SkillRatingGame): void {
        this.insertSkillRatingGameStatement().run({
            gameId: game.gameId,
            userId: game.userId,
            clubId: game.clubId,
            gameSize: game.gameSize,
            rank: game.rank,
            muBefore: game.muBefore,
            sigmaBefore: game.sigmaBefore,
            muAfter: game.muAfter,
            sigmaAfter: game.sigmaAfter,
            playedAt: game.playedAt.toISOString(),
        });
    }

    private findSkillRatingGamesByGameIdStatement(): Statement<{ gameId: number }, SkillRatingGameDBEntity> {
        return dbManager.db.prepare(`
            SELECT * FROM skillRatingGame
            WHERE gameId = :gameId`);
    }

    findSkillRatingGamesByGameId(gameId: number): SkillRatingGame[] {
        return this.findSkillRatingGamesByGameIdStatement().all({ gameId }).map(skillRatingGameFromDBEntity);
    }

    private deleteSkillRatingGamesByGameIdStatement(): Statement<{ gameId: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM skillRatingGame
            WHERE gameId = :gameId`);
    }

    deleteSkillRatingGamesByGameId(gameId: number): void {
        this.deleteSkillRatingGamesByGameIdStatement().run({ gameId });
    }

    private findLastSkillRatingGameStatement(): Statement<
        { clubId: number, userId: number, gameSize: number },
        SkillRatingGameDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT * FROM skillRatingGame
            WHERE clubId = :clubId AND userId = :userId AND gameSize = :gameSize
            ORDER BY playedAt DESC, gameId DESC
            LIMIT 1`);
    }

    findLastSkillRatingGame(clubId: number, userId: number, gameSize: number): SkillRatingGame | undefined {
        const row = this.findLastSkillRatingGameStatement().get({ clubId, userId, gameSize });
        return row ? skillRatingGameFromDBEntity(row) : undefined;
    }

    private countGamesPlayedAfterStatement(): Statement<
        { clubId: number, gameSize: number, playedAt: string, gameId: number },
        { count: number }
    > {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM skillRatingGame
            WHERE clubId = :clubId AND gameSize = :gameSize
              AND (playedAt > :playedAt OR (playedAt = :playedAt AND gameId > :gameId))`);
    }

    isNewestGameInTrack(gameId: number, clubId: number, gameSize: number, playedAt: Date): boolean {
        const res = this.countGamesPlayedAfterStatement().get({
            clubId,
            gameSize,
            playedAt: playedAt.toISOString(),
            gameId,
        });
        return (res?.count ?? 0) === 0;
    }

    private findClubSkillConfigStatement(): Statement<{ clubId: number }, ClubSkillConfigDBEntity> {
        return dbManager.db.prepare(`
            SELECT * FROM clubSkillConfig
            WHERE clubId = :clubId`);
    }

    findClubSkillConfig(clubId: number): ClubSkillConfig | undefined {
        const row = this.findClubSkillConfigStatement().get({ clubId });
        return row ? clubSkillConfigFromDBEntity(row) : undefined;
    }

    private upsertClubSkillConfigStatement(): Statement<{
        clubId: number;
        provisionalGameThreshold: number;
        isEnabled: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubSkillConfig (
                clubId, provisionalGameThreshold, isEnabled, createdAt, modifiedAt, modifiedBy
            ) VALUES (
                :clubId, :provisionalGameThreshold, :isEnabled, :createdAt, :modifiedAt, :modifiedBy
            )
            ON CONFLICT (clubId) DO UPDATE SET
                provisionalGameThreshold = excluded.provisionalGameThreshold,
                isEnabled = excluded.isEnabled,
                modifiedAt = excluded.modifiedAt,
                modifiedBy = excluded.modifiedBy`);
    }

    upsertClubSkillConfig(config: ClubSkillConfig): void {
        this.upsertClubSkillConfigStatement().run({
            clubId: config.clubId,
            provisionalGameThreshold: config.provisionalGameThreshold,
            isEnabled: booleanToInteger(config.isEnabled),
            createdAt: config.createdAt.toISOString(),
            modifiedAt: config.modifiedAt.toISOString(),
            modifiedBy: config.modifiedBy,
        });
    }

    private isTrackDirtyStatement(): Statement<{ clubId: number, gameSize: number }, { isDirty: number }> {
        return dbManager.db.prepare(`
            SELECT 1 as isDirty FROM skillTrackDirty
            WHERE clubId = :clubId AND gameSize = :gameSize
            LIMIT 1`);
    }

    isTrackDirty(clubId: number, gameSize: number): boolean {
        const res = this.isTrackDirtyStatement().get({ clubId, gameSize });
        return res !== undefined;
    }

    private markTrackDirtyStatement(): Statement<{
        clubId: number;
        gameSize: number;
        markedAt: string;
        reason: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO skillTrackDirty (clubId, gameSize, markedAt, reason)
            VALUES (:clubId, :gameSize, :markedAt, :reason)
            ON CONFLICT (clubId, gameSize) DO UPDATE SET
                markedAt = excluded.markedAt,
                reason = excluded.reason`);
    }

    markTrackDirty(clubId: number, gameSize: number, reason: string, markedAt: Date = new Date()): void {
        this.markTrackDirtyStatement().run({
            clubId,
            gameSize,
            markedAt: markedAt.toISOString(),
            reason,
        });
    }

    private clearTrackDirtyStatement(): Statement<{ clubId: number, gameSize: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM skillTrackDirty
            WHERE clubId = :clubId AND gameSize = :gameSize`);
    }

    clearTrackDirty(clubId: number, gameSize: number): void {
        this.clearTrackDirtyStatement().run({ clubId, gameSize });
    }

    private deleteTrackDataStatements() {
        return {
            deleteGames: dbManager.db.prepare(`
                DELETE FROM skillRatingGame
                WHERE clubId = :clubId AND gameSize = :gameSize`),
            deleteRatings: dbManager.db.prepare(`
                DELETE FROM skillRating
                WHERE clubId = :clubId AND gameSize = :gameSize`),
        };
    }

    deleteTrackData(clubId: number, gameSize: number): void {
        const stmts = this.deleteTrackDataStatements();
        stmts.deleteGames.run({ clubId, gameSize });
        stmts.deleteRatings.run({ clubId, gameSize });
    }

    private deleteSkillRatingForUserStatement(): Statement<
        { clubId: number, userId: number, gameSize: number },
        void
    > {
        return dbManager.db.prepare(`
            DELETE FROM skillRating
            WHERE clubId = :clubId AND userId = :userId AND gameSize = :gameSize`);
    }

    deleteSkillRatingForUser(clubId: number, userId: number, gameSize: number): void {
        this.deleteSkillRatingForUserStatement().run({ clubId, userId, gameSize });
    }

    private findRatableGamesForTrackStatement(): Statement<
        { clubId: number, gameSize: number },
        RatableGamePlayerDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT
                g.id as gameId,
                g.createdAt as gameCreatedAt,
                e.clubId,
                gr.numberOfPlayers as gameSize,
                gr.umaTieBreak,
                utg.userId,
                utg.points,
                utg.startPlace,
                utg.isSubstitutePlayer
            FROM game g
            JOIN event e ON g.eventId = e.id
            JOIN gameRules gr ON e.gameRules = gr.id
            JOIN userToGame utg ON g.id = utg.gameId
            WHERE g.status = 'FINISHED'
              AND e.clubId = :clubId
              AND e.isRated = 1
              AND gr.numberOfPlayers = :gameSize
              AND NOT EXISTS (
                  SELECT 1 FROM eventRegistration er
                  WHERE er.eventId = g.eventId
                    AND er.userId = utg.userId
                    AND er.isFillerPlayer = 1
              )
            ORDER BY g.createdAt ASC, g.id ASC, utg.userId ASC`);
    }

    findRatableGamesForTrack(clubId: number, gameSize: number): RatableGamePlayerDBEntity[] {
        return this.findRatableGamesForTrackStatement().all({ clubId, gameSize });
    }

    private findAllActiveClubsWithGamesStatement(): Statement<[], { clubId: number }> {
        return dbManager.db.prepare(`
            SELECT DISTINCT e.clubId
            FROM game g
            JOIN event e ON g.eventId = e.id
            WHERE g.status = 'FINISHED' AND e.clubId IS NOT NULL
            ORDER BY e.clubId ASC`);
    }

    findAllClubsWithFinishedGames(): number[] {
        return this.findAllActiveClubsWithGamesStatement().all().map(r => r.clubId);
    }
}

export interface SkillRatingDBEntity {
    clubId: number;
    userId: number;
    gameSize: number;
    mu: number;
    sigma: number;
    gamesPlayed: number;
    firstRatedGameAt: string;
    lastRatedGameAt: string;
    modifiedAt: string;
}

export interface SkillRatingWithUserDBEntity extends SkillRatingDBEntity {
    userName: string;
    telegramUsername: string | null;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: number | null;
}

export interface SkillRatingGameDBEntity {
    gameId: number;
    userId: number;
    clubId: number;
    gameSize: number;
    rank: number;
    muBefore: number;
    sigmaBefore: number;
    muAfter: number;
    sigmaAfter: number;
    playedAt: string;
}

export interface ClubSkillConfigDBEntity {
    clubId: number;
    provisionalGameThreshold: number;
    isEnabled: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

export interface RatableGamePlayerDBEntity {
    gameId: number;
    gameCreatedAt: string;
    clubId: number;
    gameSize: number;
    umaTieBreak: string;
    userId: number;
    points: number;
    startPlace: string | null;
    isSubstitutePlayer: number;
}

function skillRatingFromDBEntity(dbEntity: SkillRatingDBEntity): SkillRating {
    return {
        clubId: dbEntity.clubId,
        userId: dbEntity.userId,
        gameSize: dbEntity.gameSize,
        mu: dbEntity.mu,
        sigma: dbEntity.sigma,
        gamesPlayed: dbEntity.gamesPlayed,
        firstRatedGameAt: new Date(dbEntity.firstRatedGameAt),
        lastRatedGameAt: new Date(dbEntity.lastRatedGameAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
    };
}

function skillRatingGameFromDBEntity(dbEntity: SkillRatingGameDBEntity): SkillRatingGame {
    return {
        gameId: dbEntity.gameId,
        userId: dbEntity.userId,
        clubId: dbEntity.clubId,
        gameSize: dbEntity.gameSize,
        rank: dbEntity.rank,
        muBefore: dbEntity.muBefore,
        sigmaBefore: dbEntity.sigmaBefore,
        muAfter: dbEntity.muAfter,
        sigmaAfter: dbEntity.sigmaAfter,
        playedAt: new Date(dbEntity.playedAt),
    };
}

function clubSkillConfigFromDBEntity(dbEntity: ClubSkillConfigDBEntity): ClubSkillConfig {
    return {
        clubId: dbEntity.clubId,
        provisionalGameThreshold: dbEntity.provisionalGameThreshold,
        isEnabled: Boolean(dbEntity.isEnabled),
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy,
    };
}
