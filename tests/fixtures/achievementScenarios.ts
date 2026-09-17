import type { ComputedAchievementState } from '../../src/util/AutomaticAchievementEvaluator.ts';
import { Wind } from '../../src/model/GameModels.ts';
import type { GameRoundResult, PlayerPointChange, WinningHandData } from '../../src/model/GameRoundResultModels.ts';
import type { HandDetail, Meld, TileCode, YakuCode } from '../../src/mahjong/types.ts';
import type {
    EvaluatorEventPlacement,
    EvaluatorGame,
    EvaluatorGamePlayer,
    EvaluatorGameRound,
    EvaluatorSkillGameResult,
    EvaluatorSkillUserSnapshot,
} from '../../src/util/AutomaticAchievementEvaluator.ts';

// ---------------------------------------------------------------------------
// Characterisation scenarios: one positive and one near-miss input set per
// automatic achievement code. The contract test replays each through
// evaluateAutomaticAchievements and asserts unlock / no-unlock behaviour.
// The fixtures are pure builders - no evaluation happens here.
// ---------------------------------------------------------------------------

export const SUBJECT = 101;

export interface ScenarioInput {
    games?: EvaluatorGame[];
    events?: EvaluatorEventPlacement[];
    skill?: EvaluatorSkillGameResult[];
}

export type CheckName = 'positive' | 'nearMiss' | 'progress' | 'scope' | 'gameSize' | 'trackedOnly' | 'extra';

export interface ScenarioState {
    positive: ComputedAchievementState[];
    nearMiss: ComputedAchievementState[] | null;
}

export interface Scenario {
    code: string;
    // Whose unlock is asserted - the payer for pao/deal-in codes, else SUBJECT.
    subject?: number;
    positive: (size: 3 | 4) => ScenarioInput;
    // Closest non-qualifying input: nobody may unlock the code from it.
    nearMiss?: (size: 3 | 4) => ScenarioInput;
    // When true the near-miss must leave a progress row for the subject.
    progresses?: boolean;
    // When true the near-miss may legitimately unlock other players (only the
    // subject is asserted).
    othersMayUnlock?: boolean;
    extra?: (states: ScenarioState) => void;
}

export const SCENARIOS = new Map<string, Scenario>();

function scenario(s: Scenario): void {
    SCENARIOS.set(s.code, s);
}

// ---------------------------------------------------------------------------
// Generic builders
// ---------------------------------------------------------------------------

export function repeat<T>(n: number, f: (i: number) => T): T[] {
    return Array.from({ length: n }, (_, i) => f(i));
}

let seq = 0;
function nextTime(): Date {
    seq += 1;
    return new Date(Date.UTC(2026, 2, 1, 10, seq % 60, (seq * 7) % 60));
}

export function game(opts: {
    players: { userId: number, points: number, startPlace?: Wind | undefined }[];
    rounds?: EvaluatorGameRound[] | undefined;
    gameSize?: 3 | 4 | undefined;
    dice?: [number, number] | undefined;
}): EvaluatorGame {
    const size = opts.gameSize ?? (opts.players.length as 3 | 4);
    const defaultWinds = size === 3
        ? [Wind.EAST, Wind.SOUTH, Wind.WEST]
        : [Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH];
    const time = nextTime();
    const players: EvaluatorGamePlayer[] = opts.players.map((p, idx) => ({
        userId: p.userId,
        points: p.points,
        startPlace: p.startPlace ?? defaultWinds[idx]!,
        isSubstitutePlayer: false,
        isFillerPlayer: false,
    }));
    return {
        id: seq,
        clubId: 1,
        eventId: 1,
        gameSize: size,
        startedAt: time,
        endedAt: time,
        players,
        rounds: opts.rounds ?? [],
        startingDie1: opts.dice ? opts.dice[0] : null,
        startingDie2: opts.dice ? opts.dice[1] : null,
    };
}

export function round(roundNumber: number, result: GameRoundResult, dealerNumber = 1): EvaluatorGameRound {
    return {
        roundNumber,
        wind: Wind.EAST,
        dealerNumber,
        counters: 0,
        riichiSticks: 0,
        result,
    };
}

// A standard game where the first player (SUBJECT by default) finishes first.
export function standardGame(
    rounds: EvaluatorGameRound[] = [],
    size: 3 | 4 = 4,
    opts: { winner?: number, subjectStart?: Wind | undefined, dice?: [number, number] | undefined } = {}
): EvaluatorGame {
    const points = [40000, 30000, 20000, 10000].slice(0, size);
    const winner = opts.winner ?? SUBJECT;
    const others = [102, 103, 104, 105].filter(id => id !== winner);
    const players = points.map((pts, idx) => ({
        userId: idx === 0 ? winner : others[idx - 1]!,
        points: pts,
        startPlace: idx === 0 ? opts.subjectStart : undefined,
    }));
    return game({ players, rounds, gameSize: size, dice: opts.dice });
}

function wonGames(n: number, size: 3 | 4 = 4, winner = SUBJECT): EvaluatorGame[] {
    return repeat(n, () => standardGame([], size, { winner }));
}

// ---------------------------------------------------------------------------
// Hand builders
// ---------------------------------------------------------------------------

export const y = (code: YakuCode, han: number): { code: YakuCode, han: number } => ({ code, han });
export const yakuMan = (code: YakuCode, count = 1): { code: YakuCode, yakumanCount: number } => ({
    code,
    yakumanCount: count,
});

export function hand(
    winnerId: number,
    opts: {
        han?: number;
        fu?: number;
        yakumanCount?: number;
        yaku?: WinningHandData['yaku'];
        handDetail?: HandDetail;
        yakumanLiabilityPlayerId?: number;
    } = {}
): WinningHandData {
    return {
        winnerPlayerId: winnerId,
        yakumanCount: opts.yakumanCount ?? 0,
        han: opts.han,
        fu: opts.fu,
        yaku: opts.yaku,
        handDetail: opts.handDetail,
        yakumanLiabilityPlayerId: opts.yakumanLiabilityPlayerId,
    };
}

export const plainHand = (winnerId: number, han = 2, fu = 30): WinningHandData =>
    hand(winnerId, {
        han,
        fu,
        yaku: [y('tanyao', 1)],
    });

export const pon = (tile: TileCode): Meld => ({
    type: 'PON',
    tiles: [tile, tile, tile],
    calledTileIndex: 0,
    calledFrom: 'SHIMOCHA',
});
export const chii = (tiles: [TileCode, TileCode, TileCode]): Meld => ({
    type: 'CHII',
    tiles,
    calledTileIndex: 0,
    calledFrom: 'KAMICHA',
});
export const ankan = (tile: TileCode): Meld => ({ type: 'ANKAN', tiles: [tile, tile, tile, tile] });
export const daiminkan = (tile: TileCode): Meld => ({
    type: 'DAIMINKAN',
    tiles: [tile, tile, tile, tile],
    calledTileIndex: 0,
    calledFrom: 'SHIMOCHA',
});
export const kakan = (tile: TileCode): Meld => ({
    type: 'KAKAN',
    tiles: [tile, tile, tile, tile],
    calledTileIndex: 0,
    calledFrom: 'SHIMOCHA',
});

