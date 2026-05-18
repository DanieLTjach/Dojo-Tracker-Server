import type { GameRulesValues } from "../data/gameRulesCatalog.ts";
import { GameNotInProgressError } from "../error/GameErrors.ts";
import {
    CannotDetermineDealerError,
    CannotFindHeadBumpPlayerError,
    DealInPlayerCannotBeWinnerError,
    DealInPlayerNotInGameError,
    FuRequiredForLowHanHandError,
    HandShouldBeRecordedAsCountedYakumanError,
    HanRequiredForNonYakumanHandError,
    InvalidHonbaFormatError,
    MissingPlayerForWindError,
    NagashiManganNotInRulesetError,
    NoDoubleRonFirstWinsOnlyError,
    NoTripleRonFirstWinsOnlyError,
    RulesetShouldContainDetailedRulesError,
    TripleRonShouldBeAbortiveDrawError,
    YakumanLiabilityRequiresYakumanError,
} from "../error/PointCalculationErrors.ts";
import type { GameRules } from "../model/EventModels.ts";
import { GamePlayer, Wind, type DetailedGame, type GameState } from "../model/GameModels.ts";
import type { AbortiveDraw, Chombo, ExhaustiveDraw, GameRoundResultWithoutPoints, PlayerPointChange, Ron, Tsumo, WinningHandData } from "../model/GameRoundResultModels.ts";

export function calculateRoundPointChanges(
    game: DetailedGame,
    rules: GameRules,
    result: GameRoundResultWithoutPoints
): PlayerPointChange[] {
    const currentGameState = game.currentState;
    if (currentGameState === null) {
        throw new GameNotInProgressError();
    }

    if (rules.details === null) {
        throw new RulesetShouldContainDetailedRulesError();
    }
    const detailedRules = rules.details.rules;

    switch (result.type) {
        case "TSUMO":
            return calculateTsumoPointChanges(currentGameState, game.players, detailedRules, result);
        case "RON":
            return calculateRonPointChanges(currentGameState, game.players, detailedRules, result);
        case "EXHAUSTIVE_DRAW":
            return calculateExhaustiveDrawPointChanges(currentGameState, game.players, detailedRules, result);
        case "ABORTIVE_DRAW":
            return calculateAbortiveDrawPointChanges(result);
        case "CHOMBO":
            return calculateChomboPointChanges(currentGameState, game.players, detailedRules, result);
    }
}

function calculateTsumoPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    tsumo: Tsumo,
    includeHonba: boolean = true
): PlayerPointChange[] {
    if (tsumo.winningHandData.yakumanLiabilityPlayerId !== undefined) {
        if (tsumo.winningHandData.yakumanCount === 0) {
            throw new YakumanLiabilityRequiresYakumanError();
        }
        return calculateRonPointChanges(
            gameState, players, rules,
            {
                type: "RON",
                dealInPlayerId: tsumo.winningHandData.yakumanLiabilityPlayerId,
                riichiPlayerIds: tsumo.riichiPlayerIds,
                winningHandData: [{
                    ...tsumo.winningHandData,
                    yakumanLiabilityPlayerId: undefined
                }]
            },
            includeHonba
        );
    }

    const dealerPlayerId = getCurrentDealerPlayerId(gameState, players);
    const honba = includeHonba ? getHonbaValue(rules) : 0;

    const handBaseValue = calculateHandBaseValue(tsumo.winningHandData, rules) *
        (tsumo.winningHandData.winnerPlayerId === dealerPlayerId ? 2 : 1);

    const payments = players
        .filter(player => player.userId !== tsumo.winningHandData.winnerPlayerId)
        .map(player => ({
            playerId: player.userId,
            pointChange: -(roundUpToHundreds(handBaseValue * (player.userId === dealerPlayerId ? 2 : 1)) + honba * gameState.counters)
        }));

    const totalPayment = -payments.reduce((sum, payment) => sum + payment.pointChange, 0);
    let result = [
        ...payments,
        { playerId: tsumo.winningHandData.winnerPlayerId, pointChange: totalPayment }
    ];
    return mergePlayerPointChanges(
        result,
        giveBankRiichiSticksToPlayer(gameState, tsumo.winningHandData.winnerPlayerId),
        calculatePointChangesFromThisRoundRiichiCalls(
            rules,
            tsumo.riichiPlayerIds,
            [tsumo.winningHandData.winnerPlayerId],
            tsumo.winningHandData.winnerPlayerId
        )
    );
}

function calculateRonPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    ron: Ron,
    includeHonba: boolean = true
): PlayerPointChange[] {
    const headBumpPlayerId = findHeadBumpPlayerId(
        players,
        ron.dealInPlayerId,
        ron.winningHandData.map(hand => hand.winnerPlayerId)
    );
    ron = resolveMultipleRonIfNecessary(rules, ron, headBumpPlayerId);

    const pointChangesFromEachHand = ron.winningHandData
        .map(winningHandData => calculateRonRoundPointChangesForSingleHand(
            gameState,
            players,
            rules,
            ron.dealInPlayerId,
            winningHandData,
            ((rules.continuance_payment_on_multiple_ron ?? "all") === "bump"
                ? winningHandData.winnerPlayerId === headBumpPlayerId
                : true) && includeHonba
        ));
    return mergePlayerPointChanges(
        ...pointChangesFromEachHand,
        giveBankRiichiSticksToPlayer(gameState, headBumpPlayerId),
        calculatePointChangesFromThisRoundRiichiCalls(
            rules,
            ron.riichiPlayerIds,
            ron.winningHandData.map(winningHandData => winningHandData.winnerPlayerId),
            headBumpPlayerId
        )
    );
}

function findHeadBumpPlayerId(players: GamePlayer[], dealInPlayerId: number, winningPlayerIds: number[]): number {
    const dealInPlayerWind = players.find(player => player.userId === dealInPlayerId)?.startPlace;
    if (!dealInPlayerWind) {
        throw new DealInPlayerNotInGameError();
    }

    let windNumber = Object.values(Wind).indexOf(dealInPlayerWind);
    for (let i = 0; i < 4; i++) {
        windNumber = (windNumber + 1) % 4;
        const curWind = Object.values(Wind)[windNumber]!;
        const curPlayer = players.find(player => player.startPlace === curWind);
        if (curPlayer === undefined) {
            throw new MissingPlayerForWindError(curWind);
        }
        if (winningPlayerIds.includes(curPlayer.userId)) {
            return curPlayer.userId
        }
    }

    throw new CannotFindHeadBumpPlayerError();
}

function resolveMultipleRonIfNecessary(rules: GameRulesValues, ron: Ron, headBumpPlayerId: number): Ron {
    switch (ron.winningHandData.length) {
        case 2:
            const doubleRonHandling = rules.double_ron ?? "yes";
            switch (doubleRonHandling) {
                case "first":
                    throw new NoDoubleRonFirstWinsOnlyError();
                case "head_bump":
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case "yes":
                    return ron;
            }
            break;
        case 3:
            const tripleRonHandling = rules.triple_ron ?? "yes";
            switch (tripleRonHandling) {
                case "first":
                    throw new NoTripleRonFirstWinsOnlyError();
                case "cancel":
                    throw new TripleRonShouldBeAbortiveDrawError();
                case "head_bump":
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case "yes":
                    return ron;
            }
            break;
        default:
            return ron;
    }
}

function convertMultipleRonToHeadBump(ron: Ron, headBumpPlayerId: number): Ron {
    return {
        ...ron,
        winningHandData: ron.winningHandData
            .filter(winningHandData => winningHandData.winnerPlayerId === headBumpPlayerId)
    };
}

