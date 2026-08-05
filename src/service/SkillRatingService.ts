import {
    DEFAULT_MU,
    DEFAULT_PROVISIONAL_GAME_THRESHOLD,
    DEFAULT_SIGMA,
    type ClubSkillConfig,
    type ResolvedSkillRating,
    type SkillLeaderboardEntry,
    type SkillLeaderboardResponse,
    type SkillRating,
    type SkillRecomputeResult,
    type UserClubSkillRatings,
    type UserSkillProfileResponse,
} from '../model/SkillModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import {
    SkillRatingRepository,
    type RatableGamePlayerDBEntity,
    type SkillRatingWithUserDBEntity,
} from '../repository/SkillRatingRepository.ts';
import { InvalidGameSize, SkillRatingNotEnabledForClub } from '../error/SkillErrors.ts';
import { inflateSigma, rateGame, toDisplaySkill } from '../util/SkillMathUtil.ts';
import { calculatePlacements } from '../util/GamePlacementUtil.ts';
import type { Wind } from '../model/GameModels.ts';
import { parseUmaTieBreak } from '../util/EnumUtil.ts';
import LogService from './LogService.ts';

export class SkillRatingService {
    private skillRatingRepository: SkillRatingRepository;
    private clubRepository: ClubRepository;
    private eventRepository: EventRepository;
    private gameRepository: GameRepository;
    private eventRegistrationRepository: EventRegistrationRepository;

    constructor(
        skillRatingRepository = new SkillRatingRepository(),
        clubRepository = new ClubRepository(),
        eventRepository = new EventRepository(),
        gameRepository = new GameRepository(),
        eventRegistrationRepository = new EventRegistrationRepository()
    ) {
        this.skillRatingRepository = skillRatingRepository;
        this.clubRepository = clubRepository;
        this.eventRepository = eventRepository;
        this.gameRepository = gameRepository;
        this.eventRegistrationRepository = eventRegistrationRepository;
    }

    getOrCreateConfig(clubId: number, modifiedBy: number = 0): ClubSkillConfig {
        const existing = this.skillRatingRepository.findClubSkillConfig(clubId);
        if (existing) {
            return existing;
        }

        const now = new Date();
        const defaultConfig: ClubSkillConfig = {
            clubId,
            provisionalGameThreshold: DEFAULT_PROVISIONAL_GAME_THRESHOLD,
            isEnabled: true,
            createdAt: now,
            modifiedAt: now,
            modifiedBy,
        };

        this.skillRatingRepository.upsertClubSkillConfig(defaultConfig);
        return defaultConfig;
    }

    updateConfig(
        clubId: number,
        provisionalGameThreshold: number | undefined,
        isEnabled: boolean | undefined,
        modifiedBy: number
    ): ClubSkillConfig {
        const current = this.getOrCreateConfig(clubId, modifiedBy);
        const updated: ClubSkillConfig = {
            ...current,
            provisionalGameThreshold: provisionalGameThreshold ?? current.provisionalGameThreshold,
            isEnabled: isEnabled ?? current.isEnabled,
            modifiedAt: new Date(),
            modifiedBy,
        };

        this.skillRatingRepository.upsertClubSkillConfig(updated);
        return updated;
    }

    /**
     * Single read path: formats and resolves effective sigma, display skill, and provisional status.
     */
    private resolve(
        row: {
            gameSize: number;
            mu: number;
            sigma: number;
            gamesPlayed: number;
            lastRatedGameAt: Date;
        },
        threshold: number,
        isDirty: boolean,
        now: Date = new Date()
    ): ResolvedSkillRating {
        const effectiveSigma = inflateSigma(row.sigma, row.lastRatedGameAt, now);
        const skill = toDisplaySkill(row.mu, effectiveSigma);
        const ordinal = row.mu - 3 * effectiveSigma;
        const isProvisional = row.gamesPlayed < threshold;
        const gamesUntilRanked = Math.max(0, threshold - row.gamesPlayed);
        const diffMs = now.getTime() - row.lastRatedGameAt.getTime();
        const daysSinceLastGame = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        return {
            gameSize: row.gameSize,
            skill,
            ordinal,
            mu: row.mu,
            sigma: row.sigma,
            effectiveSigma,
            gamesPlayed: row.gamesPlayed,
            isProvisional,
            gamesUntilRanked,
            provisionalGameThreshold: threshold,
            lastRatedGameAt: row.lastRatedGameAt,
            daysSinceLastGame,
            place: null,
            isStale: isDirty,
        };
    }

