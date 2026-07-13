import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import { GameNotInProgressWhenAddingNewRoundError } from '../error/GameErrors.ts';
import {
    CannotDetermineDealerError,
    CannotDeterminePlayerPlacementError,
    CannotFindHeadBumpPlayerError,
    DealInPlayerCannotBeWinnerError,
    DealInPlayerNotInGameError,
    FuRequiredForLowHanHandError,
    HandShouldBeRecordedAsCountedYakumanError,
    HanRequiredForNonYakumanHandError,
    MissingPlayerForWindError,
    NagashiManganNotInRulesetError,
    NoDoubleRonFirstWinsOnlyError,
    NoTripleRonFirstWinsOnlyError,
    PlayerNotInGameError,
    RulesetShouldContainDetailedRulesError,
    TripleRonShouldBeAbortiveDrawError,
    YakumanLiabilityRequiresYakumanError,
    TwoHanMinimumIsRequiredError,
    NoPlayersInTheGameError,
    AbortiveDrawNotInRulesetError,
    InsufficientPointsForRiichiError,
} from '../error/PointCalculationErrors.ts';
import type { GameRules } from '../model/EventModels.ts';
import type { GamePlayer, DetailedGame, GameState } from '../model/GameModels.ts';
import { GameFinishReason, nextWind, Wind, WIND_ORDER } from '../model/GameModels.ts';
import type {
    AbortiveDraw,
    Chombo,
    ExhaustiveDraw,
    GameRoundResult,
    GameRoundResultInputDTO,
    PlayerPointChange,
    Ron,
    Tsumo,
    WinningHandData,
} from '../model/GameRoundResultModels.ts';
import {
    getAgariYame,
    getBankruptHandling as getBankruptcyHandling,
    isAutomaticAgariTenpaiYameEnabled,
    getChomboHandling,
    getContinuancePaymentOnMultipleRon,
    getContinuancePaymentPao,
    getContinuation,
    getDoubleRonHandling,
    getHonbaValue,
    getMaxPoints,
    getNotenPenalty,
    getNumberOfPlayers,
    getRemainingRiichiDeposits,
    getRiichiDepositValue,
    getTenpaiYame,
    getTripleRonHandling,
    isContinuationWhenAbortionEnabled,
    isCountedYakumanEnabled,
    isManganRoundingUpEnabled,
    isNagashiManganEnabled,
    isRiichiDepositReturnedIfOneOfMultipleRon,
    isRiichiDepositMinimumEnabled,
    isTwoHanMinimumEnabled,
    isWestRoundEnabled,
    isYakumanStackingEnabled,
    isAbortiveDrawEnabled,
} from './RulesUtils.ts';

export function calculateGameRoundResult(
    game: DetailedGame,
    rules: GameRules,
    result: GameRoundResultInputDTO
): GameRoundResult {
    const currentGameState = game.currentState;
    if (currentGameState === null) {
        throw new GameNotInProgressWhenAddingNewRoundError();
    }

    if (rules.details === null) {
        throw new RulesetShouldContainDetailedRulesError();
    }
    const detailedRules = rules.details.rules;

    validateResultPlayersInGame(game.players, result);
    validateRiichiPlayersCanPay(game.players, detailedRules, result);

    const roundPointChanges = calculateRoundPointChanges(currentGameState, game.players, detailedRules, result);

    const updatedGamePlayers = game.players.map(player => updatePlayerPoints(player, roundPointChanges));
    const nextRoundState = calculateNextRoundState(currentGameState, updatedGamePlayers, detailedRules, result);

    const gameFinishReason = shouldFinishGame(
        currentGameState,
        nextRoundState,
        updatedGamePlayers,
        rules,
        detailedRules,
        result
    );
    if (gameFinishReason === undefined) {
        return {
            ...result,
            playerPointChanges: roundPointChanges,
            nextState: nextRoundState,
            gameFinishReason: undefined,
        };
    }

    return {
        ...result,
        playerPointChanges: mergePlayerPointChanges(
            roundPointChanges,
            handleRemaningRiichiSticksAfterGameFinished(
                updatedGamePlayers,
                rules,
                detailedRules,
                nextRoundState.riichiSticks
            )
        ),
        nextState: undefined,
        gameFinishReason,
    };
}