function calculateRonRoundPointChangesForSingleHand(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    dealInPlayerId: number,
    winningHandData: WinningHandData,
    includeHonba: boolean
): PlayerPointChange[] {
    if (dealInPlayerId === winningHandData.winnerPlayerId) {
        throw new DealInPlayerCannotBeWinnerError();
    }

    const dealerPlayerId = getCurrentDealerPlayerId(gameState, players);
    const fullHonbaPayment = includeHonba
        ? getHonbaValue(rules) * gameState.counters * ((rules.number_of_players ?? 4) - 1)
        : 0;

    const handBaseValue = calculateHandBaseValue(winningHandData, rules);
    const handValue = roundUpToHundreds(handBaseValue * ((winningHandData.winnerPlayerId === dealerPlayerId) ? 6 : 4));

    if (winningHandData.yakumanLiabilityPlayerId !== undefined) {
        if (winningHandData.yakumanCount === 0) {
            throw new YakumanLiabilityRequiresYakumanError();
        }

        const honbaPayer = rules.continuance_payment_pao ?? "discarder";
        if (winningHandData.yakumanLiabilityPlayerId !== dealInPlayerId) {
            return [
                {
                    playerId: winningHandData.yakumanLiabilityPlayerId,
                    pointChange: -(handValue / 2 + (honbaPayer === 'feeder' ? fullHonbaPayment : 0))
                },
                {
                    playerId: dealInPlayerId,
                    pointChange: -(handValue / 2 + (honbaPayer === 'discarder' ? fullHonbaPayment : 0))
                },
                {
                    playerId: winningHandData.winnerPlayerId,
                    pointChange: handValue + fullHonbaPayment
                }
            ];
        }
    }

    return [
        { playerId: dealInPlayerId, pointChange: -(handValue + fullHonbaPayment) },
        { playerId: winningHandData.winnerPlayerId, pointChange: handValue + fullHonbaPayment }
    ];
}

function calculatePointChangesFromThisRoundRiichiCalls(
    rules: GameRulesValues,
    riichiPlayerIds: number[],
    winnerPlayerIds: number[],
    receiverPlayerId: number
): PlayerPointChange[] {
    if (rules.riichi_deposit_is_returned_if_one_of_multiple_ron ?? false) {
        riichiPlayerIds = riichiPlayerIds.filter(playerId => !winnerPlayerIds.includes(playerId));
    }
    riichiPlayerIds = riichiPlayerIds.filter(playerId => playerId !== receiverPlayerId);

    const payments = riichiPlayerIds.map(playerId => ({ playerId, pointChange: -1000 }));
    const totalPayment = -payments.reduce((sum, payment) => sum + payment.pointChange, 0);
    return [
        ...payments,
        { playerId: receiverPlayerId, pointChange: totalPayment }
    ];
}

function calculateExhaustiveDrawPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    // nagashi mangan counted as a win is not implemented
    if (exhaustiveDraw.nagashiManganPlayerIds.length > 0) {
        return calculateNagashiManganPointChanges(gameState, players, rules, exhaustiveDraw);
    }
    return mergePlayerPointChanges(
        calculateNotenPaymentPointChanges(players, rules, exhaustiveDraw),
        takeRiichiSticksFromPlayers(exhaustiveDraw.riichiPlayerIds)
    );
}

function calculateNagashiManganPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (!(rules.nagashi_mangan ?? true)) {
        throw new NagashiManganNotInRulesetError();
    }

    const nagashiManganPointChanges = exhaustiveDraw.nagashiManganPlayerIds.map(playerId =>
        calculateTsumoPointChanges(
            gameState, players, rules,
            {
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: playerId,
                    yakumanCount: 0,
                    han: 5
                },
                riichiPlayerIds: []
            },
            false
        )
    );
    return mergePlayerPointChanges(
        ...nagashiManganPointChanges,
        takeRiichiSticksFromPlayers(exhaustiveDraw.riichiPlayerIds)
    );
}

function calculateNotenPaymentPointChanges(
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (exhaustiveDraw.tenpaiPlayerIds.length === 0 ||
        exhaustiveDraw.tenpaiPlayerIds.length === (rules.number_of_players ?? 4)) {
        return [];
    }

    const notenPenalty = rules.noten_penalty ?? (1000 * ((rules.number_of_players ?? 4) - 1));

    const notenPlayerIds = players
        .map(player => player.userId)
        .filter(playerId => !exhaustiveDraw.tenpaiPlayerIds.includes(playerId));
    
    return mergePlayerPointChanges(
        notenPlayerIds.map(playerId => ({
            playerId,
            pointChange: -notenPenalty / notenPlayerIds.length
        })),
        exhaustiveDraw.tenpaiPlayerIds.map(playerId => ({
            playerId,
            pointChange: notenPenalty / exhaustiveDraw.tenpaiPlayerIds.length
        }))
    );
}