export function handDetail(melds: Meld[] = [], opts: Partial<HandDetail> = {}): HandDetail {
    return {
        concealedTiles: ['man_1'],
        melds,
        winningTile: 'man_2',
        doraIndicators: [],
        uraDoraIndicators: [],
        ...opts,
    };
}

// ---------------------------------------------------------------------------
// Round builders
// ---------------------------------------------------------------------------

export function ronResult(
    hands: WinningHandData[],
    dealInId: number,
    opts: { riichi?: number[], payments?: number[] } = {}
): GameRoundResult {
    const payments = opts.payments ?? hands.map(() => 8000);
    const changes: PlayerPointChange[] = [];
    hands.forEach((h, i) => {
        changes.push({ playerId: h.winnerPlayerId, pointChange: payments[i]! });
    });
    changes.push({ playerId: dealInId, pointChange: -payments.reduce((a, b) => a + b, 0) });
    return {
        type: 'RON',
        dealInPlayerId: dealInId,
        winningHandData: hands,
        riichiPlayerIds: opts.riichi ?? [],
        playerPointChanges: changes,
        nextState: undefined,
        gameFinishReason: undefined,
    };
}

export function tsumoResult(
    winnerId: number,
    opts: { hand?: WinningHandData, riichi?: number[], payment?: number, size?: 3 | 4 } = {}
): GameRoundResult {
    const k = opts.payment ?? 3000;
    const others = [SUBJECT, 102, 103, 104].filter(id => id !== winnerId).slice(0, (opts.size ?? 4) - 1);
    return {
        type: 'TSUMO',
        winningHandData: opts.hand ?? plainHand(winnerId),
        riichiPlayerIds: opts.riichi ?? [],
        playerPointChanges: [
            { playerId: winnerId, pointChange: k * others.length },
            ...others.map(id => ({ playerId: id, pointChange: -k })),
        ],
        nextState: undefined,
        gameFinishReason: undefined,
    };
}

export function chomboResult(offenderId: number, size: 3 | 4 = 4): GameRoundResult {
    const others = [102, 103, 104].filter(id => id !== offenderId).slice(0, size - 1);
    return {
        type: 'CHOMBO',
        offenderPlayerId: offenderId,
        playerPointChanges: [
            { playerId: offenderId, pointChange: -12000 },
            ...others.map(id => ({ playerId: id, pointChange: 4000 })),
        ],
        nextState: undefined,
        gameFinishReason: undefined,
    };
}

export function exhaustiveResult(
    tenpai: number[],
    opts: { nagashi?: number[], noten?: number[] } = {}
): GameRoundResult {
    const noten = opts.noten ?? [102, 103, 104].filter(id => !tenpai.includes(id));
    return {
        type: 'EXHAUSTIVE_DRAW',
        riichiPlayerIds: [],
        tenpaiPlayerIds: tenpai,
        nagashiManganPlayerIds: opts.nagashi ?? [],
        playerPointChanges: [
            ...tenpai.map(id => ({ playerId: id, pointChange: 3000 })),
            ...noten.map(id => ({ playerId: id, pointChange: -3000 })),
        ],
        nextState: undefined,
        gameFinishReason: undefined,
    };
}

export function abortiveResult(
    drawType: 'NINE_TERMINALS' | 'FOUR_WINDS' | 'FOUR_KANS' | 'FOUR_RIICHI' | 'TRIPLE_RON',
    riichi: number[]
): GameRoundResult {
    return {
        type: 'ABORTIVE_DRAW',
        drawType,
        riichiPlayerIds: riichi,
        playerPointChanges: [],
        nextState: undefined,
        gameFinishReason: undefined,
    };
}

// ---------------------------------------------------------------------------
// Event / skill builders
// ---------------------------------------------------------------------------

export function event(
    eventId: number,
    opts: { isSeason?: boolean, places: [number, number][], finished?: boolean }
): EvaluatorEventPlacement {
    return {
        eventId,
        clubId: 1,
        isSeason: opts.isSeason ?? false,
        dateTo: new Date(Date.UTC(2026, 3, Math.min(1 + eventId, 28), 18)),
        isFinished: opts.finished ?? true,
        placements: opts.places.map(([userId, place]) => ({ userId, place, isEligible: true })),
    };
}

let skillSeq = 0;
export function skillGame(
    snapshots: EvaluatorSkillUserSnapshot[],
    opts: { clubId?: number, gameSize?: 3 | 4 } = {}
): EvaluatorSkillGameResult {
    skillSeq += 1;
    return {
        clubId: opts.clubId ?? 1,
        gameSize: opts.gameSize ?? 4,
        gameId: skillSeq,
        timestamp: new Date(Date.UTC(2026, 4, 1, 12, skillSeq)),
        userSnapshots: snapshots,
    };
}

export function snap(
    userId: number,
    initialDisplayRating: number,
    finalDisplayRating: number,
    place: number,
    finalSigma = 3
): EvaluatorSkillUserSnapshot {
    return {
        userId,
        initialMu: 25,
        initialSigma: 6,
        initialDisplayRating,
        finalMu: 25,
        finalSigma,
        finalDisplayRating,
        place,
    };
}

// ---------------------------------------------------------------------------
// Scenario families
// ---------------------------------------------------------------------------

// Career games/wins thresholds - one entry per tier, generated from target.
const GAME_TIERS = [1, 10, 50, 100, 250, 500, 1000] as const;
for (const target of GAME_TIERS) {
    scenario({
        code: `GAMES_${target}`,
        positive: size => ({ games: wonGames(target, size) }),
        nearMiss: size => ({ games: wonGames(target - 1, size) }),
        progresses: target > 1,
    });
}
const WIN_TIERS = [1, 10, 50, 100] as const;
for (const target of WIN_TIERS) {
    scenario({
        code: `WINS_${target}`,
        positive: size => ({ games: wonGames(target, size) }),
        nearMiss: size => ({
            games: [...wonGames(target - 1, size), standardGame([], size, { winner: 102 })],
        }),
        progresses: target > 1,
        // At target 1 the near-miss winner unlocks legitimately.
        othersMayUnlock: target === 1,
    });
}

// Thresholds earned by repeating rounds inside one game.
function repeatedRoundScenario(
    code: string,
    target: number,
    makeRound: (i: number) => EvaluatorGameRound
): void {
    scenario({
        code,
        positive: size => ({ games: [standardGame(repeat(target, i => makeRound(i)), size)] }),
        nearMiss: size => ({ games: [standardGame(repeat(target - 1, i => makeRound(i)), size)] }),
        progresses: true,
    });
}

