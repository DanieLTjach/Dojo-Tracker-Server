import { Wind } from '../model/GameModels.ts';
import type { GameRoundResult, WinningHandData } from '../model/GameRoundResultModels.ts';
import type { HandDetail, YakuCode } from '../mahjong/types.ts';
import {
    AUTOMATIC_ACHIEVEMENTS_BY_CODE,
    type AutomaticAchievementDefinition,
} from '../data/automaticAchievementCatalog.ts';

// Maps a persisted yaku code to the first-win achievement it unlocks.
const YAKU_FIRST_CODES: ReadonlyArray<readonly [YakuCode, string]> = [
    ['pinfu', 'FIRST_PINFU'],
    ['tanyao', 'FIRST_TANYAO'],
    ['iipeikou', 'FIRST_IIPEIKOU'],
    ['ryanpeikou', 'FIRST_RYANPEIKOU'],
    ['sanshoku_doujun', 'FIRST_SANSHOKU_DOUJUN'],
    ['sanshoku_doukou', 'FIRST_SANSHOKU_DOUKOU'],
    ['ittsuu', 'FIRST_ITTSUU'],
    ['chanta', 'FIRST_CHANTA'],
    ['junchan', 'FIRST_JUNCHAN'],
    ['toitoi', 'FIRST_TOITOI'],
    ['sanankou', 'FIRST_SANANKOU'],
    ['sankantsu', 'FIRST_SANKANTSU'],
    ['shousangen', 'FIRST_SHOUSANGEN'],
    ['honroutou', 'FIRST_HONROUTOU'],
    ['honitsu', 'FIRST_HONITSU'],
    ['chinitsu', 'FIRST_CHINITSU'],
];

const YAKUMAN_FIRST_CODES: ReadonlyArray<readonly [YakuCode, string]> = [
    ['kokushi_musou', 'FIRST_KOKUSHI'],
    ['kokushi_musou_13', 'FIRST_KOKUSHI_13'],
    ['suuankou', 'FIRST_SUUANKOU'],
    ['suuankou_tanki', 'FIRST_SUUANKOU_TANKI'],
    ['daisangen', 'FIRST_DAISANGEN'],
    ['daisuushi', 'FIRST_DAISUUSHI'],
    ['shousuushi', 'FIRST_SHOUSUUSHI'],
    ['tsuisou', 'FIRST_TSUISOU'],
    ['ryuisou', 'FIRST_RYUUISOU'],
    ['chinroutou', 'FIRST_CHINROUTOU'],
    ['suukantsu', 'FIRST_SUUKANTSU'],
    ['chuuren_poutou', 'FIRST_CHUUREN'],
    ['junsei_chuuren_poutou', 'FIRST_JUNSEI_CHUUREN'],
];

const YAKUHAI_CODES: ReadonlySet<YakuCode> = new Set<YakuCode>([
    'haku',
    'hatsu',
    'chun',
    'jikaze_ton',
    'jikaze_nan',
    'jikaze_shaa',
    'jikaze_pei',
    'bakaze_ton',
    'bakaze_nan',
    'bakaze_shaa',
    'bakaze_pei',
]);

// Career counters keyed by the yaku code they count.
const YAKU_COUNTER_CODES: ReadonlyArray<readonly [YakuCode, string, number]> = [
    ['pinfu', 'PINFU_10', 10],
    ['tanyao', 'TANYAO_25', 25],
    ['chiitoitsu', 'CHIITOITSU_10', 10],
    ['honitsu', 'HONITSU_10', 10],
    ['chinitsu', 'CHINITSU_5', 5],
];

// Timing achievements detected via a yaku code with a handDetail context-flag fallback.
const TIMING_FLAGS: ReadonlyArray<readonly [YakuCode, keyof NonNullable<HandDetail['context']>, string]> = [
    ['ippatsu', 'ippatsu', 'FIRST_IPPATSU'],
    ['double_riichi', 'doubleRiichi', 'FIRST_DOUBLE_RIICHI'],
    ['haitei', 'haitei', 'FIRST_HAITEI'],
    ['houtei', 'houtei', 'FIRST_HOUTEI'],
    ['rinshan_kaihou', 'rinshanKaihou', 'FIRST_RINSHAN'],
    ['chankan', 'chankan', 'FIRST_CHANKAN'],
    ['tenhou', 'tenhou', 'FIRST_TENHOU'],
    ['chiihou', 'chiihou', 'FIRST_CHIIHOU'],
    ['renhou', 'renhou', 'FIRST_RENHOU'],
];

export interface EvaluatorGamePlayer {
    userId: number;
    points: number;
    startPlace: Wind | null;
    isSubstitutePlayer: boolean;
    isFillerPlayer: boolean;
}

export interface EvaluatorGameRound {
    roundNumber: number;
    wind: Wind;
    dealerNumber: number;
    counters: number;
    riichiSticks: number;
    result: GameRoundResult;
}

export interface EvaluatorGame {
    id: number;
    clubId: number;
    eventId: number;
    gameSize: 3 | 4;
    startedAt: Date;
    endedAt: Date;
    players: EvaluatorGamePlayer[];
    rounds: EvaluatorGameRound[];
    startingDie1?: number | null;
    startingDie2?: number | null;
}

export interface EvaluatorEventPlacement {
    eventId: number;
    clubId: number;
    isSeason: boolean;
    dateTo: Date;
    isFinished: boolean;
    placements: {
        userId: number;
        place: number;
        isEligible: boolean;
    }[];
}

export interface EvaluatorSkillUserSnapshot {
    userId: number;
    initialMu: number;
    initialSigma: number;
    initialDisplayRating: number;
    finalMu: number;
    finalSigma: number;
    finalDisplayRating: number;
    place: number;
}

export interface EvaluatorSkillGameResult {
    clubId: number;
    gameSize: 3 | 4;
    gameId: number;
    timestamp: Date;
    userSnapshots: EvaluatorSkillUserSnapshot[];
}

export interface ComputedAchievementState {
    userId: number;
    code: string;
    scope: string;
    progress: number;
    target: number;
    unlockedAt: Date | null;
    sourceEventId: number | null;
    sourceGameId: number | null;
    sourceRoundNumber: number | null;
    value: number | null;
}