function validateRiichiPlayersCanPay(
    players: GamePlayer[],
    rules: GameRulesValues,
    result: GameRoundResultInputDTO
): void {
    if (!isRiichiDepositMinimumEnabled(rules)) return;

    const deposit = getRiichiDepositValue(rules);
    const riichiPlayerIds = result.type === 'CHOMBO' ? [] : result.riichiPlayerIds;
    for (const playerId of riichiPlayerIds) {
        const player = players.find(candidate => candidate.userId === playerId)!;
        if (player.points < deposit) {
            throw new InsufficientPointsForRiichiError(playerId, deposit, player.points);
        }
    }
}

function calculateRoundPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    result: GameRoundResultInputDTO
): PlayerPointChange[] {
    switch (result.type) {
        case 'TSUMO':
            return calculateTsumoPointChanges(gameState, players, rules, result);
        case 'RON':
            return calculateRonPointChanges(gameState, players, rules, result);
        case 'EXHAUSTIVE_DRAW':
            return calculateExhaustiveDrawPointChanges(gameState, players, rules, result);
        case 'ABORTIVE_DRAW':
            return calculateAbortiveDrawPointChanges(rules, result);
        case 'CHOMBO':
            return calculateChomboPointChanges(gameState, players, rules, result);
    }
}

function validateResultPlayersInGame(
    players: GamePlayer[],
    result: GameRoundResultInputDTO
): void {
    const playerIds = new Set(players.map(player => player.userId));
    const requireInGame = (playerId: number) => {
        if (!playerIds.has(playerId)) {
            throw new PlayerNotInGameError(playerId);
        }
    };

    switch (result.type) {
        case 'TSUMO':
            requireInGame(result.winningHandData.winnerPlayerId);
            result.riichiPlayerIds.forEach(requireInGame);
            if (result.winningHandData.yakumanLiabilityPlayerId !== undefined) {
                requireInGame(result.winningHandData.yakumanLiabilityPlayerId);
            }
            break;
        case 'RON':
            requireInGame(result.dealInPlayerId);
            result.riichiPlayerIds.forEach(requireInGame);
            result.winningHandData.forEach(hand => {
                requireInGame(hand.winnerPlayerId);
                if (hand.yakumanLiabilityPlayerId !== undefined) {
                    requireInGame(hand.yakumanLiabilityPlayerId);
                }
            });
            break;
        case 'EXHAUSTIVE_DRAW':
            result.tenpaiPlayerIds.forEach(requireInGame);
            result.nagashiManganPlayerIds.forEach(requireInGame);
            result.riichiPlayerIds.forEach(requireInGame);
            break;
        case 'ABORTIVE_DRAW':
            result.riichiPlayerIds.forEach(requireInGame);
            break;
        case 'CHOMBO':
            requireInGame(result.offenderPlayerId);
            break;
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
            gameState,
            players,
            rules,
            {
                type: 'RON',
                dealInPlayerId: tsumo.winningHandData.yakumanLiabilityPlayerId,
                riichiPlayerIds: tsumo.riichiPlayerIds,
                winningHandData: [{
                    ...tsumo.winningHandData,
                    yakumanLiabilityPlayerId: undefined,
                }],
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
            pointChange: -(roundUpToHundreds(handBaseValue * (player.userId === dealerPlayerId ? 2 : 1)) +
                honba * gameState.counters),
        }));

    const totalPayment = -payments.reduce((sum, payment) => sum + payment.pointChange, 0);
    let result = [
        ...payments,
        { playerId: tsumo.winningHandData.winnerPlayerId, pointChange: totalPayment },
    ];
    return mergePlayerPointChanges(
        result,
        giveBankRiichiSticksToPlayer(gameState, rules, tsumo.winningHandData.winnerPlayerId),
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
        rules,
        ron.dealInPlayerId,
        ron.winningHandData.map(hand => hand.winnerPlayerId)
    );
    ron = resolveMultipleRonIfNecessary(rules, ron, headBumpPlayerId);

    const pointChangesFromEachHand = ron.winningHandData
        .map(winningHandData =>
            calculateRonRoundPointChangesForSingleHand(
                gameState,
                players,
                rules,
                ron.dealInPlayerId,
                winningHandData,
                (getContinuancePaymentOnMultipleRon(rules) === 'bump'
                    ? winningHandData.winnerPlayerId === headBumpPlayerId
                    : true) && includeHonba
            )
        );
    return mergePlayerPointChanges(
        ...pointChangesFromEachHand,
        giveBankRiichiSticksToPlayer(gameState, rules, headBumpPlayerId),
        calculatePointChangesFromThisRoundRiichiCalls(
            rules,
            ron.riichiPlayerIds,
            ron.winningHandData.map(winningHandData => winningHandData.winnerPlayerId),
            headBumpPlayerId
        )
    );
}