// Yaku-first achievements: one hand carrying the yaku unlocks it.
function yakuFirstScenario(code: string, yakuCode: YakuCode, han = 1): void {
    const nearMissYaku: YakuCode = yakuCode === 'tanyao' ? 'pinfu' : 'tanyao';
    scenario({
        code,
        positive: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y(yakuCode, han)] }),
                    size,
                })
            )], size)],
        }),
        nearMiss: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y(nearMissYaku, 1)] }),
                    size,
                })
            )], size)],
        }),
    });
}

// Timing achievements detected through the persisted yaku list.
function timingScenario(code: string, yakuCode: YakuCode): void {
    yakuFirstScenario(code, yakuCode);
}

// Yakuman firsts: yakumanCount 1 hands. `variant` lets the base-code scenarios
// use the superior variant hand (13-wait kokushi etc.) whose plain reading the
// base description also satisfies.
function yakumanScenario(code: string, yakuCode: YakuCode, variant?: YakuCode): void {
    scenario({
        code,
        positive: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, {
                        yakumanCount: 1,
                        yaku: [yakuMan(variant ?? yakuCode)],
                    }),
                    size,
                })
            )], size)],
        }),
        nearMiss: size => ({
            games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 4, 30), size }))], size)],
        }),
    });
}

// Career counters per yaku code.
function yakuCounterScenario(
    code: string,
    target: number,
    yakuCode: YakuCode,
    handOpts: { han?: number, fu?: number } = {}
): void {
    scenario({
        code,
        positive: size => ({
            games: [standardGame(
                repeat(target, () =>
                    round(
                        1,
                        tsumoResult(SUBJECT, {
                            hand: hand(SUBJECT, { ...handOpts, yaku: [y(yakuCode, 1)] }),
                            size,
                        })
                    )),
                size
            )],
        }),
        nearMiss: size => ({
            games: [standardGame(
                repeat(target - 1, () =>
                    round(
                        1,
                        tsumoResult(SUBJECT, {
                            hand: hand(SUBJECT, { ...handOpts, yaku: [y(yakuCode, 1)] }),
                            size,
                        })
                    )),
                size
            )],
        }),
        progresses: true,
    });
}

// ---------------------------------------------------------------------------
// CAREER
// ---------------------------------------------------------------------------

scenario({
    code: 'STREAK_WINS_3',
    positive: size => ({ games: wonGames(3, size) }),
    nearMiss: size => ({ games: wonGames(2, size) }),
    progresses: true,
});

scenario({
    code: 'STREAK_TOP2_5',
    positive: size => ({ games: wonGames(5, size) }),
    nearMiss: size => ({ games: wonGames(4, size) }),
    progresses: true,
});

scenario({
    code: 'WIN_STARTING_EAST',
    positive: size => ({ games: [standardGame([], size, { subjectStart: Wind.EAST })] }),
    nearMiss: size => ({ games: [standardGame([], size, { subjectStart: Wind.SOUTH })] }),
});

scenario({
    code: 'FOUR_WIND_COLLECTION',
    positive: size => ({
        games: [Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH].map(w => standardGame([], size, { subjectStart: w })),
    }),
    nearMiss: size => ({
        games: [Wind.EAST, Wind.SOUTH, Wind.WEST].map(w => standardGame([], size, { subjectStart: w })),
    }),
    progresses: true,
});

scenario({
    code: 'WIN_BY_MARGIN_1000',
    positive: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 30100 },
                { userId: 102, points: 29900 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 20000 },
            ],
        })],
    }),
    nearMiss: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 31100 },
                { userId: 102, points: 29900 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 20000 },
            ],
        })],
    }),
    extra: ({ positive }) => {
        // A tie for the lead is a win by 0 - inside the 1,000-point budget.
        const tieGame = game({
            players: [
                { userId: SUBJECT, points: 30000 },
                { userId: 102, points: 30000 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 10000 },
            ],
        });
        const states = evaluate(tieGame);
        const s = states.find(r => r.userId === SUBJECT && r.code === 'WIN_BY_MARGIN_1000');
        expect(s).toBeDefined();
        expect(s!.unlockedAt).not.toBeNull();
        // The unlocked evidence value is the margin itself.
        const won = positive.find(r =>
            r.userId === SUBJECT && r.code === 'WIN_BY_MARGIN_1000' && r.unlockedAt !== null
        );
        expect(won!.value).toBe(200);
    },
});

scenario({
    code: 'WIN_BY_MARGIN_30000',
    positive: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 55000 },
                { userId: 102, points: 20000 },
                { userId: 103, points: 15000 },
                { userId: 104, points: 10000 },
            ],
        })],
    }),
    nearMiss: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 48000 },
                { userId: 102, points: 20000 },
                { userId: 103, points: 15000 },
                { userId: 104, points: 10000 },
            ],
        })],
    }),
    extra: ({ positive }) => {
        const won = positive.find(r =>
            r.userId === SUBJECT && r.code === 'WIN_BY_MARGIN_30000' && r.unlockedAt !== null
        );
        expect(won).toBeDefined();
        expect(won!.value).toBe(35000);
    },
});

scenario({
    code: 'FINISH_EXACT_ZERO',
    positive: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 0 },
                { userId: 102, points: 40000 },
                { userId: 103, points: 30000 },
                { userId: 104, points: 10000 },
            ],
        })],
    }),
    nearMiss: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 100 },
                { userId: 102, points: 40000 },
                { userId: 103, points: 30000 },
                { userId: 104, points: 10000 },
            ],
        })],
    }),
});

// The winner's reconstructed running score must actually dip below zero, not
// merely have lost points at some point.
scenario({
    code: 'COMEBACK_NEGATIVE_TO_FIRST',
    positive: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 40000 },
                { userId: 102, points: 30000 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 10000 },
            ],
            rounds: [
                // Subject deals in for 30,000: running 18,000 - 30,000 < 0.
                round(1, ronResult([plainHand(102, 4, 30)], SUBJECT, { payments: [30000] })),
                round(2, ronResult([plainHand(SUBJECT, 4, 30)], 103, { payments: [52000] })),
            ],
        })],
    }),
    nearMiss: () => ({
        games: [game({
            players: [
                { userId: SUBJECT, points: 40000 },
                { userId: 102, points: 30000 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 10000 },
            ],
            rounds: [
                // Lost points but never went negative.
                round(1, ronResult([plainHand(102, 2, 30)], SUBJECT, { payments: [3900] })),
                round(2, ronResult([plainHand(SUBJECT, 4, 30)], 103, { payments: [12000] })),
            ],
        })],
    }),
});

