import {
    DEFAULT_MU,
    DEFAULT_PROVISIONAL_GAME_THRESHOLD,
    DEFAULT_SIGMA,
    type ClubSkillConfig,
    type CustomSkillLeaderboardResponse,
    type ResolvedSkillRating,
    type SkillLeaderboardEntry,
    type SkillLeaderboardResponse,
    type SkillRating,
    type SkillRecomputeResult,
    type UserClubSkillRatings,
    type UserGlobalSkillRating,
    type UserSkillProfileResponse,
} from '../model/SkillModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import {
    SkillRatingRepository,
    type RatableGamePlayerDBEntity,
    type SkillRatingWithUserDBEntity,
} from '../repository/SkillRatingRepository.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { InvalidGameSize, SkillRatingNotEnabledForClub } from '../error/SkillErrors.ts';
import { ClubNotFoundError } from '../error/ClubErrors.ts';
import { UnknownEventTagError } from '../error/EventErrors.ts';
import { UserNotFoundById } from '../error/UserErrors.ts';
import { inflateSigma, rateGame, toDisplaySkill, toOrdinal } from '../util/SkillMathUtil.ts';
import { calculatePlacements } from '../util/GamePlacementUtil.ts';
import type { Wind } from '../model/GameModels.ts';
import { parseUmaTieBreak } from '../util/EnumUtil.ts';
import LogService from './LogService.ts';

/**
 * Cached replay results for ad-hoc leaderboards, keyed by filter.
 *
 * Module-level on purpose: GameService, TrackedGameService and SkillController
 * each construct their own SkillRatingService, so a per-instance cache would let
 * one instance invalidate its copy while another kept serving stale numbers.
 *
 * Only the *replay state* is cached — not the formatted response. Sigma
 * inflation depends on `now` and the ranked/provisional split depends on the
 * threshold, so both are recomputed per request from the cached mu/sigma.
 *
 * Invalidated explicitly by invalidateSkillReplayCache() at the same hook points
 * that update stored ratings, rather than by a derived key: an edit can change
 * points without changing game count or max id, and a key that misses that would
 * serve wrong numbers indefinitely.
 *
 * Measured at ~267 KiB for the full global board at current scale (281 entries).
 */
const replayCache = new Map<string, { playerState: Map<number, ReplayPlayerState>, gamesProcessed: number }>();

export function invalidateSkillReplayCache(): void {
    replayCache.clear();
}

/** Exposed for tests; not part of the service contract. */
export function skillReplayCacheSize(): number {
    return replayCache.size;
}

export class SkillRatingService {
    private skillRatingRepository: SkillRatingRepository;
    private clubRepository: ClubRepository;
    private eventRepository: EventRepository;
    private gameRepository: GameRepository;
    private userRepository: UserRepository;

    constructor(
        skillRatingRepository = new SkillRatingRepository(),
        clubRepository = new ClubRepository(),
        eventRepository = new EventRepository(),
        gameRepository = new GameRepository(),
        userRepository = new UserRepository()
    ) {
        this.skillRatingRepository = skillRatingRepository;
        this.clubRepository = clubRepository;
        this.eventRepository = eventRepository;
        this.gameRepository = gameRepository;
        this.userRepository = userRepository;
    }

    getOrCreateConfig(clubId: number, modifiedBy: number = 0): ClubSkillConfig {
        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new ClubNotFoundError(clubId);
        }

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

        // Games that finished while rating was off never reached the stored
        // track, so on re-enable it is missing them permanently. Flag both
        // tracks so the staleness is visible and a recompute repairs it.
        if (isEnabled === true && !current.isEnabled) {
            const markedAt = new Date();
            for (const gameSize of [3, 4]) {
                this.skillRatingRepository.markTrackDirty(
                    clubId,
                    gameSize,
                    'skill rating re-enabled; games finished while disabled are missing',
                    markedAt
                );
            }
        }

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
        const ordinal = toOrdinal(row.mu, effectiveSigma);
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

    /**
     * Replays a filtered slice, serving from the module cache when possible.
     *
     * The cached value is immutable state read by the caller, never mutated in
     * place — buildResolvedLeaderboardEntries copies mu/sigma into fresh rows.
     */
    private replayFiltered(filter: {
        clubId: number | null;
        gameSize: number;
        tags: string[];
        matchAll: boolean;
        eventType: string | null;
    }): { playerState: Map<number, ReplayPlayerState>, gamesProcessed: number } {
        // Sorted tags so ?tags=EMA,LEAGUE and ?tags=LEAGUE,EMA share an entry.
        const key = JSON.stringify([
            filter.clubId,
            filter.gameSize,
            [...filter.tags].sort(),
            filter.matchAll,
            filter.eventType,
        ]);

        const cached = replayCache.get(key);
        if (cached) {
            return cached;
        }

        const rows = this.skillRatingRepository.findRatableGamesFiltered(filter);
        const { playerState, gamesProcessed } = replayGames(rows);
        replayCache.set(key, { playerState, gamesProcessed });
        return { playerState, gamesProcessed };
    }