function findHeadBumpPlayerId(
    players: GamePlayer[],
    rules: GameRulesValues,
    dealInPlayerId: number,
    winningPlayerIds: number[]
): number {
    const dealInPlayerWind = players.find(player => player.userId === dealInPlayerId)?.startPlace;
    if (!dealInPlayerWind) {
        throw new DealInPlayerNotInGameError();
    }

    let curWind = dealInPlayerWind;
    for (let i = 0; i < getNumberOfPlayers(rules) - 1; i++) {
        curWind = nextWind(curWind);
        if (curWind === 'NORTH' && getNumberOfPlayers(rules) === 3) {
            curWind = 'EAST';
        }
        const curPlayer = players.find(player => player.startPlace === curWind);
        if (curPlayer === undefined) {
            throw new MissingPlayerForWindError(curWind);
        }
        if (winningPlayerIds.includes(curPlayer.userId)) {
            return curPlayer.userId;
        }
    }

    throw new CannotFindHeadBumpPlayerError();
}

function resolveMultipleRonIfNecessary(rules: GameRulesValues, ron: Ron, headBumpPlayerId: number): Ron {
    switch (ron.winningHandData.length) {
        case 2:
            const doubleRonHandling = getDoubleRonHandling(rules);
            switch (doubleRonHandling) {
                case 'first':
                    throw new NoDoubleRonFirstWinsOnlyError();
                case 'head_bump':
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case 'yes':
                    return ron;
            }
            break;
        case 3:
            const tripleRonHandling = getTripleRonHandling(rules);
            switch (tripleRonHandling) {
                case 'first':
                    throw new NoTripleRonFirstWinsOnlyError();
                case 'cancel':
                    throw new TripleRonShouldBeAbortiveDrawError();
                case 'head_bump':
                    return convertMultipleRonToHeadBump(ron, headBumpPlayerId);
                case 'yes':
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
            .filter(winningHandData => winningHandData.winnerPlayerId === headBumpPlayerId),
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
        ? getHonbaValue(rules) * gameState.counters * (getNumberOfPlayers(rules) - 1)
        : 0;

    const handBaseValue = calculateHandBaseValue(winningHandData, rules);
    const handValue = roundUpToHundreds(handBaseValue * ((winningHandData.winnerPlayerId === dealerPlayerId) ? 6 : 4));

    if (winningHandData.yakumanLiabilityPlayerId !== undefined) {
        if (winningHandData.yakumanCount === 0) {
            throw new YakumanLiabilityRequiresYakumanError();
        }

        const honbaPayer = getContinuancePaymentPao(rules);
        if (winningHandData.yakumanLiabilityPlayerId !== dealInPlayerId) {
            return [
                {
                    playerId: winningHandData.yakumanLiabilityPlayerId,
                    pointChange: -(handValue / 2 + (honbaPayer === 'feeder' ? fullHonbaPayment : 0)),
                },
                {
                    playerId: dealInPlayerId,
                    pointChange: -(handValue / 2 + (honbaPayer === 'discarder' ? fullHonbaPayment : 0)),
                },
                {
                    playerId: winningHandData.winnerPlayerId,
                    pointChange: handValue + fullHonbaPayment,
                },
            ];
        }
    }

    return [
        { playerId: dealInPlayerId, pointChange: -(handValue + fullHonbaPayment) },
        { playerId: winningHandData.winnerPlayerId, pointChange: handValue + fullHonbaPayment },
    ];
}

function calculatePointChangesFromThisRoundRiichiCalls(
    rules: GameRulesValues,
    riichiPlayerIds: number[],
    winnerPlayerIds: number[],
    receiverPlayerId: number
): PlayerPointChange[] {
    if (isRiichiDepositReturnedIfOneOfMultipleRon(rules)) {
        riichiPlayerIds = riichiPlayerIds.filter(playerId => !winnerPlayerIds.includes(playerId));
    }
    riichiPlayerIds = riichiPlayerIds.filter(playerId => playerId !== receiverPlayerId);

    const deposit = getRiichiDepositValue(rules);
    const payments = riichiPlayerIds.map(playerId => ({ playerId, pointChange: -deposit }));
    const totalPayment = -payments.reduce((sum, payment) => sum + payment.pointChange, 0);
    return [
        ...payments,
        { playerId: receiverPlayerId, pointChange: totalPayment },
    ];
}

function calculateExhaustiveDrawPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (exhaustiveDraw.nagashiManganPlayerIds.length > 0) {
        return calculateNagashiManganPointChanges(gameState, players, rules, exhaustiveDraw);
    }
    return mergePlayerPointChanges(
        calculateNotenPaymentPointChanges(players, rules, exhaustiveDraw),
        takeRiichiSticksFromPlayers(rules, exhaustiveDraw.riichiPlayerIds)
    );
}

function calculateNagashiManganPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (!isNagashiManganEnabled(rules)) {
        throw new NagashiManganNotInRulesetError();
    }

    // Nagashi mangan is scored as a mangan tsumo for each achiever but is otherwise treated as
    // an exhaustive draw: no honba is paid, and the riichi-stick bank stays on the table. The
    // empty bank passed here keeps the tsumo helper from awarding the bank to the achiever.
    const gameStateWithoutBank: GameState = { ...gameState, riichiSticks: 0 };
    const nagashiManganPointChanges = exhaustiveDraw.nagashiManganPlayerIds.map(playerId =>
        calculateTsumoPointChanges(
            gameStateWithoutBank,
            players,
            rules,
            {
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: playerId,
                    yakumanCount: 0,
                    han: 5,
                },
                riichiPlayerIds: [],
            },
            false
        )
    );
    return mergePlayerPointChanges(
        ...nagashiManganPointChanges,
        takeRiichiSticksFromPlayers(rules, exhaustiveDraw.riichiPlayerIds)
    );
}