interface UserTracker {
    userId: number;
    // Career counts
    gamesCount: number;
    winsCount: number;
    winStreak: number;
    maxWinStreak: number;
    top2Streak: number;
    maxTop2Streak: number;
    yonmaWinningSeats: Set<Wind>;

    // Hand counts
    riichiCount: number;
    dealerStreak: number;
    exhaustiveDrawTenpaiCount: number;
    noDealInStreak: number;
    lostRiichiSticksCount: number;
    tsumoLossPoints: number;

    // Hand-detail counts (rounds recorded with handDetail)
    tsumoWinsCount: number;
    ronWinsCount: number;
    menzenWinsCount: number;
    openHandWinsCount: number;
    ippatsuWinsCount: number;
    kansCount: number;
    paoPaidCount: number;
    yakuWins: Map<YakuCode, number>;

    // Sanma counts
    sanmaGamesCount: number;
    sanmaWinsCount: number;

    // Dice counts
    diceRollsCount: number;
    diceDoublesCount: number;

    // Event counts
    eventsPlayed: Set<number>;
    podiumCount: number;
    championshipCount: number;

    // OpenSkill tracks: scope -> peakRating
    openSkillGamesCount: Map<string, number>;
    openSkillPeakRating: Map<string, number>;
}

function newUserTracker(userId: number): UserTracker {
    return {
        userId,
        gamesCount: 0,
        winsCount: 0,
        winStreak: 0,
        maxWinStreak: 0,
        top2Streak: 0,
        maxTop2Streak: 0,
        yonmaWinningSeats: new Set<Wind>(),
        riichiCount: 0,
        dealerStreak: 0,
        exhaustiveDrawTenpaiCount: 0,
        noDealInStreak: 0,
        lostRiichiSticksCount: 0,
        tsumoLossPoints: 0,
        tsumoWinsCount: 0,
        ronWinsCount: 0,
        menzenWinsCount: 0,
        openHandWinsCount: 0,
        ippatsuWinsCount: 0,
        kansCount: 0,
        paoPaidCount: 0,
        yakuWins: new Map<YakuCode, number>(),
        sanmaGamesCount: 0,
        sanmaWinsCount: 0,
        diceRollsCount: 0,
        diceDoublesCount: 0,
        eventsPlayed: new Set<number>(),
        podiumCount: 0,
        championshipCount: 0,
        openSkillGamesCount: new Map<string, number>(),
        openSkillPeakRating: new Map<string, number>(),
    };
}

