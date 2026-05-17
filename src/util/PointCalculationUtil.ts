import type { GameRulesValues } from "../data/gameRulesCatalog.ts";
import type { GameRules } from "../model/EventModels.ts";
import { Wind, type DetailedGame, type GameState } from "../model/GameModels.ts";
import type { ExhaustiveDraw, GameRoundResultWithoutPoints, PlayerPointChange, Ron, Tsumo, WinningHandData } from "../model/GameRoundResultModels.ts";

export function calculateRoundPointChanges(
    game: DetailedGame,
    result: GameRoundResultWithoutPoints,
    rules: GameRules
): PlayerPointChange[] {
    if (rules.details === null) {
        throw new Error("RulesetShouldContainDetailedRulesToRecordATrackedGame");
    }

    const currentGameState = game.currentState;
    if (currentGameState === null) {
        throw new Error("CannotDetermineDealerInvalidGameState");
    }

    switch (result.type) {
        case "TSUMO":
            return calculateTsumoPointChanges(game, currentGameState, rules, rules.details.rules, result);
        case "RON":
            return calculateRonPointChanges(game, currentGameState, rules, rules.details.rules, result);
        case "EXHAUSTIVE_DRAW":
            return calculateExhaustiveDrawPointChanges(game, currentGameState, rules, rules.details.rules, result);
        case "ABORTIVE_DRAW":
        case "CHOMBO":
    }

    return [];
}