// ---------------------------------------------------------------------------
// HAND - round outcomes
// ---------------------------------------------------------------------------

scenario({
    code: 'FIRST_RON',
    positive: size => ({ games: [standardGame([round(1, ronResult([plainHand(SUBJECT)], 102))], size)] }),
    nearMiss: size => ({ games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size)] }),
});

scenario({
    code: 'FIRST_TSUMO',
    positive: size => ({ games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size)] }),
    nearMiss: size => ({ games: [standardGame([round(1, ronResult([plainHand(SUBJECT)], 102))], size)] }),
});

scenario({
    code: 'FIRST_DEALER_WIN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size, { subjectStart: Wind.EAST })],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size, { subjectStart: Wind.SOUTH })],
    }),
});

scenario({
    code: 'FIRST_RIICHI',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(102, { riichi: [SUBJECT], size }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(102, { size }))], size)],
    }),
});

function dealerWinRounds(n: number, size: 3 | 4): EvaluatorGameRound[] {
    return repeat(n, i => round(i + 1, tsumoResult(SUBJECT, { size })));
}

scenario({
    code: 'DEALER_WINS_STREAK_3',
    positive: size => ({
        games: [standardGame(dealerWinRounds(3, size), size, { subjectStart: Wind.EAST })],
    }),
    nearMiss: size => ({
        games: [standardGame(dealerWinRounds(2, size), size, { subjectStart: Wind.EAST })],
    }),
    progresses: true,
});

scenario({
    code: 'DEALER_WINS_STREAK_5',
    positive: size => ({
        games: [standardGame(dealerWinRounds(5, size), size, { subjectStart: Wind.EAST })],
    }),
    nearMiss: size => ({
        games: [standardGame(dealerWinRounds(4, size), size, { subjectStart: Wind.EAST })],
    }),
    progresses: true,
});

repeatedRoundScenario('RIICHI_10', 10, () => round(1, tsumoResult(102, { riichi: [SUBJECT] })));
repeatedRoundScenario('RIICHI_100', 100, () => round(1, tsumoResult(102, { riichi: [SUBJECT] })));

scenario({
    code: 'RIICHI_NOMI_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 1, fu: 30, yaku: [y('tanyao', 1)] }),
                riichi: [SUBJECT],
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 1, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'ONE_HAN_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 1, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'CHIITOITSU_NOMI_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 2, fu: 25, yaku: [y('chiitoitsu', 2)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
});

// The fu family reads as cumulative tiers (like the games family), so a
// 110-fu hand satisfies all three descriptions.
function fuScenario(code: string, fu: number): void {
    scenario({
        code,
        positive: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, { han: 2, fu, yaku: [y('tanyao', 1)] }),
                    size,
                })
            )], size)],
        }),
        nearMiss: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, { han: 2, fu: 40, yaku: [y('tanyao', 1)] }),
                    size,
                })
            )], size)],
        }),
        extra: () => {
            const states = evaluate(standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, { han: 2, fu: 110, yaku: [y('tanyao', 1)] }),
                })
            )]));
            const s = states.find(r => r.userId === SUBJECT && r.code === code);
            expect(s).toBeDefined();
            expect(s!.unlockedAt).not.toBeNull();
        },
    });
}
fuScenario('FU_50', 50);
fuScenario('FU_70', 70);
fuScenario('FU_100', 100);

scenario({
    code: 'FIRST_MANGAN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 5, 30), size }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 4, 30), size }))], size)],
    }),
});
scenario({
    code: 'FIRST_HANEMAN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 6, 30), size }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 5, 30), size }))], size)],
    }),
});
scenario({
    code: 'FIRST_BAIMAN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 8, 30), size }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 7, 30), size }))], size)],
    }),
});
scenario({
    code: 'FIRST_SANBAIMAN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 11, 30), size }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 10, 30), size }))], size)],
    }),
});
scenario({
    code: 'FIRST_KAZOE',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 13, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 12, fu: 30, yaku: [y('tanyao', 1)] }),
                size,
            })
        )], size)],
    }),
});

yakumanScenario('FIRST_YAKUMAN', 'daisangen');
scenario({
    code: 'FIRST_DOUBLE_YAKUMAN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { yakumanCount: 2, yaku: [yakuMan('daisangen'), yakuMan('shousangen')] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { yakumanCount: 1, yaku: [yakuMan('daisangen')] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'NAGASHI_MANGAN',
    positive: size => ({
        games: [standardGame([round(1, exhaustiveResult([SUBJECT], { nagashi: [SUBJECT] }))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, exhaustiveResult([SUBJECT]))], size)],
    }),
});

repeatedRoundScenario('EXHAUSTIVE_DRAW_TENPAI_10', 10, () => round(1, exhaustiveResult([SUBJECT])));
repeatedRoundScenario('EXHAUSTIVE_DRAW_TENPAI_50', 50, () => round(1, exhaustiveResult([SUBJECT])));

// Fifty consecutive winning rounds where the subject never deals in.
scenario({
    code: 'NO_DEAL_IN_STREAK_50',
    positive: size => ({
        games: [standardGame(repeat(50, i => round(i + 1, tsumoResult(102, { size }))), size)],
    }),
    nearMiss: size => ({
        games: [standardGame([
            ...repeat(46, i => round(i + 1, tsumoResult(102, { size }))),
            // Every seat deals in once across the closing rounds, so nobody
            // reaches 50 consecutive non-deal-in rounds.
            round(47, ronResult([plainHand(103)], 102)),
            round(48, ronResult([plainHand(104)], 103)),
            round(49, ronResult([plainHand(SUBJECT)], 104)),
            round(50, ronResult([plainHand(102)], SUBJECT)),
        ], size)],
    }),
    progresses: true,
});

scenario({
    code: 'DOUBLE_RON_WINNER',
    positive: size => ({
        games: [standardGame([round(1, ronResult([plainHand(SUBJECT), plainHand(103)], 102))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, ronResult([plainHand(SUBJECT)], 102))], size)],
    }),
});

// Pao liability belongs to the payer, so these scenarios follow user 102.
scenario({
    code: 'YAKUMAN_LIABILITY',
    subject: 102,
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { yakumanCount: 1, yakumanLiabilityPlayerId: 102, yaku: [yakuMan('daisangen')] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { yakumanCount: 1, yaku: [yakuMan('daisangen')] }),
                size,
            })
        )], size)],
    }),
});

// The stored point changes merge a double ron into one summed payment, and
// per-hit attribution would need the club's scoring rules, so the achievement
// is defined on the round's whole deal-in loss (descriptions say "single round").
scenario({
    code: 'DEAL_IN_32000',
    subject: 102,
    positive: size => ({
        games: [
            standardGame([
                round(
                    1,
                    ronResult([hand(SUBJECT, { han: 13, fu: 40, yaku: [yakuMan('daisangen')] })], 102, {
                        payments: [32000],
                    })
                ),
            ], size),
        ],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            ronResult([plainHand(SUBJECT, 4, 40)], 102, { payments: [30000] })
        )], size)],
    }),
});