function calculateNotenPaymentPointChanges(
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): PlayerPointChange[] {
    if (
        exhaustiveDraw.tenpaiPlayerIds.length === 0 ||
        exhaustiveDraw.tenpaiPlayerIds.length === getNumberOfPlayers(rules)
    ) {
        return [];
    }

    const notenPenalty = getNotenPenalty(rules);

    const notenPlayerIds = players
        .map(player => player.userId)
        .filter(playerId => !exhaustiveDraw.tenpaiPlayerIds.includes(playerId));

    // GameRulesSchemas guarantees whole-point division for all noten splits.
    return mergePlayerPointChanges(
        notenPlayerIds.map(playerId => ({
            playerId,
            pointChange: -notenPenalty / notenPlayerIds.length,
        })),
        exhaustiveDraw.tenpaiPlayerIds.map(playerId => ({
            playerId,
            pointChange: notenPenalty / exhaustiveDraw.tenpaiPlayerIds.length,
        }))
    );
}

function calculateAbortiveDrawPointChanges(rules: GameRulesValues, abortiveDraw: AbortiveDraw): PlayerPointChange[] {
    if (!isAbortiveDrawEnabled(rules)) {
        throw new AbortiveDrawNotInRulesetError();
    }

    return takeRiichiSticksFromPlayers(rules, abortiveDraw.riichiPlayerIds);
}

function calculateChomboPointChanges(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    chombo: Chombo
): PlayerPointChange[] {
    switch (getChomboHandling(rules)) {
        case 'twenty_thousand_after_uma':
            return [];
        case 'mangan':
            const manganTsumoPayments = calculateTsumoPointChanges(
                gameState,
                players,
                rules,
                {
                    type: 'TSUMO',
                    winningHandData: {
                        winnerPlayerId: chombo.offenderPlayerId,
                        yakumanCount: 0,
                        han: 5,
                    },
                    riichiPlayerIds: [],
                },
                false
            );

            return manganTsumoPayments.map(playerPointChange => ({
                playerId: playerPointChange.playerId,
                pointChange: -playerPointChange.pointChange,
            }));
    }
}

function giveBankRiichiSticksToPlayer(
    gameState: GameState,
    rules: GameRulesValues,
    playerId: number
): PlayerPointChange[] {
    return [{
        playerId,
        pointChange: gameState.riichiSticks * getRiichiDepositValue(rules),
    }];
}