export function evaluateAutomaticAchievements(
    games: EvaluatorGame[],
    eventPlacements: EvaluatorEventPlacement[],
    skillResults: EvaluatorSkillGameResult[]
): ComputedAchievementState[] {
    const states = new Map<string, ComputedAchievementState>();

    const stateKey = (userId: number, code: string, scope: string) => `${userId}:${code}:${scope}`;

    const trackers = new Map<number, UserTracker>();
    const getTracker = (userId: number): UserTracker => {
        let t = trackers.get(userId);
        if (t === undefined) {
            t = newUserTracker(userId);
            trackers.set(userId, t);
        }
        return t;
    };

    const getOrCreateState = (
        userId: number,
        def: AutomaticAchievementDefinition,
        scope: string
    ): ComputedAchievementState => {
        const key = stateKey(userId, def.code, scope);
        let s = states.get(key);
        if (s === undefined) {
            s = {
                userId,
                code: def.code,
                scope,
                progress: 0,
                target: def.target,
                unlockedAt: null,
                sourceEventId: null,
                sourceGameId: null,
                sourceRoundNumber: null,
                value: null,
            };
            states.set(key, s);
        }
        return s;
    };

    const unlock = (
        userId: number,
        def: AutomaticAchievementDefinition,
        scope: string,
        evidence: {
            progress?: number;
            unlockedAt: Date;
            sourceEventId?: number | null;
            sourceGameId?: number | null;
            sourceRoundNumber?: number | null;
            value?: number | null;
        }
    ) => {
        const s = getOrCreateState(userId, def, scope);
        if (s.unlockedAt === null) {
            s.progress = evidence.progress ?? def.target;
            s.unlockedAt = evidence.unlockedAt;
            s.sourceEventId = (evidence.sourceEventId && evidence.sourceEventId > 0) ? evidence.sourceEventId : null;
            s.sourceGameId = (evidence.sourceGameId && evidence.sourceGameId > 0) ? evidence.sourceGameId : null;
            s.sourceRoundNumber = evidence.sourceRoundNumber ?? null;
            s.value = evidence.value ?? null;
        }
    };

    const updateProgress = (
        userId: number,
        def: AutomaticAchievementDefinition,
        scope: string,
        currentProgress: number
    ) => {
        const s = getOrCreateState(userId, def, scope);
        if (s.unlockedAt === null) {
            s.progress = Math.min(currentProgress, def.target);
        }
    };

    // Sort games chronologically
    const sortedGames = [...games].sort((a, b) => {
        const diff = a.endedAt.getTime() - b.endedAt.getTime();
        return diff !== 0 ? diff : a.id - b.id;
    });

    // 1. PROCESS GAMES
    for (const game of sortedGames) {
        const validPlayers = game.players.filter(p => p.userId !== 0 && !p.isFillerPlayer);
        if (validPlayers.length === 0) continue;

        // Rank players by points descending
        const rankedPlayers = [...validPlayers].sort((a, b) => b.points - a.points);
        const topScore = rankedPlayers[0]!.points;
        const secondScore = rankedPlayers.length > 1 ? rankedPlayers[1]!.points : topScore;

        for (let i = 0; i < rankedPlayers.length; i++) {
            const player = rankedPlayers[i]!;
            const place = i + 1;
            const isWinner = place === 1;
            const isTop2 = place <= 2;
            const tracker = getTracker(player.userId);

            // Career Games
            tracker.gamesCount += 1;
            checkThreshold(tracker.userId, 'GAMES_1', 1, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_10', 10, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_50', 50, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_100', 100, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_250', 250, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_500', 500, tracker.gamesCount, game);
            checkThreshold(tracker.userId, 'GAMES_1000', 1000, tracker.gamesCount, game);

            if (game.gameSize === 3) {
                tracker.sanmaGamesCount += 1;
                checkThreshold(tracker.userId, 'SANMA_GAMES_1', 1, tracker.sanmaGamesCount, game);
                checkThreshold(tracker.userId, 'SANMA_GAMES_10', 10, tracker.sanmaGamesCount, game);
                checkThreshold(tracker.userId, 'SANMA_GAMES_50', 50, tracker.sanmaGamesCount, game);
                checkThreshold(tracker.userId, 'SANMA_GAMES_100', 100, tracker.sanmaGamesCount, game);
            }

            // Finish exact zero
            if (player.points === 0) {
                unlockCode(player.userId, 'FINISH_EXACT_ZERO', game);
            }

            // Top2 Streak
            if (isTop2) {
                tracker.top2Streak += 1;
                checkStreak(player.userId, 'STREAK_TOP2_5', 5, tracker.top2Streak, game);
            } else {
                tracker.top2Streak = 0;
                updateStreakProgress(player.userId, 'STREAK_TOP2_5', tracker.top2Streak);
            }

            // Wins
            if (isWinner) {
                tracker.winsCount += 1;
                checkThreshold(tracker.userId, 'WINS_1', 1, tracker.winsCount, game);
                checkThreshold(tracker.userId, 'WINS_10', 10, tracker.winsCount, game);
                checkThreshold(tracker.userId, 'WINS_50', 50, tracker.winsCount, game);
                checkThreshold(tracker.userId, 'WINS_100', 100, tracker.winsCount, game);

                if (game.gameSize === 3) {
                    tracker.sanmaWinsCount += 1;
                    checkThreshold(tracker.userId, 'SANMA_WINS_1', 1, tracker.sanmaWinsCount, game);
                    checkThreshold(tracker.userId, 'SANMA_WINS_10', 10, tracker.sanmaWinsCount, game);
                }

                tracker.winStreak += 1;
                checkStreak(player.userId, 'STREAK_WINS_3', 3, tracker.winStreak, game);

                if (player.startPlace === Wind.EAST) {
                    unlockCode(player.userId, 'WIN_STARTING_EAST', game);
                }

                if (game.gameSize === 4 && player.startPlace !== null) {
                    tracker.yonmaWinningSeats.add(player.startPlace);
                    if (tracker.yonmaWinningSeats.size === 4) {
                        unlockCode(player.userId, 'FOUR_WIND_COLLECTION', game);
                    } else {
                        updateCodeProgress(player.userId, 'FOUR_WIND_COLLECTION', tracker.yonmaWinningSeats.size);
                    }
                }

                const margin = topScore - secondScore;
                if (margin > 0 && margin <= 1000) {
                    unlockCode(player.userId, 'WIN_BY_MARGIN_1000', game, margin);
                }
                if (margin >= 30000) {
                    unlockCode(player.userId, 'WIN_BY_MARGIN_30000', game, margin);
                }

                // Check comeback from negative points
                if (game.rounds.length > 0) {
                    let hadNegativePoints = false;
                    // Check initial or round point states
                    for (const rd of game.rounds) {
                        for (const pc of rd.result.playerPointChanges) {
                            if (pc.playerId === player.userId && pc.pointChange < 0) {
                                // check if points dropped below 0
                                // if round result has state or if point change indicates negative
                                hadNegativePoints = true;
                            }
                        }
                    }
                    if (hadNegativePoints) {
                        unlockCode(player.userId, 'COMEBACK_NEGATIVE_TO_FIRST', game);
                    }
                }
            } else {
                tracker.winStreak = 0;
                updateStreakProgress(player.userId, 'STREAK_WINS_3', tracker.winStreak);
            }
        }

        // DICE RECORDED FOR STARTING EAST PLAYER
        if (
            game.startingDie1 !== undefined &&
            game.startingDie1 !== null &&
            game.startingDie2 !== undefined &&
            game.startingDie2 !== null
        ) {
            const die1 = game.startingDie1;
            const die2 = game.startingDie2;
            const startingEastPlayer = game.players.find(
                p => p.startPlace === Wind.EAST && p.userId !== 0 && !p.isFillerPlayer
            );
            if (startingEastPlayer !== undefined) {
                const dt = getTracker(startingEastPlayer.userId);
                dt.diceRollsCount += 1;
                unlockCode(startingEastPlayer.userId, 'DICE_FIRST_ROLL', game);

                const sum = die1 + die2;
                const isDouble = die1 === die2;

                if (die1 === 1 && die2 === 1) unlockCode(startingEastPlayer.userId, 'DICE_SNAKE_EYES', game);
                if (die1 === 6 && die2 === 6) unlockCode(startingEastPlayer.userId, 'DICE_BOXCARS', game);
                if (sum === 7) unlockCode(startingEastPlayer.userId, 'DICE_LUCKY_SEVEN', game);
                if (isDouble) {
                    unlockCode(startingEastPlayer.userId, 'DICE_ANY_DOUBLE', game);
                    dt.diceDoublesCount += 1;
                    checkThreshold(startingEastPlayer.userId, 'DICE_TEN_DOUBLES', 10, dt.diceDoublesCount, game);
                }
            }
        }

        // HAND & ROUND LEVEL ACHIEVEMENTS (for games with tracked rounds)
        if (game.rounds.length > 0) {
            const startPlaceToPlayerId = new Map<Wind, number>();
            for (const p of game.players) {
                if (p.startPlace !== null) startPlaceToPlayerId.set(p.startPlace, p.userId);
            }

            for (const round of game.rounds) {
                const res = round.result;
                const dealerWind = Object.values(Wind)[round.dealerNumber - 1];
                const dealerUserId = dealerWind !== undefined ? startPlaceToPlayerId.get(dealerWind) : undefined;

                const riichiPlayerIds = new Set<number>(res.type === 'CHOMBO' ? [] : res.riichiPlayerIds);

                for (const pid of riichiPlayerIds) {
                    if (pid === 0) continue;
                    const t = getTracker(pid);
                    t.riichiCount += 1;
                    unlockCode(pid, 'FIRST_RIICHI', game, round.roundNumber);
                    checkThreshold(pid, 'RIICHI_10', 10, t.riichiCount, game, round.roundNumber);
                    checkThreshold(pid, 'RIICHI_100', 100, t.riichiCount, game, round.roundNumber);
                }

                // Winning hands
                const winningHands = iterWinningHands(res);
                const winnerUserIds = new Set<number>(winningHands.map(h => h.hand.winnerPlayerId));

                for (const { hand, winType } of winningHands) {
                    const winnerId = hand.winnerPlayerId;
                    if (winnerId === 0) continue;
                    const isSanma = game.gameSize === 3;

                    if (winType === 'RON') {
                        unlockCode(winnerId, 'FIRST_RON', game, round.roundNumber);
                    } else if (winType === 'TSUMO') {
                        unlockCode(winnerId, 'FIRST_TSUMO', game, round.roundNumber);
                        if (isSanma) unlockCode(winnerId, 'SANMA_FIRST_TSUMO', game, round.roundNumber);
                    }

                    // Career tsumo/ron win counters (round type is known for all tracked rounds)
                    const wt = getTracker(winnerId);
                    if (winType === 'TSUMO') {
                        wt.tsumoWinsCount += 1;
                        checkThreshold(winnerId, 'TSUMO_WINS_50', 50, wt.tsumoWinsCount, game, round.roundNumber);
                    } else {
                        wt.ronWinsCount += 1;
                        checkThreshold(winnerId, 'RON_WINS_50', 50, wt.ronWinsCount, game, round.roundNumber);
                    }

                    // Full pao liability for a yakuman (payer, usually not the winner)
                    const paoPayerId = hand.yakumanLiabilityPlayerId;
                    if (paoPayerId !== undefined && paoPayerId !== 0) {
                        unlockCode(paoPayerId, 'YAKUMAN_LIABILITY', game, round.roundNumber);
                        const pt = getTracker(paoPayerId);
                        pt.paoPaidCount += 1;
                        checkThreshold(paoPayerId, 'PAID_PAO_3', 3, pt.paoPaidCount, game, round.roundNumber);
                    }

                    // --- Hand-detail derived achievements ---
                    const melds = hand.handDetail?.melds ?? [];

                    // Kans in the winning hand
                    const kanMelds = melds.filter(m =>
                        m.type === 'ANKAN' || m.type === 'DAIMINKAN' || m.type === 'KAKAN'
                    );
                    if (kanMelds.length > 0) {
                        unlockCode(winnerId, 'FIRST_KAN', game, round.roundNumber);
                        if (kanMelds.some(m => m.type === 'ANKAN')) {
                            unlockCode(winnerId, 'FIRST_ANKAN', game, round.roundNumber);
                        }
                        if (kanMelds.some(m => m.type === 'DAIMINKAN')) {
                            unlockCode(winnerId, 'FIRST_DAIMINKAN', game, round.roundNumber);
                        }
                        if (kanMelds.some(m => m.type === 'KAKAN')) {
                            unlockCode(winnerId, 'FIRST_KAKAN', game, round.roundNumber);
                        }
                        wt.kansCount += kanMelds.length;
                        checkThreshold(winnerId, 'KANS_10', 10, wt.kansCount, game, round.roundNumber);
                    }

                    // Menzen / open win styles
                    if (hand.handDetail !== undefined) {
                        if (melds.length === 0) {
                            wt.menzenWinsCount += 1;
                            checkThreshold(winnerId, 'MENZEN_WINS_50', 50, wt.menzenWinsCount, game, round.roundNumber);
                        } else {
                            wt.openHandWinsCount += 1;
                            checkThreshold(
                                winnerId,
                                'OPEN_HAND_WIN_10',
                                10,
                                wt.openHandWinsCount,
                                game,
                                round.roundNumber
                            );
                            if (melds.length >= 4) {
                                unlockCode(winnerId, 'FULLY_OPEN_WIN', game, round.roundNumber);
                            }
                        }
                    }

                    // Timing wins: yaku code with a context-flag fallback for rounds scored
                    // before the derived yaku list was persisted
                    const handContext = hand.handDetail?.context;
                    for (const [yakuCode, flag, code] of TIMING_FLAGS) {
                        if (hasYaku(hand, yakuCode) || handContext?.[flag] === true) {
                            unlockCode(winnerId, code, game, round.roundNumber);
                            if (code === 'FIRST_IPPATSU') {
                                wt.ippatsuWinsCount += 1;
                                checkThreshold(
                                    winnerId,
                                    'RIICHI_IPPATSU_10',
                                    10,
                                    wt.ippatsuWinsCount,
                                    game,
                                    round.roundNumber
                                );
                            }
                        }
                    }

                    // Standard yaku firsts and career counters
                    for (const [yakuCode, code] of YAKU_FIRST_CODES) {
                        if (hasYaku(hand, yakuCode)) {
                            unlockCode(winnerId, code, game, round.roundNumber);
                        }
                    }
                    if (hand.yaku?.some(y => YAKUHAI_CODES.has(y.code))) {
                        unlockCode(winnerId, 'FIRST_YAKUHAI', game, round.roundNumber);
                    }
                    for (const [yakuCode, code, target] of YAKU_COUNTER_CODES) {
                        if (hasYaku(hand, yakuCode)) {
                            const count = (wt.yakuWins.get(yakuCode) ?? 0) + 1;
                            wt.yakuWins.set(yakuCode, count);
                            checkThreshold(winnerId, code, target, count, game, round.roundNumber);
                        }
                    }

                    // Yakuman-specific firsts (only identifiable when the yaku list is present)
                    if (hand.yaku !== undefined) {
                        for (const [yakuCode, code] of YAKUMAN_FIRST_CODES) {
                            if (hasYaku(hand, yakuCode)) {
                                unlockCode(winnerId, code, game, round.roundNumber);
                            }
                        }
                    }

                    // Dora-family counts: the han value of dora yaku entries equals the tile count
                    const uraDoraCount = getYakuHan(hand, 'ura_dora');
                    const doraTotal = getYakuHan(hand, 'dora') + uraDoraCount + getYakuHan(hand, 'aka_dora');
                    if (doraTotal >= 5) {
                        unlockCode(winnerId, 'DORA_5_ONE_HAND', game, round.roundNumber, doraTotal);
                    }
                    if (doraTotal >= 8) {
                        unlockCode(winnerId, 'DORA_8_ONE_HAND', game, round.roundNumber, doraTotal);
                    }
                    if (uraDoraCount >= 3) {
                        unlockCode(winnerId, 'URA_DORA_3', game, round.roundNumber, uraDoraCount);
                    }
                    if (getYakuHan(hand, 'aka_dora') >= 1) {
                        unlockCode(winnerId, 'FIRST_AKA_DORA_WIN', game, round.roundNumber);
                    }
                    const plainHan = hand.han || 0;
                    const plainFu = hand.fu || 0;
                    const isManganPlus = (hand.yakumanCount || 0) === 0 &&
                        (plainHan >= 5 || (plainHan === 4 && plainFu >= 40) || (plainHan === 3 && plainFu >= 70));
                    if (isManganPlus && doraTotal === 0) {
                        unlockCode(winnerId, 'NO_DORA_MANGAN', game, round.roundNumber);
                    }

                    // Sanma kita (north dora)
                    if (isSanma) {
                        const kitaCount = getYakuHan(hand, 'kita') || hand.handDetail?.kitaCount || 0;
                        if (kitaCount > 0) {
                            unlockCode(winnerId, 'SANMA_FIRST_KITA', game, round.roundNumber);
                            if (kitaCount >= 8) {
                                unlockCode(winnerId, 'SANMA_KITA_8_ONE_HAND', game, round.roundNumber, kitaCount);
                            }
                        }
                    }

                    if (dealerUserId === winnerId) {
                        unlockCode(winnerId, 'FIRST_DEALER_WIN', game, round.roundNumber);
                        if (isSanma) unlockCode(winnerId, 'SANMA_FIRST_DEALER_WIN', game, round.roundNumber);
                    }

                    if (hand.han === 1 && riichiPlayerIds.has(winnerId)) {
                        unlockCode(winnerId, 'RIICHI_NOMI_WIN', game, round.roundNumber);
                    }
                    if (hand.han === 1) {
                        unlockCode(winnerId, 'ONE_HAN_WIN', game, round.roundNumber);
                    }
                    if (hand.han === 2 && hand.fu === 25) {
                        unlockCode(winnerId, 'CHIITOITSU_NOMI_WIN', game, round.roundNumber);
                    }

                    if (hand.fu === 50 && (hand.han || 0) < 5) unlockCode(winnerId, 'FU_50', game, round.roundNumber);
                    if (hand.fu === 70 && (hand.han || 0) < 5) unlockCode(winnerId, 'FU_70', game, round.roundNumber);
                    if (hand.fu === 100 && (hand.han || 0) < 5) unlockCode(winnerId, 'FU_100', game, round.roundNumber);

                    const yakumanCount = hand.yakumanCount || 0;
                    if (yakumanCount >= 2) unlockCode(winnerId, 'FIRST_DOUBLE_YAKUMAN', game, round.roundNumber);
                    if (yakumanCount >= 1) {
                        unlockCode(winnerId, 'FIRST_YAKUMAN', game, round.roundNumber);
                        if (isSanma) unlockCode(winnerId, 'SANMA_FIRST_YAKUMAN', game, round.roundNumber);
                    } else {
                        const han = hand.han || 0;
                        if (han >= 13) unlockCode(winnerId, 'FIRST_KAZOE', game, round.roundNumber);
                        else if (han >= 11) unlockCode(winnerId, 'FIRST_SANBAIMAN', game, round.roundNumber);
                        else if (han >= 8) unlockCode(winnerId, 'FIRST_BAIMAN', game, round.roundNumber);
                        else if (han >= 6) unlockCode(winnerId, 'FIRST_HANEMAN', game, round.roundNumber);
                        else if (
                            han === 5 || (han === 4 && (hand.fu || 0) >= 40) || (han === 3 && (hand.fu || 0) >= 70)
                        ) {
                            unlockCode(winnerId, 'FIRST_MANGAN', game, round.roundNumber);
                        }
                    }
                }

                // Dealer streak
                if (dealerUserId !== undefined && dealerUserId !== 0) {
                    const dt = getTracker(dealerUserId);
                    if (winnerUserIds.has(dealerUserId)) {
                        dt.dealerStreak += 1;
                        checkStreak(dealerUserId, 'DEALER_WINS_STREAK_3', 3, dt.dealerStreak, game, round.roundNumber);
                        checkStreak(dealerUserId, 'DEALER_WINS_STREAK_5', 5, dt.dealerStreak, game, round.roundNumber);
                    } else if (res.type === 'TSUMO' || res.type === 'RON') {
                        dt.dealerStreak = 0;
                    }
                }

                // Draws & Special
                if (res.type === 'EXHAUSTIVE_DRAW') {
                    for (const pid of res.nagashiManganPlayerIds) {
                        if (pid !== 0) unlockCode(pid, 'NAGASHI_MANGAN', game, round.roundNumber);
                    }
                    // check tenpai players if present
                    if ('tenpaiPlayerIds' in res && Array.isArray((res as any).tenpaiPlayerIds)) {
                        for (const pid of (res as any).tenpaiPlayerIds) {
                            if (pid === 0) continue;
                            const t = getTracker(pid);
                            t.exhaustiveDrawTenpaiCount += 1;
                            checkThreshold(
                                pid,
                                'EXHAUSTIVE_DRAW_TENPAI_10',
                                10,
                                t.exhaustiveDrawTenpaiCount,
                                game,
                                round.roundNumber
                            );
                            checkThreshold(
                                pid,
                                'EXHAUSTIVE_DRAW_TENPAI_50',
                                50,
                                t.exhaustiveDrawTenpaiCount,
                                game,
                                round.roundNumber
                            );
                        }
                    }
                } else if (res.type === 'ABORTIVE_DRAW') {
                    if (riichiPlayerIds.size === 4) {
                        for (const pid of riichiPlayerIds) {
                            if (pid !== 0) unlockCode(pid, 'FOUR_RIICHI_ABORTIVE_DRAW', game, round.roundNumber);
                        }
                    }
                }

                if (res.type === 'RON' && winningHands.length >= 2) {
                    for (const { hand } of winningHands) {
                        if (hand.winnerPlayerId !== 0) {
                            unlockCode(hand.winnerPlayerId, 'DOUBLE_RON_WINNER', game, round.roundNumber);
                        }
                    }
                }

                if (res.type === 'RON') {
                    const dealInId = res.dealInPlayerId;
                    if (dealInId !== 0) {
                        const dt = getTracker(dealInId);
                        dt.noDealInStreak = 0;
                        let loss = 0;
                        for (const pc of res.playerPointChanges) {
                            if (pc.playerId === dealInId && pc.pointChange < 0) loss += -pc.pointChange;
                        }
                        if (loss >= 32000) unlockCode(dealInId, 'DEAL_IN_32000', game, round.roundNumber, loss);
                    }
                }

                for (const p of game.players) {
                    if (p.userId === 0) continue;
                    const t = getTracker(p.userId);

                    // No deal in streak update
                    if (res.type === 'RON' && res.dealInPlayerId === p.userId) {
                        t.noDealInStreak = 0;
                    } else if (res.type === 'TSUMO' || res.type === 'RON') {
                        t.noDealInStreak += 1;
                        checkStreak(p.userId, 'NO_DEAL_IN_STREAK_50', 50, t.noDealInStreak, game, round.roundNumber);
                    }

                    // Lost riichi sticks
                    if (riichiPlayerIds.has(p.userId) && !winnerUserIds.has(p.userId)) {
                        t.lostRiichiSticksCount += 1;
                        checkThreshold(
                            p.userId,
                            'LOST_RIICHI_STICKS_10',
                            10,
                            t.lostRiichiSticksCount,
                            game,
                            round.roundNumber
                        );
                    }

                    // Tsumo loss
                    if (res.type === 'TSUMO' && !winnerUserIds.has(p.userId)) {
                        for (const pc of res.playerPointChanges) {
                            if (pc.playerId === p.userId && pc.pointChange < 0) {
                                t.tsumoLossPoints += -pc.pointChange;
                                checkThreshold(
                                    p.userId,
                                    'TSUMO_LOSS_50000',
                                    50000,
                                    t.tsumoLossPoints,
                                    game,
                                    round.roundNumber
                                );
                            }
                        }
                    }

                    // Chombo
                    if (res.type === 'CHOMBO' && 'chomboPlayerId' in res && (res as any).chomboPlayerId === p.userId) {
                        unlockCode(p.userId, 'FIRST_CHOMBO', game, round.roundNumber);
                    }
                }
            }
        }
    }

    // Helper functions for checking & unlocking
    function checkThreshold(
        userId: number,
        code: string,
        target: number,
        current: number,
        game: EvaluatorGame,
        roundNumber?: number
    ) {
        const def = getDef(code);
        if (def === undefined) return;
        if (current >= target) {
            unlock(userId, def, 'GLOBAL', {
                progress: target,
                unlockedAt: game.endedAt,
                sourceEventId: game.eventId,
                sourceGameId: game.id,
                sourceRoundNumber: roundNumber ?? null,
                value: current,
            });
        } else {
            updateProgress(userId, def, 'GLOBAL', current);
        }
    }

    function checkStreak(
        userId: number,
        code: string,
        target: number,
        currentStreak: number,
        game: EvaluatorGame,
        roundNumber?: number
    ) {
        const def = getDef(code);
        if (def === undefined) return;
        if (currentStreak >= target) {
            unlock(userId, def, 'GLOBAL', {
                progress: target,
                unlockedAt: game.endedAt,
                sourceEventId: game.eventId,
                sourceGameId: game.id,
                sourceRoundNumber: roundNumber ?? null,
                value: currentStreak,
            });
        } else {
            updateProgress(userId, def, 'GLOBAL', currentStreak);
        }
    }

    function updateStreakProgress(userId: number, code: string, currentStreak: number) {
        const def = getDef(code);
        if (def === undefined) return;
        updateProgress(userId, def, 'GLOBAL', currentStreak);
    }

    function updateCodeProgress(userId: number, code: string, current: number) {
        const def = getDef(code);
        if (def === undefined) return;
        updateProgress(userId, def, 'GLOBAL', current);
    }

    function unlockCode(
        userId: number,
        code: string,
        game: EvaluatorGame,
        roundNumber?: number,
        value?: number
    ) {
        const def = getDef(code);
        if (def === undefined) return;
        unlock(userId, def, 'GLOBAL', {
            progress: def.target,
            unlockedAt: game.endedAt,
            sourceEventId: game.eventId,
            sourceGameId: game.id,
            sourceRoundNumber: roundNumber ?? null,
            value: value ?? 1,
        });
    }

    function getDef(code: string): AutomaticAchievementDefinition | undefined {
        return AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(code);
    }

    function checkScopedThreshold(
        userId: number,
        code: string,
        target: number,
        current: number,
        scope: string,
        sr: EvaluatorSkillGameResult
    ) {
        const def = getDef(code);
        if (def === undefined) return;
        if (current >= target) {
            unlock(userId, def, scope, {
                progress: target,
                unlockedAt: sr.timestamp,
                sourceGameId: sr.gameId,
                value: current,
            });
        } else {
            updateProgress(userId, def, scope, current);
        }
    }

    function unlockCodeAt(userId: number, code: string, unlockedAt: Date, gameId: number, value?: number) {
        const def = getDef(code);
        if (def === undefined) return;
        unlock(userId, def, 'GLOBAL', {
            progress: def.target,
            unlockedAt,
            sourceGameId: gameId,
            value: value ?? 1,
        });
    }

    // 2. PROCESS OPENSKILL RESULTS
    const sortedSkillResults = [...skillResults].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    interface SkillTracker {
        gamesCount: number;
        gainStreak: number;
        lossStreak: number;
        top3Streak: number;
        rank1DefendCount: number;
    }
    const skillTrackers = new Map<string, SkillTracker>();
    const getSkillTracker = (key: string): SkillTracker => {
        let st = skillTrackers.get(key);
        if (st === undefined) {
            st = { gamesCount: 0, gainStreak: 0, lossStreak: 0, top3Streak: 0, rank1DefendCount: 0 };
            skillTrackers.set(key, st);
        }
        return st;
    };

    // userId -> clubs where the user has left provisional status
    const provisionalClubs = new Map<number, Set<number>>();

    // Group by scope so each club/size track can be replayed chronologically
    const resultsByScope = new Map<string, EvaluatorSkillGameResult[]>();
    for (const sr of sortedSkillResults) {
        const scope = `SKILL_${sr.gameSize}P:${sr.clubId}`;
        const list = resultsByScope.get(scope);
        if (list === undefined) {
            resultsByScope.set(scope, [sr]);
        } else {
            list.push(sr);
        }
    }

    for (const [scope, scopeResults] of resultsByScope) {
        // Running display rating for every player ever seen in this track
        const runningRatings = new Map<number, number>();

        for (const sr of scopeResults) {
            const minRating = Math.min(...sr.userSnapshots.map(u => u.initialDisplayRating));

            // Seed newcomers with their pre-game rating so the leader is correct
            for (const userSnap of sr.userSnapshots) {
                if (!runningRatings.has(userSnap.userId)) {
                    runningRatings.set(userSnap.userId, userSnap.initialDisplayRating);
                }
            }

            // Sole track leader before this game (undefined on ties or an empty track)
            let leaderId: number | undefined;
            let maxRating = Number.NEGATIVE_INFINITY;
            let maxCount = 0;
            for (const [uid, rating] of runningRatings) {
                if (rating > maxRating) {
                    maxRating = rating;
                    maxCount = 1;
                    leaderId = uid;
                } else if (rating === maxRating) {
                    maxCount += 1;
                }
            }
            if (maxCount !== 1) leaderId = undefined;

            for (const userSnap of sr.userSnapshots) {
                if (userSnap.userId === 0) continue;

                const defFirst = getDef('OPENSKILL_FIRST_RATED')!;
                const defProv = getDef('OPENSKILL_LEAVE_PROVISIONAL')!;
                const def1600 = getDef('OPENSKILL_PEAK_1600')!;
                const def1800 = getDef('OPENSKILL_PEAK_1800')!;
                const def2000 = getDef('OPENSKILL_PEAK_2000')!;
                const def2200 = getDef('OPENSKILL_PEAK_2200')!;
                const defUnderdog = getDef('OPENSKILL_UNDERDOG_WIN')!;
                const defGain50 = getDef('OPENSKILL_GAIN_50_ONE_GAME')!;
                const defSigmaLow = getDef('OPENSKILL_SIGMA_LOW')!;

                // First rated
                unlock(userSnap.userId, defFirst, scope, {
                    progress: 1,
                    unlockedAt: sr.timestamp,
                    sourceGameId: sr.gameId,
                    value: 1,
                });

                // Sigma low & leave provisional
                if (userSnap.finalSigma <= 4.0) {
                    unlock(userSnap.userId, defProv, scope, {
                        progress: 1,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: userSnap.finalSigma,
                    });
                    unlock(userSnap.userId, defSigmaLow, scope, {
                        progress: 1,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: userSnap.finalSigma,
                    });

                    const clubs = provisionalClubs.get(userSnap.userId) ?? new Set<number>();
                    clubs.add(sr.clubId);
                    provisionalClubs.set(userSnap.userId, clubs);
                    if (clubs.size >= 2) {
                        unlockCodeAt(
                            userSnap.userId,
                            'OPENSKILL_MULTI_CLUB_RANKED_2',
                            sr.timestamp,
                            sr.gameId,
                            clubs.size
                        );
                    }
                }

                // Display rating peaks
                const rating = userSnap.finalDisplayRating;
                if (rating >= 1600) {
                    unlock(userSnap.userId, def1600, scope, {
                        progress: 1600,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: rating,
                    });
                } else updateProgress(userSnap.userId, def1600, scope, rating);

                if (rating >= 1800) {
                    unlock(userSnap.userId, def1800, scope, {
                        progress: 1800,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: rating,
                    });
                } else updateProgress(userSnap.userId, def1800, scope, rating);

                if (rating >= 2000) {
                    unlock(userSnap.userId, def2000, scope, {
                        progress: 2000,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: rating,
                    });
                } else updateProgress(userSnap.userId, def2000, scope, rating);

                if (rating >= 2200) {
                    unlock(userSnap.userId, def2200, scope, {
                        progress: 2200,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: rating,
                    });
                } else updateProgress(userSnap.userId, def2200, scope, rating);

                // Underdog win
                if (userSnap.place === 1 && userSnap.initialDisplayRating < minRating + 1e-6) {
                    // strictly lowest rated
                    const strictlyLowest = sr.userSnapshots.filter(u =>
                        u.initialDisplayRating === userSnap.initialDisplayRating
                    ).length === 1;
                    if (strictlyLowest) {
                        unlock(userSnap.userId, defUnderdog, scope, {
                            progress: 1,
                            unlockedAt: sr.timestamp,
                            sourceGameId: sr.gameId,
                            value: 1,
                        });
                    }
                }

                // Gain 50
                const gain = userSnap.finalDisplayRating - userSnap.initialDisplayRating;
                if (gain >= 50) {
                    unlock(userSnap.userId, defGain50, scope, {
                        progress: 50,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: gain,
                    });
                } else {
                    updateProgress(userSnap.userId, defGain50, scope, Math.max(0, gain));
                }

                // Rated game counts per track
                const st = getSkillTracker(`${userSnap.userId}:${scope}`);
                st.gamesCount += 1;
                checkScopedThreshold(userSnap.userId, 'OPENSKILL_GAMES_50', 50, st.gamesCount, scope, sr);
                checkScopedThreshold(userSnap.userId, 'OPENSKILL_GAMES_100', 100, st.gamesCount, scope, sr);

                // Single-game loss
                if (gain <= -50) {
                    const defLoss = getDef('OPENSKILL_LOSS_50_ONE_GAME')!;
                    unlock(userSnap.userId, defLoss, scope, {
                        progress: 50,
                        unlockedAt: sr.timestamp,
                        sourceGameId: sr.gameId,
                        value: -gain,
                    });
                }

                // Gain/loss streaks
                if (gain > 0) {
                    st.gainStreak += 1;
                    st.lossStreak = 0;
                } else if (gain < 0) {
                    st.lossStreak += 1;
                    st.gainStreak = 0;
                } else {
                    st.gainStreak = 0;
                    st.lossStreak = 0;
                }
                checkScopedThreshold(userSnap.userId, 'OPENSKILL_STREAK_GAIN_3', 3, st.gainStreak, scope, sr);
                checkScopedThreshold(userSnap.userId, 'OPENSKILL_STREAK_LOSS_3', 3, st.lossStreak, scope, sr);

                // Top-3 streak
                if (userSnap.place <= 3) {
                    st.top3Streak += 1;
                } else {
                    st.top3Streak = 0;
                }
                checkScopedThreshold(userSnap.userId, 'OPENSKILL_TOP3_STREAK_5', 5, st.top3Streak, scope, sr);

                // Won at the table while holding the track's #1 rating
                if (userSnap.place === 1 && leaderId === userSnap.userId) {
                    st.rank1DefendCount += 1;
                    checkScopedThreshold(
                        userSnap.userId,
                        'OPENSKILL_RANK1_DEFEND_3',
                        3,
                        st.rank1DefendCount,
                        scope,
                        sr
                    );
                }
            }

            // Apply post-game ratings
            for (const userSnap of sr.userSnapshots) {
                runningRatings.set(userSnap.userId, userSnap.finalDisplayRating);
            }
        }
    }

    // 3. PROCESS EVENT PLACEMENTS
    const sortedEvents = [...eventPlacements].sort((a, b) => a.dateTo.getTime() - b.dateTo.getTime());

    for (const ev of sortedEvents) {
        if (!ev.isFinished) continue;

        for (const pl of ev.placements) {
            if (pl.userId === 0 || !pl.isEligible) continue;
            const tracker = getTracker(pl.userId);

            if (!tracker.eventsPlayed.has(ev.eventId)) {
                tracker.eventsPlayed.add(ev.eventId);
                checkThreshold(pl.userId, 'EVENT_DEBUT', 1, tracker.eventsPlayed.size, {
                    id: 0,
                    clubId: ev.clubId,
                    eventId: ev.eventId,
                    gameSize: 4,
                    startedAt: ev.dateTo,
                    endedAt: ev.dateTo,
                    players: [],
                    rounds: [],
                });
                checkThreshold(pl.userId, 'EVENT_COUNT_10', 10, tracker.eventsPlayed.size, {
                    id: 0,
                    clubId: ev.clubId,
                    eventId: ev.eventId,
                    gameSize: 4,
                    startedAt: ev.dateTo,
                    endedAt: ev.dateTo,
                    players: [],
                    rounds: [],
                });
            }

            const scope = `EVENT:${ev.eventId}`;

            if (pl.place === 1) {
                tracker.championshipCount += 1;
                tracker.podiumCount += 1;

                const code = ev.isSeason ? 'SEASON_CHAMPION' : 'TOURNAMENT_CHAMPION';
                const def = getDef(code)!;
                unlock(pl.userId, def, scope, {
                    progress: 1,
                    unlockedAt: ev.dateTo,
                    sourceEventId: ev.eventId,
                    value: 1,
                });

                const podiumCode = ev.isSeason ? 'SEASON_PODIUM' : 'TOURNAMENT_PODIUM';
                const defPodium = getDef(podiumCode)!;
                unlock(pl.userId, defPodium, scope, {
                    progress: 1,
                    unlockedAt: ev.dateTo,
                    sourceEventId: ev.eventId,
                    value: 1,
                });
            } else if (pl.place <= 3) {
                tracker.podiumCount += 1;

                const podiumCode = ev.isSeason ? 'SEASON_PODIUM' : 'TOURNAMENT_PODIUM';
                const defPodium = getDef(podiumCode)!;
                unlock(pl.userId, defPodium, scope, {
                    progress: 1,
                    unlockedAt: ev.dateTo,
                    sourceEventId: ev.eventId,
                    value: pl.place,
                });
            }

            checkThreshold(pl.userId, 'PODIUMS_5', 5, tracker.podiumCount, {
                id: 0,
                clubId: ev.clubId,
                eventId: ev.eventId,
                gameSize: 4,
                startedAt: ev.dateTo,
                endedAt: ev.dateTo,
                players: [],
                rounds: [],
            });
            checkThreshold(pl.userId, 'CHAMPIONSHIPS_5', 5, tracker.championshipCount, {
                id: 0,
                clubId: ev.clubId,
                eventId: ev.eventId,
                gameSize: 4,
                startedAt: ev.dateTo,
                endedAt: ev.dateTo,
                players: [],
                rounds: [],
            });
        }
    }

    return Array.from(states.values());
}

function iterWinningHands(res: GameRoundResult): { hand: WinningHandData, winType: 'TSUMO' | 'RON' }[] {
    if (res.type === 'TSUMO') {
        return [{ hand: res.winningHandData, winType: 'TSUMO' }];
    }
    if (res.type === 'RON') {
        return res.winningHandData.map(h => ({ hand: h, winType: 'RON' as const }));
    }
    return [];
}

function hasYaku(hand: WinningHandData, code: YakuCode): boolean {
    return hand.yaku?.some(y => y.code === code) ?? false;
}

// The han value of dora-family yaku entries equals the number of dora tiles.
function getYakuHan(hand: WinningHandData, code: YakuCode): number {
    const entry = hand.yaku?.find(y => y.code === code);
    if (entry === undefined || !('han' in entry)) return 0;
    return entry.han;
}