    getClubLeaderboard(
        clubId: number,
        gameSize: number,
        now: Date = new Date()
    ): SkillLeaderboardResponse {
        if (gameSize !== 3 && gameSize !== 4) {
            throw new InvalidGameSize(gameSize);
        }

        const config = this.getOrCreateConfig(clubId);
        if (!config.isEnabled) {
            throw new SkillRatingNotEnabledForClub(clubId);
        }

        const isStale = this.skillRatingRepository.isTrackDirty(clubId, gameSize);
        const rows = this.skillRatingRepository.findClubSkillRatingsWithUsers(clubId, gameSize);

        const { ranked, provisional } = this.buildResolvedLeaderboardEntries(
            rows,
            config.provisionalGameThreshold,
            isStale,
            now
        );

        return {
            clubId,
            gameSize,
            provisionalGameThreshold: config.provisionalGameThreshold,
            isStale,
            entries: ranked,
            provisionalEntries: provisional,
        };
    }

    private buildResolvedLeaderboardEntries(
        rows: SkillRatingWithUserDBEntity[],
        threshold: number,
        isStale: boolean,
        now: Date
    ): { ranked: SkillLeaderboardEntry[], provisional: SkillLeaderboardEntry[] } {
        const resolvedList: SkillLeaderboardEntry[] = rows.map(r => {
            const lastRatedGameAt = new Date(r.lastRatedGameAt);
            const resolved = this.resolve(
                {
                    gameSize: r.gameSize,
                    mu: r.mu,
                    sigma: r.sigma,
                    gamesPlayed: r.gamesPlayed,
                    lastRatedGameAt,
                },
                threshold,
                isStale,
                now
            );

            const isHidden = Boolean(r.profileHidden);
            return {
                ...resolved,
                userId: r.userId,
                userName: r.userName,
                telegramUsername: r.telegramUsername,
                profileFirstName: isHidden ? null : r.profileFirstName,
                profileLastName: isHidden ? null : r.profileLastName,
            };
        });

        const ranked = resolvedList.filter(e => !e.isProvisional);
        const provisional = resolvedList.filter(e => e.isProvisional);

        // Sort ranked: skill desc -> gamesPlayed desc -> userName asc
        ranked.sort((a, b) => {
            if (b.skill !== a.skill) return b.skill - a.skill;
            if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
            return a.userName.localeCompare(b.userName);
        });

        // Assign competition ranking (1, 2, 2, 4) on ties
        let currentPlace = 1;
        let prevEntry: SkillLeaderboardEntry | null = null;
        for (let i = 0; i < ranked.length; i++) {
            const entry = ranked[i]!;
            if (
                prevEntry !== null &&
                (entry.skill !== prevEntry.skill || entry.gamesPlayed !== prevEntry.gamesPlayed)
            ) {
                currentPlace = i + 1;
            }
            entry.place = currentPlace;
            prevEntry = entry;
        }

        // Sort provisional: gamesPlayed desc -> skill desc -> userName asc
        provisional.sort((a, b) => {
            if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
            if (b.skill !== a.skill) return b.skill - a.skill;
            return a.userName.localeCompare(b.userName);
        });

        return { ranked, provisional };
    }

    private calculateUserRankInTrack(
        clubId: number,
        gameSize: number,
        targetSkill: number,
        targetGamesPlayed: number,
        threshold: number,
        now: Date
    ): number {
        const rows = this.skillRatingRepository.findNonProvisionalTrackRatings(clubId, gameSize, threshold);
        let strictlyBetterCount = 0;
        for (const row of rows) {
            const effSigma = calculateEffectiveSigma(row.sigma, row.lastRatedGameAt, now);
            const skill = calculateConservativeSkill(row.mu, effSigma);
            if (skill > targetSkill || (skill === targetSkill && row.gamesPlayed > targetGamesPlayed)) {
                strictlyBetterCount++;
            }
        }
        return strictlyBetterCount + 1;
    }