repeatedRoundScenario('LOST_RIICHI_STICKS_10', 10, () => round(1, tsumoResult(102, { riichi: [SUBJECT] })));

scenario({
    code: 'TSUMO_LOSS_50000',
    positive: size => ({
        games: [standardGame(repeat(5, () => round(1, tsumoResult(102, { size, payment: 12000 }))), size)],
    }),
    nearMiss: size => ({
        games: [standardGame(repeat(4, () => round(1, tsumoResult(102, { size, payment: 12000 }))), size)],
    }),
    progresses: true,
});

scenario({
    code: 'FIRST_CHOMBO',
    positive: size => ({ games: [standardGame([round(1, chomboResult(SUBJECT, size))], size)] }),
    nearMiss: size => ({ games: [standardGame([round(1, ronResult([plainHand(102)], SUBJECT))], size)] }),
});

// Four riichi is its own abortive draw type - other abortive draws where four
// players happen to have riichi declared must not count.
scenario({
    code: 'FOUR_RIICHI_ABORTIVE_DRAW',
    positive: size => ({
        games: [standardGame([round(1, abortiveResult('FOUR_RIICHI', [SUBJECT, 102, 103, 104]))], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, abortiveResult('FOUR_WINDS', [SUBJECT, 102, 103, 104]))], size)],
    }),
});

// ---------------------------------------------------------------------------
// TIMING
// ---------------------------------------------------------------------------

timingScenario('FIRST_IPPATSU', 'ippatsu');
repeatedRoundScenario('RIICHI_IPPATSU_10', 10, () =>
    round(
        1,
        tsumoResult(SUBJECT, {
            hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('ippatsu', 1)] }),
            riichi: [SUBJECT],
        })
    ));
timingScenario('FIRST_DOUBLE_RIICHI', 'double_riichi');
timingScenario('FIRST_HAITEI', 'haitei');
timingScenario('FIRST_HOUTEI', 'houtei');
timingScenario('FIRST_RINSHAN', 'rinshan_kaihou');
timingScenario('FIRST_CHANKAN', 'chankan');
timingScenario('FIRST_TENHOU', 'tenhou');
timingScenario('FIRST_CHIIHOU', 'chiihou');
timingScenario('FIRST_RENHOU', 'renhou');
timingScenario('TSUBAME_GAESHI', 'tsubame_gaeshi');

// ---------------------------------------------------------------------------
// YAKU
// ---------------------------------------------------------------------------

yakuFirstScenario('FIRST_PINFU', 'pinfu');
yakuFirstScenario('FIRST_TANYAO', 'tanyao');
yakuFirstScenario('FIRST_IIPEIKOU', 'iipeikou');
yakuFirstScenario('FIRST_RYANPEIKOU', 'ryanpeikou');
yakuFirstScenario('FIRST_SANSHOKU_DOUJUN', 'sanshoku_doujun');
yakuFirstScenario('FIRST_SANSHOKU_DOUKOU', 'sanshoku_doukou');
yakuFirstScenario('FIRST_ITTSUU', 'ittsuu');
yakuFirstScenario('FIRST_CHANTA', 'chanta');
yakuFirstScenario('FIRST_JUNCHAN', 'junchan');
yakuFirstScenario('FIRST_TOITOI', 'toitoi');
yakuFirstScenario('FIRST_SANANKOU', 'sanankou');
yakuFirstScenario('FIRST_SANKANTSU', 'sankantsu');
yakuFirstScenario('FIRST_SHOUSANGEN', 'shousangen');
yakuFirstScenario('FIRST_HONROUTOU', 'honroutou');
yakuFirstScenario('FIRST_HONITSU', 'honitsu');
yakuFirstScenario('FIRST_CHINITSU', 'chinitsu');
// Hands scored through yaku selection persist the collapsed 'yakuhai' code.
yakuFirstScenario('FIRST_YAKUHAI', 'yakuhai');

yakuCounterScenario('PINFU_10', 10, 'pinfu');
yakuCounterScenario('TANYAO_25', 25, 'tanyao');
yakuCounterScenario('CHIITOITSU_10', 10, 'chiitoitsu', { han: 2, fu: 25 });
yakuCounterScenario('HONITSU_10', 10, 'honitsu');
yakuCounterScenario('CHINITSU_5', 5, 'chinitsu');

// Menzen wins need handDetail present so the open-meld check can run.
function menzenRound(size: 3 | 4): EvaluatorGameRound {
    return round(
        1,
        tsumoResult(SUBJECT, {
            hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('tanyao', 1)], handDetail: handDetail([]) }),
            size,
        })
    );
}

scenario({
    code: 'MENZEN_WINS_50',
    positive: size => ({ games: [standardGame(repeat(50, () => menzenRound(size)), size)] }),
    nearMiss: size => ({ games: [standardGame(repeat(49, () => menzenRound(size)), size)] }),
    progresses: true,
});

function openHandRounds(count: number, meldsPerHand: Meld[]): EvaluatorGameRound[] {
    return repeat(count, () =>
        round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1)],
                    handDetail: handDetail(meldsPerHand),
                }),
            })
        ));
}

repeatedRoundScenario('OPEN_HAND_WIN_10', 10, () => openHandRounds(1, [chii(['man_1', 'man_2', 'man_3'])])[0]!);

scenario({
    code: 'FULLY_OPEN_WIN',
    positive: size => ({
        games: [standardGame(
            openHandRounds(1, [
                chii(['man_1', 'man_2', 'man_3']),
                chii(['pin_1', 'pin_2', 'pin_3']),
                chii(['sou_1', 'sou_2', 'sou_3']),
                pon('haku'),
            ]),
            size
        )],
    }),
    nearMiss: size => ({
        games: [standardGame(
            openHandRounds(1, [
                chii(['man_1', 'man_2', 'man_3']),
                chii(['pin_1', 'pin_2', 'pin_3']),
                chii(['sou_1', 'sou_2', 'sou_3']),
            ]),
            size
        )],
    }),
});

repeatedRoundScenario('TSUMO_WINS_50', 50, () => round(1, tsumoResult(SUBJECT)));
repeatedRoundScenario('RON_WINS_50', 50, () => round(1, ronResult([plainHand(SUBJECT)], 102)));

// ---------------------------------------------------------------------------
// YAKUMAN
// ---------------------------------------------------------------------------