    /**
     * Builds a leaderboard for an arbitrary slice of games — a club, all clubs,
     * specific tags, an event type — by replaying that slice on demand.
     *
     * Nothing is stored. The stored `skillRating` table always holds the
     * all-games rating for a club; this exists so custom cuts can be explored
     * without a second persisted rating to keep in sync.
     *
     * Each call is an independent replay from scratch, so scores from different
     * filters are NOT comparable: a smaller pool leaves players less converged.
     */
    getCustomLeaderboard(
        filter: {
            clubId: number | null;
            gameSize: number;
            tags: string[];
            matchAll: boolean;
            eventType: string | null;
            provisionalGameThreshold: number;
        },
        now: Date = new Date()
    ): CustomSkillLeaderboardResponse {
        if (filter.gameSize !== 3 && filter.gameSize !== 4) {
            throw new InvalidGameSize(filter.gameSize);
        }

        for (const tag of filter.tags) {
            if (!this.eventRepository.tagExists(tag)) {
                throw new UnknownEventTagError(tag);
            }
        }

        const startTime = Date.now();
        const { playerState, gamesProcessed } = this.replayFiltered(filter);

        const users = this.skillRatingRepository.findUserDisplayFields([...playerState.keys()]);
        const userById = new Map(users.map(u => [u.userId, u]));

        // Reuse the stored leaderboard's resolve/sort path so an ad-hoc board
        // formats and orders identically to the persisted one.
        const asRows: SkillRatingWithUserDBEntity[] = [];
        for (const [userId, state] of playerState.entries()) {
            const user = userById.get(userId);
            if (!user) {
                continue;
            }
            asRows.push({
                userId,
                gameSize: filter.gameSize,
                mu: state.mu,
                sigma: state.sigma,
                gamesPlayed: state.gamesPlayed,
                lastRatedGameAt: state.lastRatedGameAt.toISOString(),
                userName: user.userName,
                telegramUsername: user.telegramUsername,
                profileFirstName: user.profileFirstName,
                profileLastName: user.profileLastName,
                profileHidden: user.profileHidden,
            } as SkillRatingWithUserDBEntity);
        }

        const { ranked, provisional } = this.buildResolvedLeaderboardEntries(
            asRows,
            filter.provisionalGameThreshold,
            false,
            now
        );

        return {
            clubId: filter.clubId,
            gameSize: filter.gameSize,
            tags: filter.tags,
            matchAll: filter.matchAll,
            eventType: filter.eventType,
            provisionalGameThreshold: filter.provisionalGameThreshold,
            gamesProcessed,
            playersTotal: playerState.size,
            durationMs: Date.now() - startTime,
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
            const effSigma = inflateSigma(row.sigma, row.lastRatedGameAt, now);
            const skill = toDisplaySkill(row.mu, effSigma);
            if (skill > targetSkill || (skill === targetSkill && row.gamesPlayed > targetGamesPlayed)) {
                strictlyBetterCount++;
            }
        }
        return strictlyBetterCount + 1;
    }