function calculateTsumoPointChanges(
    game: DetailedGame,
    gameState: GameState,
    rules: GameRules,
    detailedRules: GameRulesValues,
    tsumo: Tsumo,
    includeHonba: boolean = true
): PlayerPointChange[] {
    const dealerPlayerId = getCurrentDealerPlayerId(game, gameState);
    const honba = includeHonba ? getHonbaValue(detailedRules) : 0;

    let handBaseValue = calculateHandBaseValue(tsumo.winningHandData, detailedRules);

    if (tsumo.winningHandData.yakumanLiabilityPlayerId !== undefined) {
        if (tsumo.winningHandData.yakumanCount === 0) {
            throw new Error("YakumanLiabilityIsOnlyApplicableIfHandIsAYakuman");
        }
        const fullHandValue = handBaseValue * ((tsumo.winningHandData.winnerPlayerId === dealerPlayerId) ? 6 : 4)
            + honba * gameState.counters * (rules.numberOfPlayers - 1);

        return [
            { playerId: tsumo.winningHandData.yakumanLiabilityPlayerId, pointChange: -fullHandValue },
            { playerId: tsumo.winningHandData.winnerPlayerId, pointChange: fullHandValue }
        ];
    }

    if (tsumo.winningHandData.winnerPlayerId === dealerPlayerId) {
        handBaseValue *= 2;
    }

    const payments = game.players
        .filter(player => player.userId !== tsumo.winningHandData.winnerPlayerId)
        .map(player => ({
            playerId: player.userId,
            pointChange: -(roundUpToHundeds(handBaseValue * (player.userId === dealerPlayerId ? 2 : 1)) + honba * gameState.counters)
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
            detailedRules,
            tsumo.riichiPlayerIds,
            [tsumo.winningHandData.winnerPlayerId],
            tsumo.winningHandData.winnerPlayerId
        )
    );
}

function calculateRonPointChanges(
    game: DetailedGame,
    gameState: GameState,
    rules: GameRules,
    detailedRules: GameRulesValues,
    ron: Ron
): PlayerPointChange[] {
    const headBumpPlayerId = findHeadBumpPlayerId(
        game,
        ron.dealInPlayerId,
        ron.winningHandData.map(hand => hand.winnerPlayerId)
    );
    ron = resolveMultipleRonIfNecessary(detailedRules, ron, headBumpPlayerId);

    const pointChangesFromEachHand = ron.winningHandData
        .map(winninghandData => calculateRonRoundPointChangesForSingleHand(
            game,
            gameState,
            rules,
            detailedRules,
            ron.dealInPlayerId,
            winninghandData,
            (detailedRules.continuance_payment_on_multiple_ron ?? "all") === "bump"
                ? winninghandData.winnerPlayerId == headBumpPlayerId
                : true
        ));
    return mergePlayerPointChanges(
        ...pointChangesFromEachHand,
        giveBankRiichiSticksToPlayer(gameState, headBumpPlayerId),
        calculatePointChangesFromThisRoundRiichiCalls(
            detailedRules,
            ron.riichiPlayerIds,
            ron.winningHandData.map(winningHandData => winningHandData.winnerPlayerId),
            headBumpPlayerId
        )
    )
}

// TODO: all errors in this function are InternalServerError
function findHeadBumpPlayerId(game: DetailedGame, dealInPlayerId: number, winningPlayerIds: number[]): number {
    const dealInPlayerWind = game.players.find(player => player.userId === dealInPlayerId)?.startPlace;
    if (!dealInPlayerWind) {
        throw new Error("DealInPlayerNotPresentInGame");
    }

    let windNumber = Object.values(Wind).indexOf(dealInPlayerWind);
    for (let i = 0; i < 4; i++) {
        windNumber = (windNumber + 1) % 4;
        const curWind = Object.values(Wind)[windNumber];
        const curPlayer = game.players.find(player => player.startPlace === curWind);
        if (curPlayer === undefined) {
            throw new Error("MissingPlayerForOneOfTheWinds"); // TODO: when converting to proper error, add wind to error message
        }
        if (winningPlayerIds.includes(curPlayer.userId)) {
            return curPlayer.userId
        }
    }

    throw new Error("CannotFindHeadBumpPlayerId");
}

function resolveMultipleRonIfNecessary(detailedRules: GameRulesValues, ron: Ron, headBumpPlayerId: number): Ron {
    switch (ron.winningHandData.length) {
        case 1:
            return ron;
        case 2:
            const doubleRonHandling = detailedRules.double_ron ?? "yes";
            switch (doubleRonHandling) {
                case "first":
                    throw new Error("NoDoubleRonAllowedOnlyTheFirstPersonWhoDeclaredRonWins");
                case "head_bump":
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case "yes":
                    return ron;
            }
        case 3:
            const tripleRonHandling = detailedRules.triple_ron ?? "yes";
            switch (tripleRonHandling) {
                case "first":
                    throw new Error("NoTripleRonAllowedOnlyTheFirstPersonWhoDeclaredRonWins");
                case "head_bump":
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case "cancel":
                    throw new Error("TripleRonShouldBeRecordedAsAbortiveDraw");
                case "yes":
                    return ron;
            }
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
    game: DetailedGame,
    gameState: GameState,
    rules: GameRules,
    detailedRules: GameRulesValues,
    dealInPlayerId: number,
    winningHandData: WinningHandData,
    includeHonba: boolean
): PlayerPointChange[] {
    if (dealInPlayerId === winningHandData.winnerPlayerId) {
        throw new Error("DealInPlayerCannotBeTheSameAsWinner");
    }

    const dealerPlayerId = getCurrentDealerPlayerId(game, gameState);
    const fullHonbaPayment = includeHonba ? getHonbaValue(detailedRules) * gameState.counters * (rules.numberOfPlayers - 1) : 0;

    const handBaseValue = calculateHandBaseValue(winningHandData, detailedRules);
    const handValue = roundUpToHundeds(handBaseValue * ((winningHandData.winnerPlayerId === dealerPlayerId) ? 6 : 4));

    if (winningHandData.yakumanLiabilityPlayerId !== undefined) {
        if (winningHandData.yakumanCount === 0) {
            throw new Error("YakumanLiabilityIsOnlyApplicableIfHandIsAYakuman");
        }

        const honbaPayer = detailedRules.continuance_payment_pao ?? "discarder";
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
                    pointChange: handValue * fullHonbaPayment
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
    detailedRules: GameRulesValues,
    riichiPlayerIds: number[],
    winnerPlayerIds: number[],
    receiverPlayerId: number
): PlayerPointChange[] {
    if (detailedRules.riichi_deposit_is_returned_if_one_of_multiple_ron ?? false) {
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
    game: DetailedGame,
    gameState: GameState,
    rules: GameRules,
    detailedRules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (exhaustiveDraw.nagashiManganPlayerIds.length > 0) {
        return calculateNagashiManganPointChanges(game, gameState, rules, detailedRules, exhaustiveDraw);
    }
    return mergePlayerPointChanges(
        calculateNotenPaymentPointChanges(game, rules, detailedRules, exhaustiveDraw),
        takeRiichiSticksFromPlayers(exhaustiveDraw.riichiPlayerIds)
    );
}

function calculateNagashiManganPointChanges(
    game: DetailedGame,
    gameState: GameState,
    rules: GameRules,
    detailedRules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (!(detailedRules.nagashi_mangan ?? true)) {
        throw new Error("NagashiManganIsNotPresentInRuleset");
    }

    const nagashiManganPointChanges = exhaustiveDraw.nagashiManganPlayerIds.map(playerId =>
        calculateTsumoPointChanges(
            game,
            gameState,
            rules,
            detailedRules,
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
    game: DetailedGame,
    rules: GameRules,
    detailedRules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (exhaustiveDraw.tenpaiPlayerIds.length === 0 || exhaustiveDraw.tenpaiPlayerIds.length === rules.numberOfPlayers) {
        return [];
    }

    const notenPenalty = detailedRules.noten_penalty ?? 1000 * (rules.numberOfPlayers - 1);

    const notenPlayerIds = game.players
        .map(player => player.userId)
        .filter(playerId => !exhaustiveDraw.tenpaiPlayerIds.includes(playerId));
    const notenPointChanges = notenPlayerIds.map(playerId => ({
        playerId,
        pointChange: -notenPenalty / notenPlayerIds.length
    }));

    const tenpaiPointChanges = exhaustiveDraw.tenpaiPlayerIds.map(playerId => ({
        playerId,
        pointChange: notenPenalty / exhaustiveDraw.tenpaiPlayerIds.length
    }));
    return mergePlayerPointChanges(notenPointChanges, tenpaiPointChanges);
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

function roundUpToHundeds(value: number): number {
    return Math.ceil(value / 100) * 100;
}

function getHonbaValue(rules: GameRulesValues): number {
    if (rules.honba === undefined) {
        return 100;
    }

    const parts = rules.honba.split('x');
    if (parts.length !== 2) {
        throw new Error("InvalidHonbaFormat");
    }

    const value = parseInt(parts[1]!, 10);
    if (isNaN(value)) {
        throw new Error("InvalidHonbaFormat");
    }

    return value;
}

function getCurrentDealerPlayerId(game: DetailedGame, gameState: GameState): number {
    const dealer = game.players.find(player => player.startPlace === gameState.wind);
    if (dealer === undefined) {
        throw new Error("CannotDetermineDealerInvalidGameState");
    }

    return dealer.userId;
}

function calculateHandBaseValue(hand: WinningHandData, rules: GameRulesValues): number {
    if (hand.yakumanCount > 0) {
        let yakumanCount = (rules.yakuman_stacking ?? true) ? hand.yakumanCount : 1;
        return 8000 * yakumanCount;
    }

    if (hand.han === undefined) {
        // TODO: replace with proper errors
        throw new Error("HanShouldBeProvidedForNonYakumanHand");
    }
    if ((rules.counted_yakuman ?? true) && hand.han >= 13) {
        throw new Error("ThisHandShouldBeRecordedAsACountedYakuman");
    }

    if (hand.han >= 5) {
        return limitHandBaseValue(hand.han);
    }

    if (hand.fu === undefined) {
        throw new Error("FuShouldBeProvidedForHandsWithLessThanFiveHan");
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