// The superior variant plainly satisfies the base description, so base-code
// scenarios are replayed with the variant hand.
yakumanScenario('FIRST_KOKUSHI', 'kokushi_musou', 'kokushi_musou_13');
yakumanScenario('FIRST_KOKUSHI_13', 'kokushi_musou_13');
yakumanScenario('FIRST_SUUANKOU', 'suuankou', 'suuankou_tanki');
yakumanScenario('FIRST_SUUANKOU_TANKI', 'suuankou_tanki');
yakumanScenario('FIRST_DAISANGEN', 'daisangen');
yakumanScenario('FIRST_DAISUUSHI', 'daisuushi');
yakumanScenario('FIRST_SHOUSUUSHI', 'shousuushi');
yakumanScenario('FIRST_TSUISOU', 'tsuisou');
yakumanScenario('FIRST_RYUUISOU', 'ryuisou');
yakumanScenario('FIRST_CHINROUTOU', 'chinroutou');
yakumanScenario('FIRST_SUUKANTSU', 'suukantsu');
yakumanScenario('FIRST_CHUUREN', 'chuuren_poutou', 'junsei_chuuren_poutou');
yakumanScenario('FIRST_JUNSEI_CHUUREN', 'junsei_chuuren_poutou');

// ---------------------------------------------------------------------------
// DORA / KAN (hand-detail derived)
// ---------------------------------------------------------------------------

scenario({
    code: 'DORA_5_ONE_HAND',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 6, fu: 30, yaku: [y('tanyao', 1), y('dora', 3), y('ura_dora', 2)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 5, fu: 30, yaku: [y('tanyao', 1), y('dora', 3), y('ura_dora', 1)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'DORA_8_ONE_HAND',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 9, fu: 30, yaku: [y('tanyao', 1), y('dora', 5), y('ura_dora', 3)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 8, fu: 30, yaku: [y('tanyao', 1), y('dora', 5), y('ura_dora', 2)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'URA_DORA_3',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 4, fu: 30, yaku: [y('tanyao', 1), y('ura_dora', 3)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 4, fu: 30, yaku: [y('tanyao', 1), y('ura_dora', 2)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'FIRST_AKA_DORA_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('tanyao', 1), y('aka_dora', 1)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size)],
    }),
});

scenario({
    code: 'NO_DORA_MANGAN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 5, fu: 30, yaku: [y('tanyao', 1), y('pinfu', 1)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 5, fu: 30, yaku: [y('tanyao', 1), y('dora', 1)] }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'DORA_PON_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1), y('dora', 1)],
                    handDetail: handDetail([pon('pin_3')], { doraIndicators: ['pin_2'] }),
                }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1), y('dora', 1)],
                    handDetail: handDetail([pon('pin_3')], { doraIndicators: ['sou_2'] }),
                }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'DORA_KAN_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1), y('dora', 1)],
                    handDetail: handDetail([ankan('pin_3')], { doraIndicators: ['pin_2'] }),
                }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1), y('dora', 1)],
                    handDetail: handDetail([ankan('pin_3')], { doraIndicators: ['sou_2'] }),
                }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'SOU_1_PON_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1)],
                    handDetail: handDetail([pon('sou_1')]),
                }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1)],
                    handDetail: handDetail([pon('sou_2')]),
                }),
                size,
            })
        )], size)],
    }),
});

scenario({
    code: 'SOU_1_KAN_WIN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1)],
                    handDetail: handDetail([ankan('sou_1')]),
                }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, {
                    han: 2,
                    fu: 30,
                    yaku: [y('tanyao', 1)],
                    handDetail: handDetail([ankan('sou_2')]),
                }),
                size,
            })
        )], size)],
    }),
});

function kanScenario(code: string, meld: Meld, otherMeld: Meld): void {
    scenario({
        code,
        positive: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, {
                        han: 2,
                        fu: 30,
                        yaku: [y('tanyao', 1)],
                        handDetail: handDetail([meld]),
                    }),
                    size,
                })
            )], size)],
        }),
        nearMiss: size => ({
            games: [standardGame([round(
                1,
                tsumoResult(SUBJECT, {
                    hand: hand(SUBJECT, {
                        han: 2,
                        fu: 30,
                        yaku: [y('tanyao', 1)],
                        handDetail: handDetail([otherMeld]),
                    }),
                    size,
                })
            )], size)],
        }),
    });
}
kanScenario('FIRST_KAN', ankan('pin_3'), pon('pin_3'));
kanScenario('FIRST_ANKAN', ankan('pin_3'), daiminkan('pin_3'));
kanScenario('FIRST_DAIMINKAN', daiminkan('pin_3'), ankan('pin_3'));
kanScenario('FIRST_KAKAN', kakan('pin_3'), ankan('pin_3'));

repeatedRoundScenario('KANS_10', 10, () =>
    round(
        1,
        tsumoResult(SUBJECT, {
            hand: hand(SUBJECT, {
                han: 2,
                fu: 30,
                yaku: [y('tanyao', 1)],
                handDetail: handDetail([ankan('pin_3')]),
            }),
        })
    ));

// ---------------------------------------------------------------------------
// SANMA
// ---------------------------------------------------------------------------

const SANMA_GAME_TIERS = [1, 10, 50, 100] as const;
for (const target of SANMA_GAME_TIERS) {
    scenario({
        code: `SANMA_GAMES_${target}`,
        positive: size => ({ games: wonGames(target, size) }),
        nearMiss: size => ({ games: wonGames(target - 1, size) }),
        progresses: target > 1,
    });
}
for (const target of [1, 10] as const) {
    scenario({
        code: `SANMA_WINS_${target}`,
        positive: size => ({ games: wonGames(target, size) }),
        nearMiss: size => ({
            games: [...wonGames(target - 1, size), standardGame([], size, { winner: 102 })],
        }),
        progresses: target > 1,
        othersMayUnlock: target === 1,
    });
}

scenario({
    code: 'SANMA_FIRST_TSUMO',
    positive: size => ({ games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size)] }),
    nearMiss: size => ({ games: [standardGame([round(1, ronResult([plainHand(SUBJECT)], 102))], size)] }),
});

scenario({
    code: 'SANMA_FIRST_DEALER_WIN',
    positive: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size, { subjectStart: Wind.EAST })],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size, { subjectStart: Wind.SOUTH })],
    }),
});

scenario({
    code: 'SANMA_FIRST_YAKUMAN',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { yakumanCount: 1, yaku: [yakuMan('daisangen')] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { hand: plainHand(SUBJECT, 4, 30), size }))], size)],
    }),
});

scenario({
    code: 'SANMA_FIRST_KITA',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 2, fu: 30, yaku: [y('tanyao', 1), y('kita', 1)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(1, tsumoResult(SUBJECT, { size }))], size)],
    }),
});