    getUserSkillAcrossClubs(userId: number, now: Date = new Date()): UserSkillProfileResponse {
        const rows = this.skillRatingRepository.findUserSkillRatings(userId);

        if (rows.length === 0) {
            return {
                userId,
                primaryClubId: null,
                clubs: [],
            };
        }

        // Group rows by clubId
        const clubMap = new Map<number, SkillRating[]>();
        for (const row of rows) {
            const list = clubMap.get(row.clubId) ?? [];
            list.push(row);
            clubMap.set(row.clubId, list);
        }

        const clubs: UserClubSkillRatings[] = [];
        let maxGames = -1;
        let primaryClubId: number | null = null;

        for (const [clubId, trackRows] of clubMap.entries()) {
            const club = this.clubRepository.findClubById(clubId);
            const clubName = club?.name ?? `Club ${clubId}`;
            const config = this.getOrCreateConfig(clubId);

            let clubTotalGames = 0;
            const tracks: ResolvedSkillRating[] = [];

            for (const row of trackRows) {
                clubTotalGames += row.gamesPlayed;
                const isDirty = this.skillRatingRepository.isTrackDirty(clubId, row.gameSize);
                const resolved = this.resolve(row, config.provisionalGameThreshold, isDirty, now);

                if (!resolved.isProvisional) {
                    resolved.place = this.calculateUserRankInTrack(
                        clubId,
                        row.gameSize,
                        resolved.skill,
                        row.gamesPlayed,
                        config.provisionalGameThreshold,
                        now
                    );
                } else {
                    resolved.place = null;
                }

                tracks.push(resolved);
            }

            tracks.sort((a, b) => b.gameSize - a.gameSize); // Yonma first (4), then Sanma (3)

            clubs.push({
                clubId,
                clubName,
                totalRatedGames: clubTotalGames,
                tracks,
            });

            // Primary club selection: most rated games, ties -> lowest clubId
            if (
                clubTotalGames > maxGames ||
                (clubTotalGames === maxGames && (primaryClubId === null || clubId < primaryClubId))
            ) {
                maxGames = clubTotalGames;
                primaryClubId = clubId;
            }
        }

        clubs.sort((a, b) => a.clubId - b.clubId);

        return {
            userId,
            primaryClubId,
            clubs,
        };
    }