    getUserSkillAcrossClubs(userId: number, now: Date = new Date()): UserSkillProfileResponse {
        const user = this.userRepository.findUserById(userId);
        if (!user) {
            throw new UserNotFoundById(userId);
        }

        const rows = this.skillRatingRepository.findUserSkillRatings(userId);

        if (rows.length === 0) {
            return {
                userId,
                primaryClubId: null,
                clubs: [],
                global: this.getUserGlobalSkill(userId, now),
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
            global: this.getUserGlobalSkill(userId, now),
        };
    }

    /**
     * The player's cross-club standing, one entry per game size they have played.
     *
     * Computed by replaying every rated game (~70ms for the full history) rather
     * than stored — see getCustomLeaderboard. Returns [] for a player with no
     * rated games. Uses the default threshold, since no single club's config
     * governs a global board.
     */
    private getUserGlobalSkill(userId: number, now: Date): UserGlobalSkillRating[] {
        const result: UserGlobalSkillRating[] = [];

        // Only replay sizes this player has actually played — a full replay per
        // size is the dominant cost of a profile view, and most players have
        // never played sanma.
        const playedSizes = this.skillRatingRepository.findGameSizesPlayedByUser(userId);

        for (const gameSize of playedSizes) {
            const board = this.getCustomLeaderboard(
                {
                    clubId: null,
                    gameSize,
                    tags: [],
                    matchAll: false,
                    eventType: null,
                    provisionalGameThreshold: DEFAULT_PROVISIONAL_GAME_THRESHOLD,
                },
                now
            );

            const entry = board.entries.find(e => e.userId === userId) ??
                board.provisionalEntries.find(e => e.userId === userId);
            if (!entry) {
                continue;
            }

            // `place` is already set for ranked entries by the leaderboard sort;
            // provisional players have no rank by definition.
            const {
                userId: _u,
                userName: _n,
                telegramUsername: _t,
                profileFirstName: _f,
                profileLastName: _l,
                ...resolved
            } = entry;
            result.push({ ...resolved, rankedPlayers: board.entries.length });
        }

        return result;
    }

    applyFinishedGame(gameId: number, now: Date = new Date()): void {
        let targetClubId: number | undefined;
        let targetGameSize: number | undefined;

        // Unconditional: a call that errors partway may still have written rows,
        // and an early return can follow a state change in a prior call.
        invalidateSkillReplayCache();

        try {
            const game = this.gameRepository.findGameById(gameId);
            if (!game || game.status !== 'FINISHED') {
                return;
            }

            const event = this.eventRepository.findEventById(game.eventId);
            if (!event || event.clubId === null) {
                return;
            }

            // Must mirror the `e.isRated = 1` filter in the replay queries: rating
            // a non-rated game here would diverge from every later recompute.
            if (!event.isRated) {
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

            // Appending only reproduces a replay when this game is the newest in
            // the track. Rating an older game against current state would order
            // history differently from `ORDER BY createdAt, id` and leave the
            // track wrong with nothing marking it dirty — so rebuild instead.
            // Mirrors the non-head branch of revertFinishedGame.
            if (!this.skillRatingRepository.isNewestGameInTrack(gameId, clubId, gameSize, game.createdAt)) {
                this.recomputeTrack(clubId, gameSize);
                return;
            }

            const players = this.gameRepository.findGamePlayersByGameId(gameId);

            // Exclude filler players. Checks every event, not just this one:
            // game-creation paths never write eventRegistration rows, so a
            // per-event check would rate placeholder seats that a replay drops.
            const ratablePlayers = players.filter(p => !this.skillRatingRepository.isFillerInAnyEvent(p.userId));

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

        invalidateSkillReplayCache();

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

        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new ClubNotFoundError(clubId);
        }

        invalidateSkillReplayCache();

        const startTime = Date.now();
        this.skillRatingRepository.deleteTrackData(clubId, gameSize);

        const rows = this.skillRatingRepository.findRatableGamesForTrack(clubId, gameSize);
        const { playerState, gamesProcessed, outcomes } = replayGames(rows, excludeGameId);

        for (const outcome of outcomes) {
            this.skillRatingRepository.insertSkillRatingGame({ ...outcome, clubId, gameSize });
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

export interface ReplayPlayerState {
    mu: number;
    sigma: number;
    gamesPlayed: number;
    firstRatedGameAt: Date;
    lastRatedGameAt: Date;
}

export interface ReplayGameOutcome {
    gameId: number;
    userId: number;
    rank: number;
    muBefore: number;
    sigmaBefore: number;
    muAfter: number;
    sigmaAfter: number;
    playedAt: Date;
}

/**
 * Replays rated games in the given order, accumulating per-player skill state.
 *
 * Pure: no DB access. This is the single implementation of the rating loop —
 * both the stored `recomputeTrack` and the ad-hoc filtered leaderboard call it,
 * so the two can never disagree about what a set of games implies. Do not
 * inline a second copy of this loop.
 *
 * `rows` must already be ordered chronologically (createdAt, id, userId); the
 * userId key fixes array order because float summation is not associative.
 */
export function replayGames(
    rows: RatableGamePlayerDBEntity[],
    excludeGameId?: number
): { playerState: Map<number, ReplayPlayerState>, gamesProcessed: number, outcomes: ReplayGameOutcome[] } {
    const gameMap = new Map<number, RatableGamePlayerDBEntity[]>();
    for (const row of rows) {
        if (excludeGameId !== undefined && row.gameId === excludeGameId) {
            continue;
        }
        const list = gameMap.get(row.gameId) ?? [];
        list.push(row);
        gameMap.set(row.gameId, list);
    }

    const playerState = new Map<number, ReplayPlayerState>();
    const outcomes: ReplayGameOutcome[] = [];
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
            const out = rateOutputs[i]!;

            outcomes.push({
                gameId,
                userId: p.userId,
                rank: ranks[i]!,
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

    return { playerState, gamesProcessed, outcomes };
}