function takeRiichiSticksFromPlayers(rules: GameRulesValues, riichiPlayerIds: number[]): PlayerPointChange[] {
    const deposit = getRiichiDepositValue(rules);
    return riichiPlayerIds.map(playerId => ({ playerId, pointChange: -deposit }));
}

export function mergePlayerPointChanges(...arrays: PlayerPointChange[][]): PlayerPointChange[] {
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
    const dealer = players.find(player => player.startPlace === Object.values(Wind)[gameState.dealerNumber - 1]);
    if (dealer === undefined) {
        throw new CannotDetermineDealerError();
    }

    return dealer.userId;
}

export function calculateHandBaseValue(hand: WinningHandData, rules: GameRulesValues): number {
    if (hand.yakumanCount > 0) {
        let yakumanCount = isYakumanStackingEnabled(rules) ? hand.yakumanCount : 1;
        return 8000 * yakumanCount;
    }

    if (hand.han === undefined) {
        throw new HanRequiredForNonYakumanHandError();
    }
    if (isTwoHanMinimumEnabled(rules) && hand.han === 1) {
        throw new TwoHanMinimumIsRequiredError();
    }
    if (isCountedYakumanEnabled(rules) && hand.han >= 13) {
        throw new HandShouldBeRecordedAsCountedYakumanError();
    }

    if (hand.han >= 5) {
        return limitHandBaseValue(hand.han);
    }

    if (hand.fu === undefined) {
        throw new FuRequiredForLowHanHandError();
    }

    const result = Math.min(2000, hand.fu * Math.pow(2, hand.han + 2));
    return (isManganRoundingUpEnabled(rules) && result > 1900) ? 2000 : result;
}

function limitHandBaseValue(han: number): number {
    if (han <= 5) return 2000;
    if (han <= 7) return 3000;
    if (han <= 10) return 4000;
    return 6000;
}

function updatePlayerPoints(player: GamePlayer, pointChanges: PlayerPointChange[]): GamePlayer {
    const pointChange = pointChanges
        .find(pointChange => pointChange.playerId === player.userId)
        ?.pointChange ?? 0;

    return {
        ...player,
        points: player.points + pointChange,
    };
}

export function calculateNextRoundState(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    result: GameRoundResultInputDTO
): GameState {
    switch (result.type) {
        case 'TSUMO':
            return nextRoundStateAfterWin(
                gameState,
                players,
                rules,
                [result.winningHandData.winnerPlayerId]
            );
        case 'RON':
            return nextRoundStateAfterRon(gameState, players, rules, result);
        case 'EXHAUSTIVE_DRAW':
            return nextRoundStateAfterExhaustiveDraw(gameState, players, rules, result);
        case 'ABORTIVE_DRAW':
            return nextRoundStateAfterAbortiveDraw(gameState, rules, result);
        case 'CHOMBO':
            return gameState;
    }
}

function nextRoundStateAfterRon(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    ron: Ron
): GameState {
    const headBumpPlayerId = findHeadBumpPlayerId(
        players,
        rules,
        ron.dealInPlayerId,
        ron.winningHandData.map(hand => hand.winnerPlayerId)
    );
    ron = resolveMultipleRonIfNecessary(rules, ron, headBumpPlayerId);
    return nextRoundStateAfterWin(
        gameState,
        players,
        rules,
        ron.winningHandData.map(winningHandData => winningHandData.winnerPlayerId)
    );
}

function nextRoundStateAfterWin(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    winningPlayerIds: number[]
): GameState {
    return winningPlayerIds.includes(getCurrentDealerPlayerId(gameState, players))
        ? {
            ...gameState,
            counters: gameState.counters + 1,
            riichiSticks: 0,
        }
        : nextDealer(rules, {
            ...gameState,
            counters: 0,
            riichiSticks: 0,
        });
}

function nextRoundStateAfterExhaustiveDraw(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRulesValues,
    exhaustiveDraw: ExhaustiveDraw
): GameState {
    return nextRoundStateAfterDraw(
        gameState,
        rules,
        exhaustiveDraw.riichiPlayerIds.length,
        getContinuation(rules) === 'tenpai' &&
            exhaustiveDraw.tenpaiPlayerIds.includes(getCurrentDealerPlayerId(gameState, players))
    );
}