scenario({
    code: 'SANMA_KITA_8_ONE_HAND',
    positive: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 9, fu: 30, yaku: [y('tanyao', 1), y('kita', 8)] }),
                size,
            })
        )], size)],
    }),
    nearMiss: size => ({
        games: [standardGame([round(
            1,
            tsumoResult(SUBJECT, {
                hand: hand(SUBJECT, { han: 8, fu: 30, yaku: [y('tanyao', 1), y('kita', 7)] }),
                size,
            })
        )], size)],
    }),
});

// ---------------------------------------------------------------------------
// DICE
// ---------------------------------------------------------------------------

scenario({
    code: 'DICE_FIRST_ROLL',
    positive: size => ({ games: [standardGame([], size, { dice: [3, 4] })] }),
    nearMiss: size => ({ games: [standardGame([], size)] }),
});

scenario({
    code: 'DICE_SNAKE_EYES',
    positive: size => ({ games: [standardGame([], size, { dice: [1, 1] })] }),
    nearMiss: size => ({ games: [standardGame([], size, { dice: [1, 2] })] }),
});

scenario({
    code: 'DICE_BOXCARS',
    positive: size => ({ games: [standardGame([], size, { dice: [6, 6] })] }),
    nearMiss: size => ({ games: [standardGame([], size, { dice: [6, 5] })] }),
});

scenario({
    code: 'DICE_LUCKY_SEVEN',
    positive: size => ({ games: [standardGame([], size, { dice: [3, 4] })] }),
    nearMiss: size => ({ games: [standardGame([], size, { dice: [3, 5] })] }),
});

scenario({
    code: 'DICE_ANY_DOUBLE',
    positive: size => ({ games: [standardGame([], size, { dice: [4, 4] })] }),
    nearMiss: size => ({ games: [standardGame([], size, { dice: [4, 5] })] }),
});

scenario({
    code: 'DICE_TEN_DOUBLES',
    positive: size => ({ games: repeat(10, () => standardGame([], size, { dice: [2, 2] })) }),
    nearMiss: size => ({
        games: [
            ...repeat(9, () => standardGame([], size, { dice: [2, 2] })),
            standardGame([], size, { dice: [2, 3] }),
        ],
    }),
    progresses: true,
});

// ---------------------------------------------------------------------------
// OPENSKILL
// ---------------------------------------------------------------------------

scenario({
    code: 'OPENSKILL_FIRST_RATED',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1505, 1), snap(102, 1600, 1595, 2)])],
    }),
});

scenario({
    code: 'OPENSKILL_LEAVE_PROVISIONAL',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1520, 1, 3.5), snap(102, 1600, 1595, 2, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1520, 1, 4.5), snap(102, 1600, 1595, 2, 4.5)])],
    }),
});

scenario({
    code: 'OPENSKILL_SIGMA_LOW',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1520, 1, 3.5), snap(102, 1600, 1595, 2, 4.5)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1520, 1, 4.5), snap(102, 1600, 1595, 2, 4.5)])],
    }),
});

scenario({
    code: 'OPENSKILL_PEAK_1600',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1650, 1), snap(102, 1400, 1505, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1590, 1), snap(102, 1400, 1505, 2)])],
    }),
    progresses: true,
    extra: () => {
        // Peak progress must survive a later slide.
        const later = [
            ...SCENARIOS.get('OPENSKILL_PEAK_1600')!.nearMiss!(4).skill!,
            skillGame([snap(SUBJECT, 1590, 1400, 3), snap(102, 1400, 1505, 1)]),
        ];
        const states = evaluateSkill(later);
        const s = states.find(r => r.userId === SUBJECT && r.code === 'OPENSKILL_PEAK_1600');
        expect(s?.progress).toBe(1590);
    },
});

scenario({
    code: 'OPENSKILL_PEAK_1800',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1700, 1850, 1), snap(102, 1500, 1605, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1700, 1790, 1), snap(102, 1500, 1605, 2)])],
    }),
    progresses: true,
    extra: () => {
        const later = [
            ...SCENARIOS.get('OPENSKILL_PEAK_1800')!.nearMiss!(4).skill!,
            skillGame([snap(SUBJECT, 1790, 1500, 3), snap(102, 1500, 1605, 1)]),
        ];
        const states = evaluateSkill(later);
        const s = states.find(r => r.userId === SUBJECT && r.code === 'OPENSKILL_PEAK_1800');
        expect(s?.progress).toBe(1790);
    },
});

scenario({
    code: 'OPENSKILL_PEAK_2000',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1900, 2050, 1), snap(102, 1600, 1705, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1900, 1990, 1), snap(102, 1600, 1705, 2)])],
    }),
    progresses: true,
    extra: () => {
        const later = [
            ...SCENARIOS.get('OPENSKILL_PEAK_2000')!.nearMiss!(4).skill!,
            skillGame([snap(SUBJECT, 1990, 1700, 3), snap(102, 1600, 1705, 1)]),
        ];
        const states = evaluateSkill(later);
        const s = states.find(r => r.userId === SUBJECT && r.code === 'OPENSKILL_PEAK_2000');
        expect(s?.progress).toBe(1990);
    },
});

scenario({
    code: 'OPENSKILL_PEAK_2200',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 2100, 2250, 1), snap(102, 1700, 1805, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 2100, 2190, 1), snap(102, 1700, 1805, 2)])],
    }),
    progresses: true,
    extra: () => {
        const later = [
            ...SCENARIOS.get('OPENSKILL_PEAK_2200')!.nearMiss!(4).skill!,
            skillGame([snap(SUBJECT, 2190, 1900, 3), snap(102, 1700, 1805, 1)]),
        ];
        const states = evaluateSkill(later);
        const s = states.find(r => r.userId === SUBJECT && r.code === 'OPENSKILL_PEAK_2200');
        expect(s?.progress).toBe(2190);
    },
});

scenario({
    code: 'OPENSKILL_UNDERDOG_WIN',
    positive: () => ({
        skill: [skillGame([
            snap(SUBJECT, 1400, 1450, 1),
            snap(102, 1500, 1480, 2),
            snap(103, 1600, 1570, 3),
        ])],
    }),
    nearMiss: () => ({
        skill: [skillGame([
            snap(SUBJECT, 1400, 1380, 3),
            snap(102, 1500, 1520, 1),
            snap(103, 1600, 1570, 2),
        ])],
    }),
});

scenario({
    code: 'OPENSKILL_GAIN_50_ONE_GAME',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1400, 1470, 1), snap(102, 1500, 1450, 2)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1400, 1430, 1), snap(102, 1500, 1470, 2)])],
    }),
    progresses: true,
});

// A big single-game loss unlocks it; a small loss must still show progress.
scenario({
    code: 'OPENSKILL_LOSS_50_ONE_GAME',
    positive: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1430, 3), snap(102, 1450, 1520, 1)])],
    }),
    nearMiss: () => ({
        skill: [skillGame([snap(SUBJECT, 1500, 1470, 3), snap(102, 1450, 1500, 1)])],
    }),
    progresses: true,
});