    applyFinishedGame(gameId: number, now: Date = new Date()): void {
        let targetClubId: number | undefined;
        let targetGameSize: number | undefined;

        try {
            const game = this.gameRepository.findGameById(gameId);
            if (!game || game.status !== 'FINISHED') {
                return;
            }

            const event = this.eventRepository.findEventById(game.eventId);
            if (!event || event.clubId === null) {
                return;
            }

            const clubId = event.clubId;
            targetClubId = clubId;

            const config = this.getOrCreateConfig(clubId);
            if (!config.isEnabled) {
                return;
            }

            const gameSize = event.gameRules.numberOfPlayers;
            if (gameSize !== 3 && gameSize !== 4) {
                return;
            }
            targetGameSize = gameSize;

            // Idempotency: if outcome rows exist for this game, revert first
            const existingOutcomes = this.skillRatingRepository.findSkillRatingGamesByGameId(gameId);
            if (existingOutcomes.length > 0) {
                this.revertFinishedGame(gameId);
            }

            const players = this.gameRepository.findGamePlayersByGameId(gameId);

            // Exclude filler players
            const ratablePlayers = players.filter(p => {
                const reg = this.eventRegistrationRepository.findRegistration(game.eventId, p.userId);
                return !reg?.isFillerPlayer;
            });

            if (ratablePlayers.length < 2) {
                return;
            }

            const playersWithRating = ratablePlayers.map(p => {
                const existing = this.skillRatingRepository.findSkillRating(clubId, p.userId, gameSize);
                return {
                    userId: p.userId,
                    points: p.points,
                    startPlace: p.startPlace as Wind | null | undefined,
                    mu: existing?.mu ?? DEFAULT_MU,
                    sigma: existing?.sigma ?? DEFAULT_SIGMA,
                };
            });

            const ranks = calculatePlacements(playersWithRating, event.gameRules.umaTieBreak);
            const rateOutputs = rateGame(playersWithRating, ranks);

            for (let i = 0; i < playersWithRating.length; i++) {
                const p = playersWithRating[i]!;
                const rank = ranks[i]!;
                const out = rateOutputs[i]!;
                const playedAt = game.createdAt;

                this.skillRatingRepository.insertSkillRatingGame({
                    gameId,
                    userId: p.userId,
                    clubId,
                    gameSize,
                    rank,
                    muBefore: p.mu,
                    sigmaBefore: p.sigma,
                    muAfter: out.mu,
                    sigmaAfter: out.sigma,
                    playedAt,
                });

                const existing = this.skillRatingRepository.findSkillRating(clubId, p.userId, gameSize);
                const gamesPlayed = (existing?.gamesPlayed ?? 0) + 1;
                const firstRatedGameAt = existing ? existing.firstRatedGameAt : playedAt;
                const lastRatedGameAt = existing && existing.lastRatedGameAt > playedAt
                    ? existing.lastRatedGameAt
                    : playedAt;

                this.skillRatingRepository.upsertSkillRating({
                    clubId,
                    userId: p.userId,
                    gameSize,
                    mu: out.mu,
                    sigma: out.sigma,
                    gamesPlayed,
                    firstRatedGameAt,
                    lastRatedGameAt,
                    modifiedAt: now,
                });
            }
        } catch (error) {
            LogService.logError(
                'SkillRatingService.applyFinishedGame failed',
                error instanceof Error ? error : new Error(String(error))
            );
            // Mark track dirty if clubId and valid gameSize were resolved
            if (targetClubId !== undefined && targetGameSize !== undefined) {
                try {
                    this.skillRatingRepository.markTrackDirty(
                        targetClubId,
                        targetGameSize,
                        `applyFinishedGame failed for game ${gameId}: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    );
                } catch {
                    // Ignore secondary error
                }
            }
        }
    }

    revertFinishedGame(gameId: number): void {
        let targetClubId: number | undefined;
        let targetGameSize: number | undefined;

        try {
            const outcomeRows = this.skillRatingRepository.findSkillRatingGamesByGameId(gameId);
            if (outcomeRows.length === 0) {
                return;
            }

            const clubId = outcomeRows[0]!.clubId;
            const gameSize = outcomeRows[0]!.gameSize;
            const playedAt = outcomeRows[0]!.playedAt;
            targetClubId = clubId;
            targetGameSize = gameSize;

            const isNewest = this.skillRatingRepository.isNewestGameInTrack(
                gameId,
                clubId,
                gameSize,
                playedAt
            );

            // Delete outcome rows first
            this.skillRatingRepository.deleteSkillRatingGamesByGameId(gameId);

            if (isNewest) {
                for (const row of outcomeRows) {
                    const existing = this.skillRatingRepository.findSkillRating(clubId, row.userId, gameSize);
                    if (!existing) continue;

                    const newGamesPlayed = existing.gamesPlayed - 1;
                    if (newGamesPlayed <= 0) {
                        this.skillRatingRepository.deleteSkillRatingForUser(clubId, row.userId, gameSize);
                    } else {
                        // Restore muBefore, sigmaBefore and find latest lastRatedGameAt
                        const lastGame = this.skillRatingRepository.findLastSkillRatingGame(
                            clubId,
                            row.userId,
                            gameSize
                        );
                        const lastRatedGameAt = lastGame ? lastGame.playedAt : existing.firstRatedGameAt;

                        this.skillRatingRepository.upsertSkillRating({
                            clubId,
                            userId: row.userId,
                            gameSize,
                            mu: row.muBefore,
                            sigma: row.sigmaBefore,
                            gamesPlayed: newGamesPlayed,
                            firstRatedGameAt: existing.firstRatedGameAt,
                            lastRatedGameAt,
                            modifiedAt: new Date(),
                        });
                    }
                }
            } else {
                // Non-head revert: recompute the entire track to restore consistent state
                this.recomputeTrack(clubId, gameSize, gameId);
            }
        } catch (error) {
            LogService.logError(
                'SkillRatingService.revertFinishedGame failed',
                error instanceof Error ? error : new Error(String(error))
            );
            if (targetClubId !== undefined && targetGameSize !== undefined) {
                try {
                    this.skillRatingRepository.markTrackDirty(
                        targetClubId,
                        targetGameSize,
                        `revertFinishedGame failed for game ${gameId}: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    );
                } catch {
                    // Ignore secondary error
                }
            }
        }
    }