function nextRoundStateAfterAbortiveDraw(
    gameState: GameState,
    rules: GameRulesValues,
    abortiveDraw: AbortiveDraw
): GameState {
    return nextRoundStateAfterDraw(
        gameState,
        rules,
        abortiveDraw.riichiPlayerIds.length,
        isContinuationWhenAbortionEnabled(rules)
    );
}

function nextRoundStateAfterDraw(
    gameState: GameState,
    rules: GameRulesValues,
    numberOfNewRiichiSticks: number,
    shouldKeepCurrentDealer: boolean
): GameState {
    const result = {
        ...gameState,
        counters: gameState.counters + 1,
        riichiSticks: gameState.riichiSticks + numberOfNewRiichiSticks,
    };
    return shouldKeepCurrentDealer
        ? result
        : nextDealer(rules, result);
}

function nextDealer(rules: GameRulesValues, gameState: GameState): GameState {
    const nextDealerNumber = gameState.dealerNumber + 1;
    return nextDealerNumber <= getNumberOfPlayers(rules)
        ? {
            ...gameState,
            dealerNumber: nextDealerNumber,
        }
        : {
            ...gameState,
            wind: nextWind(gameState.wind),
            dealerNumber: 1,
        };
}

export function shouldFinishGame(
    gameState: GameState,
    nextRoundState: GameState,
    players: GamePlayer[],
    rules: GameRules,
    detailedRules: GameRulesValues,
    result: GameRoundResultInputDTO
): GameFinishReason | undefined {
    if (shouldFinishGameByBankruptcy(players, detailedRules)) {
        return GameFinishReason.BANKRUPTCY;
    }

    if (shouldFinishGameByMaxPoints(players, detailedRules)) {
        return GameFinishReason.MAX_POINTS;
    }

    const nextRoundIsAllLastRepeat = isAllLastRepeat(detailedRules, gameState, nextRoundState);
    if (nextRoundState.wind === 'EAST' || (nextRoundState.wind === 'SOUTH' && !nextRoundIsAllLastRepeat)) {
        return undefined;
    }

    if (nextRoundIsAllLastRepeat) {
        return shouldFinishGameWithAgariOrTenpaiYame(nextRoundState, players, rules, detailedRules, result);
    }

    if (nextRoundState.wind === 'NORTH') {
        return GameFinishReason.REACHED_NORTH_ROUND;
    }

    // not EAST, SOUTH or NORTH, we're in WEST round
    if (!isWestRoundEnabled(detailedRules) || detailedRules.goal === undefined) {
        return GameFinishReason.PLAYED_ALL_ROUNDS;
    }

    const clearedGoal = players.some(player => player.points >= detailedRules.goal!);
    if (gameState.wind === 'SOUTH') {
        // just got into WEST, end if someone is above goal
        return clearedGoal ? GameFinishReason.PLAYED_ALL_ROUNDS : undefined;
    }

    // previous round was also WEST, only end if someone is above goal and round ended by win
    return clearedGoal && (result.type === 'TSUMO' || result.type === 'RON')
        ? GameFinishReason.GOAL_EXCEEDED_IN_WEST_ROUND
        : undefined;
}

function shouldFinishGameByBankruptcy(
    players: GamePlayer[],
    rules: GameRulesValues
): boolean {
    switch (getBankruptcyHandling(rules)) {
        case 'none':
            return false;
        case 'below_zero':
            return players.some(player => player.points < 0);
        case 'zero_or_less':
            return players.some(player => player.points <= 0);
    }
}

function shouldFinishGameByMaxPoints(
    players: GamePlayer[],
    rules: GameRulesValues
): boolean {
    const maxPoints = getMaxPoints(rules);
    if (maxPoints === undefined) {
        return false;
    }

    return players.some(player => player.points >= maxPoints);
}

function isAllLastRepeat(rules: GameRulesValues, state: GameState, nextState: GameState) {
    const numberOfPlayers = getNumberOfPlayers(rules);
    return state.wind === 'SOUTH' && state.dealerNumber === numberOfPlayers &&
        nextState.wind === 'SOUTH' && nextState.dealerNumber === numberOfPlayers;
}