function skillStreakScenario(code: string, target: number, delta: number): void {
    scenario({
        code,
        positive: () => ({
            skill: repeat(
                target,
                i => skillGame([snap(SUBJECT, 1500 + delta * i, 1500 + delta * (i + 1), 1), snap(102, 1600, 1600, 2)])
            ),
        }),
        nearMiss: () => ({
            skill: repeat(
                target - 1,
                i => skillGame([snap(SUBJECT, 1500 + delta * i, 1500 + delta * (i + 1), 1), snap(102, 1600, 1600, 2)])
            ),
        }),
        progresses: true,
    });
}
skillStreakScenario('OPENSKILL_STREAK_GAIN_3', 3, 10);
skillStreakScenario('OPENSKILL_STREAK_LOSS_3', 3, -10);

function skillGamesScenario(code: string, target: number): void {
    scenario({
        code,
        positive: () => ({
            skill: repeat(target, () => skillGame([snap(SUBJECT, 1500, 1505, 1), snap(102, 1600, 1600, 2)])),
        }),
        nearMiss: () => ({
            skill: repeat(target - 1, () => skillGame([snap(SUBJECT, 1500, 1505, 1), snap(102, 1600, 1600, 2)])),
        }),
        progresses: true,
    });
}
skillGamesScenario('OPENSKILL_GAMES_50', 50);
skillGamesScenario('OPENSKILL_GAMES_100', 100);

scenario({
    code: 'OPENSKILL_MULTI_CLUB_RANKED_2',
    positive: () => ({
        skill: [
            skillGame([snap(SUBJECT, 1500, 1520, 1, 3.5), snap(102, 1600, 1595, 2, 2)], { clubId: 1 }),
            skillGame([snap(SUBJECT, 1500, 1520, 1, 3.5), snap(103, 1600, 1595, 2, 2)], { clubId: 2 }),
        ],
    }),
    nearMiss: () => ({
        skill: [
            skillGame([snap(SUBJECT, 1500, 1520, 1, 3.5), snap(102, 1600, 1595, 2, 4.5)], { clubId: 1 }),
        ],
    }),
});

scenario({
    code: 'OPENSKILL_TOP3_STREAK_5',
    positive: () => ({
        skill: repeat(5, i => skillGame([snap(SUBJECT, 1500, 1505, (i % 3) + 1), snap(102, 1600, 1600, 2)])),
    }),
    nearMiss: () => ({
        skill: repeat(4, i => skillGame([snap(SUBJECT, 1500, 1505, (i % 3) + 1), snap(102, 1600, 1600, 2)])),
    }),
    progresses: true,
});

// The track leader (sole #1 rating before the game) wins at the table.
function defendGames(count: number): EvaluatorSkillGameResult[] {
    const games: EvaluatorSkillGameResult[] = [];
    // Game 1: subject takes the lead.
    games.push(skillGame([
        snap(SUBJECT, 1400, 1600, 1),
        snap(102, 1600, 1580, 2),
        snap(103, 1550, 1530, 3),
    ]));
    for (let i = 0; i < count - 1; i++) {
        games.push(skillGame([
            snap(SUBJECT, 1600 + i * 10, 1610 + i * 10, 1),
            snap(102, 1580, 1575, 2),
            snap(103, 1530, 1525, 3),
        ]));
    }
    return games;
}

scenario({
    code: 'OPENSKILL_RANK1_DEFEND_3',
    positive: () => ({ skill: defendGames(4) }),
    nearMiss: () => ({ skill: defendGames(3) }),
    progresses: true,
});

// ---------------------------------------------------------------------------
// EVENT
// ---------------------------------------------------------------------------

// Seasons are not tournaments - they must not feed the tournament counters.
scenario({
    code: 'EVENT_DEBUT',
    positive: () => ({
        events: [event(1, { places: [[SUBJECT, 2]] })],
    }),
    nearMiss: () => ({
        events: [event(1, { isSeason: true, places: [[SUBJECT, 2]] })],
    }),
});

scenario({
    code: 'EVENT_COUNT_10',
    positive: () => ({
        events: repeat(10, i => event(i + 1, { places: [[SUBJECT, 2]] })),
    }),
    nearMiss: () => ({
        events: [
            ...repeat(9, i => event(i + 1, { places: [[SUBJECT, 2]] })),
            event(100, { isSeason: true, places: [[SUBJECT, 2]] }),
        ],
    }),
    progresses: true,
});

scenario({
    code: 'TOURNAMENT_CHAMPION',
    positive: () => ({
        events: [event(1, { places: [[SUBJECT, 1]] })],
    }),
    nearMiss: () => ({
        events: [event(1, { places: [[SUBJECT, 2]] })],
    }),
});

scenario({
    code: 'SEASON_CHAMPION',
    positive: () => ({
        events: [event(1, { isSeason: true, places: [[SUBJECT, 1]] })],
    }),
    nearMiss: () => ({
        events: [event(1, { isSeason: true, places: [[SUBJECT, 2]] })],
    }),
});

scenario({
    code: 'TOURNAMENT_PODIUM',
    positive: () => ({
        events: [event(1, { places: [[SUBJECT, 3]] })],
    }),
    nearMiss: () => ({
        events: [event(1, { places: [[SUBJECT, 4]] })],
    }),
});

scenario({
    code: 'SEASON_PODIUM',
    positive: () => ({
        events: [event(1, { isSeason: true, places: [[SUBJECT, 2]] })],
    }),
    nearMiss: () => ({
        events: [event(1, { isSeason: true, places: [[SUBJECT, 4]] })],
    }),
});

scenario({
    code: 'PODIUMS_5',
    positive: () => ({
        events: repeat(5, i => event(i + 1, { places: [[SUBJECT, 2]] })),
    }),
    nearMiss: () => ({
        events: repeat(4, i => event(i + 1, { places: [[SUBJECT, 2]] })),
    }),
    progresses: true,
});

scenario({
    code: 'CHAMPIONSHIPS_5',
    positive: () => ({
        events: repeat(5, i => event(i + 1, { places: [[SUBJECT, 1]] })),
    }),
    nearMiss: () => ({
        events: repeat(4, i => event(i + 1, { places: [[SUBJECT, 1]] })),
    }),
    progresses: true,
});

// ---------------------------------------------------------------------------
// Evaluation helpers used by extras
// ---------------------------------------------------------------------------

import { evaluateAutomaticAchievements } from '../../src/util/AutomaticAchievementEvaluator.ts';

export function evaluate(...games: EvaluatorGame[]): ComputedAchievementState[] {
    return evaluateAutomaticAchievements(games, [], []);
}

export function evaluateSkill(skill: EvaluatorSkillGameResult[]): ComputedAchievementState[] {
    return evaluateAutomaticAchievements([], [], skill);
}