function calculateAbortiveDrawPointChanges(abortiveDraw: AbortiveDraw): PlayerPointChange[] {
    return takeRiichiSticksFromPlayers(abortiveDraw.riichiPlayerIds);
}

function calculateChomboPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    chombo: Chombo
): PlayerPointChange[] {
    switch (rules.chombo ?? "twenty_thousand_after_uma") {
        case "twenty_thousand_after_uma":
            return [];
        case "mangan":
            const manganTsumoPayments = calculateTsumoPointChanges(
                gameState, players, rules,
                {
                    type: 'TSUMO',
                    winningHandData: {
                        winnerPlayerId: chombo.offenderPlayerId,
                        yakumanCount: 0,
                        han: 5
                    },
                    riichiPlayerIds: []
                },
                false
            );

            return manganTsumoPayments.map(playerPointChange => ({
                playerId: playerPointChange.playerId,
                pointChange: -playerPointChange.pointChange
            }));
    }
}

function giveBankRiichiSticksToPlayer(gameState: GameState, playerId: number): PlayerPointChange[] {
    return [{
        playerId,
        pointChange: gameState.riichiSticks * 1000
    }];
}

function takeRiichiSticksFromPlayers(riichiPlayerIds: number[]): PlayerPointChange[] {
    return riichiPlayerIds.map(playerId => ({ playerId, pointChange: -1000 }));
}

function mergePlayerPointChanges(...arrays: PlayerPointChange[][]): PlayerPointChange[] {
    const merged = new Map<number, number>();

    for (const change of arrays.flat()) {
        merged.set(change.playerId, (merged.get(change.playerId) ?? 0) + change.pointChange);
    }

    return Array.from(merged.entries()).map(([playerId, pointChange]) => ({ playerId, pointChange }));
}

function roundUpToHundreds(value: number): number {
    return Math.ceil(value / 100) * 100;
}

function getCurrentDealerPlayerId(gameState: GameState, players: GamePlayer[]): number {
    const dealer = players.find(player => player.startPlace === gameState.wind);
    if (dealer === undefined) {
        throw new CannotDetermineDealerError();
    }

    return dealer.userId;
}

function getHonbaValue(rules: GameRulesValues): number {
    if (rules.honba === undefined) {
        return 100;
    }

    const parts = rules.honba.split('x');
    if (parts.length !== 2) {
        throw new InvalidHonbaFormatError();
    }

    const value = parseInt(parts[1]!, 10);
    if (isNaN(value)) {
        throw new InvalidHonbaFormatError();
    }

    return value;
}

function calculateHandBaseValue(hand: WinningHandData, rules: GameRulesValues): number {
    if (hand.yakumanCount > 0) {
        let yakumanCount = (rules.yakuman_stacking ?? true) ? hand.yakumanCount : 1;
        return 8000 * yakumanCount;
    }

    if (hand.han === undefined) {
        throw new HanRequiredForNonYakumanHandError();
    }
    if ((rules.counted_yakuman ?? true) && hand.han >= 13) {
        throw new HandShouldBeRecordedAsCountedYakumanError();
    }

    if (hand.han >= 5) {
        return limitHandBaseValue(hand.han);
    }

    if (hand.fu === undefined) {
        throw new FuRequiredForLowHanHandError();
    }

    const result = Math.min(2000, hand.fu * Math.pow(2, hand.han + 2));
    return ((rules.mangan_rounding_up ?? false) && result > 1900) ? 2000 : result;
}

function limitHandBaseValue(han: number): number {
    if (han <= 5) return 2000;
    if (han <= 7) return 3000;
    if (han <= 10) return 4000;
    return 6000;
}