function shouldFinishGameWithAgariOrTenpaiYame(
    gameState: GameState,
    players: GamePlayer[],
    rules: GameRules,
    detailedRules: GameRulesValues,
    result: GameRoundResultInputDTO
): GameFinishReason | undefined {
    if (!isAutomaticAgariTenpaiYameEnabled(detailedRules)) {
        return undefined;
    }

    const dealerId = getCurrentDealerPlayerId(gameState, players);
    const dealerPlacement = getPlayerPlacement(rules, players, dealerId);

    switch (result.type) {
        case 'EXHAUSTIVE_DRAW':
            return shouldFinishGameWithTenpaiYame(detailedRules, dealerPlacement)
                ? GameFinishReason.TENPAI_YAME
                : undefined;
        case 'TSUMO':
        case 'RON':
            return shouldFinishGameWithAgariYame(detailedRules, dealerPlacement)
                ? GameFinishReason.AGARI_YAME
                : undefined;
        default:
            return undefined;
    }
}

function getPlayerPlacement(
    rules: GameRules,
    players: GamePlayer[],
    playerId: number
): number {
    const sortedPlayers = sortPlayersByPoints(players);

    let curPlace = 1;
    for (const [index, player] of sortedPlayers.entries()) {
        if (index !== 0) {
            const prevPlayer = sortedPlayers[index - 1]!;
            if (prevPlayer.points > player.points || rules.umaTieBreak === 'WIND') {
                curPlace = index + 1;
            }
        }

        if (player.userId === playerId) {
            return curPlace;
        }
    }

    throw new CannotDeterminePlayerPlacementError();
}

function sortPlayersByPoints(players: GamePlayer[]): GamePlayer[] {
    return players.toSorted((a, b) => b.points - a.points || WIND_ORDER[a.startPlace!] - WIND_ORDER[b.startPlace!]);
}

function shouldFinishGameWithTenpaiYame(
    rules: GameRulesValues,
    dealerPlacement: number
): boolean {
    switch (getTenpaiYame(rules)) {
        case 'no':
            return false;
        case 'rank_1':
            return dealerPlacement === 1;
        case 'rank_1_2':
            return dealerPlacement <= 2;
    }
}

function shouldFinishGameWithAgariYame(
    rules: GameRulesValues,
    dealerPlacement: number
): boolean {
    switch (getAgariYame(rules)) {
        case 'no':
            return false;
        case 'rank_1':
            return dealerPlacement === 1;
        case 'rank_1_2':
            return dealerPlacement <= 2;
    }
}

export function calculateRemainingRiichiSticksPointChanges(
    players: GamePlayer[],
    gameRules: GameRules,
    riichiStickCount: number
): PlayerPointChange[] {
    if (gameRules.details === null) {
        throw new RulesetShouldContainDetailedRulesError();
    }

    return handleRemaningRiichiSticksAfterGameFinished(players, gameRules, gameRules.details.rules, riichiStickCount);
}

function handleRemaningRiichiSticksAfterGameFinished(
    players: GamePlayer[],
    gameRules: GameRules,
    detailedRules: GameRulesValues,
    riichiStickCount: number
): PlayerPointChange[] {
    if (riichiStickCount === 0 || getRemainingRiichiDeposits(detailedRules) === 'lost') {
        return [];
    }

    return splitRemainingRiichiSticksAmongWinners(players, gameRules, detailedRules, riichiStickCount);
}

function splitRemainingRiichiSticksAmongWinners(
    players: GamePlayer[],
    gameRules: GameRules,
    detailedRules: GameRulesValues,
    riichiStickCount: number
): PlayerPointChange[] {
    const winners = getPlayersTiedForFirstPlace(players, gameRules);

    const sharePerWinner = Math.floor(riichiStickCount * getRiichiDepositValue(detailedRules) / winners.length);
    if (sharePerWinner === 0) {
        return [];
    }

    return winners.map(playerId => ({ playerId, pointChange: sharePerWinner }));
}

function getPlayersTiedForFirstPlace(players: GamePlayer[], gameRules: GameRules): number[] {
    if (players.length === 0) {
        throw new NoPlayersInTheGameError();
    }

    const sortedPlayers = sortPlayersByPoints(players);

    if (gameRules.umaTieBreak === 'WIND') {
        return [sortedPlayers[0]!.userId];
    }

    const topScore = sortedPlayers[0]!.points;
    return sortedPlayers
        .filter(player => player.points === topScore)
        .map(player => player.userId);
}