    recomputeTrack(clubId: number, gameSize: number, excludeGameId?: number): SkillRecomputeResult {
        if (gameSize !== 3 && gameSize !== 4) {
            throw new InvalidGameSize(gameSize);
        }

        const startTime = Date.now();
        this.skillRatingRepository.deleteTrackData(clubId, gameSize);

        const rows = this.skillRatingRepository.findRatableGamesForTrack(clubId, gameSize);

        // Group rows by gameId preserving chronological order
        const gameMap = new Map<number, RatableGamePlayerDBEntity[]>();
        for (const row of rows) {
            if (excludeGameId !== undefined && row.gameId === excludeGameId) {
                continue;
            }
            const list = gameMap.get(row.gameId) ?? [];
            list.push(row);
            gameMap.set(row.gameId, list);
        }

        const playerState = new Map<
            number,
            {
                mu: number;
                sigma: number;
                gamesPlayed: number;
                firstRatedGameAt: Date;
                lastRatedGameAt: Date;
            }
        >();

        let gamesProcessed = 0;

        for (const [gameId, gamePlayers] of gameMap.entries()) {
            if (gamePlayers.length < 2) {
                continue;
            }

            const umaTieBreak = parseUmaTieBreak(gamePlayers[0]!.umaTieBreak);
            const playedAt = new Date(gamePlayers[0]!.gameCreatedAt);

            const rateInputs = gamePlayers.map(p => {
                const state = playerState.get(p.userId);
                return {
                    userId: p.userId,
                    points: p.points,
                    startPlace: p.startPlace as Wind | null | undefined,
                    mu: state?.mu ?? DEFAULT_MU,
                    sigma: state?.sigma ?? DEFAULT_SIGMA,
                };
            });

            const ranks = calculatePlacements(rateInputs, umaTieBreak);
            const rateOutputs = rateGame(rateInputs, ranks);

            for (let i = 0; i < rateInputs.length; i++) {
                const p = rateInputs[i]!;
                const rank = ranks[i]!;
                const out = rateOutputs[i]!;

                this.skillRatingRepository.insertSkillRatingGame({
                    gameId,
                    userId: p.userId,
                    clubId,
                    gameSize,
                    rank,
                    muBefore: p.mu,
                    sigmaBefore: p.sigma,
                    muAfter: out.mu,
                    sigmaAfter: out.sigma,
                    playedAt,
                });

                const state = playerState.get(p.userId);
                if (state) {
                    state.mu = out.mu;
                    state.sigma = out.sigma;
                    state.gamesPlayed += 1;
                    state.lastRatedGameAt = playedAt;
                } else {
                    playerState.set(p.userId, {
                        mu: out.mu,
                        sigma: out.sigma,
                        gamesPlayed: 1,
                        firstRatedGameAt: playedAt,
                        lastRatedGameAt: playedAt,
                    });
                }
            }

            gamesProcessed++;
        }

        // Flush playerState to DB
        const now = new Date();
        for (const [userId, state] of playerState.entries()) {
            this.skillRatingRepository.upsertSkillRating({
                clubId,
                userId,
                gameSize,
                mu: state.mu,
                sigma: state.sigma,
                gamesPlayed: state.gamesPlayed,
                firstRatedGameAt: state.firstRatedGameAt,
                lastRatedGameAt: state.lastRatedGameAt,
                modifiedAt: now,
            });
        }

        this.skillRatingRepository.clearTrackDirty(clubId, gameSize);
        const durationMs = Date.now() - startTime;

        LogService.logInfo(
            `SkillRatingService.recomputeTrack: club ${clubId}, gameSize ${gameSize}, processed ${gamesProcessed} games, ${playerState.size} players in ${durationMs}ms`,
            null
        );

        return {
            clubId,
            gameSize,
            gamesProcessed,
            playersAffected: playerState.size,
            durationMs,
        };
    }

    recomputeClub(clubId: number): SkillRecomputeResult[] {
        return [this.recomputeTrack(clubId, 4), this.recomputeTrack(clubId, 3)];
    }

    recomputeAll(): SkillRecomputeResult[] {
        const clubIds = this.skillRatingRepository.findAllClubsWithFinishedGames();
        const results: SkillRecomputeResult[] = [];
        for (const clubId of clubIds) {
            results.push(...this.recomputeClub(clubId));
        }
        return results;
    }
}
