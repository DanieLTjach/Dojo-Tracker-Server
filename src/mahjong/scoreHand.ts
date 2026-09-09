import Majiang from 'majiang-core';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import {
    HandDetailContextConflictError,
    HandHasNoYakuError,
    InvalidHandDetailStructureError,
    LocalYakuNotInRulesetError,
    NonWinningHandError,
    UnsupportedLocalYakuError,
    UnsupportedScoringContextError,
} from '../error/PointCalculationErrors.ts';
import { declaredLocalYakuIds, hasLocalYaku, LOCAL_YAKU_REGISTRY } from './localYaku.ts';
import { getBaseTileCode, getRelativeDirectionSymbol, meldToMajiang, tileCodeToMajiang } from './notation.ts';
import type { DerivedHandScore, HandYaku, ScoreHandInput, TileCode } from './types.ts';
import { mapJapaneseYakuToCode } from './yakuCodes.ts';

/*
 * Disposition of gameRulesCatalog keys relative to scoreHand engine:
 *
 * | Key | Disposition |
 * |---|---|
 * | blessing_of_man | Implemented directly in scoreHand (renhou) |
 * | two_han_minimum | Enforced in PointCalculationUtil.ts |
 * | shape_tenpai, nagashi_mangan | Draw/tenpai concerns, handled in game round flow / RulesUtils.ts |
 * | kan_dora_called_promoted_quad, kan_dora_concealed_quad | Timing rules; client supplies final indicator arrays |
 * | north_as_yaku, can_call_kita, kita_after_pon, rinshan_from_kita, ron_on_kita, furiten_from_kita | Sanma-specific rules (Phase 4) |
 * | customRules | Local yaku registry evaluated directly in scoreHand |
 */

function mapGameRulesToMajiangRule(rules?: GameRulesValues): Record<string, any> {
    const defaultRule = Majiang.Util.hule_param().rule;

    if (!rules) return defaultRule;

    const merged = { ...defaultRule };

    if (rules['number_of_players'] === 3) {
        merged['三人打ち'] = true;
        merged['人数'] = 3;
    }
    if (rules['open_tanyao'] !== undefined) {
        merged['クイタンあり'] = Boolean(rules['open_tanyao']);
    }
    if (rules['double_wind_fu'] !== undefined) {
        merged['連風牌は2符'] = rules['double_wind_fu'] === 'two_fu';
    }
    // Note: Majiang.Util.hule() only consumes live rule flags:
    // '三人打ち', '人数', 'クイタンあり', '連風牌は2符', '数え役満あり', 'ダブル役満あり', '役満の複合あり', '役満パオあり', '切り上げ満貫あり'.
    // Other rules (red_fives, dora, kan_dora, ura_dora, kan_ura_dora) are ignored by hule() boundary and are instead
    // enforced structurally in scoreHand.ts:
    // - Red five limits: validateHandStructure() (lines 119-140)
    // - Dora/Ura-dora indicators: passed dynamically at callsites (lines 307-311)
    if (rules['counted_yakuman'] !== undefined) {
        merged['数え役満あり'] = Boolean(rules['counted_yakuman']);
    }
    if (rules['double_yakuman'] !== undefined) {
        merged['ダブル役満あり'] = Boolean(rules['double_yakuman']);
    }
    if (rules['yakuman_stacking'] !== undefined) {
        merged['役満の複合あり'] = Boolean(rules['yakuman_stacking']);
    }
    if (rules['liability_payment'] !== undefined) {
        merged['役満パオあり'] = rules['liability_payment'] === 'big_dragons_big_winds';
    }
    if (rules['mangan_rounding_up'] !== undefined) {
        merged['切り上げ満貫あり'] = Boolean(rules['mangan_rounding_up']);
    }

    return merged;
}

function validateHandStructure(input: ScoreHandInput): void {
    const { handDetail, rules, winType, winnerSeat, dealerSeat, riichiPlayerSeats } = input;

    const isSanma = rules?.['number_of_players'] === 3;

    // 1. Concealed tiles count: 13 - 3 * melds.length
    const expectedConcealedCount = 13 - 3 * handDetail.melds.length;
    if (handDetail.concealedTiles.length !== expectedConcealedCount) {
        throw new InvalidHandDetailStructureError();
    }

    // 2. Physical tile counts across hand and indicators (max 4 copies of base tile)
    const baseTileCounts = new Map<TileCode, number>();
    const allTiles: TileCode[] = [
        ...handDetail.concealedTiles,
        handDetail.winningTile,
        ...handDetail.melds.flatMap(m => m.tiles),
        ...handDetail.doraIndicators,
        ...handDetail.uraDoraIndicators,
    ];

    if (isSanma) {
        const forbiddenSanmaTiles = ['man_2', 'man_3', 'man_4', 'man_5', 'aka_man_5', 'man_6', 'man_7', 'man_8'];
        for (const tile of allTiles) {
            if (forbiddenSanmaTiles.includes(tile)) {
                throw new InvalidHandDetailStructureError();
            }
        }
        if (handDetail.melds.some(m => m.type === 'CHII')) {
            throw new InvalidHandDetailStructureError();
        }
    }

    for (const tile of allTiles) {
        const base = getBaseTileCode(tile);
        const current = baseTileCounts.get(base) ?? 0;
        if (current >= 4) {
            throw new InvalidHandDetailStructureError();
        }
        baseTileCounts.set(base, current + 1);
    }

    // Aka tile limit against ruleset
    const handAkaTiles = [
        ...handDetail.concealedTiles,
        handDetail.winningTile,
        ...handDetail.melds.flatMap(m => m.tiles),
    ];
    let handAkaMan = 0;
    let handAkaPin = 0;
    let handAkaSou = 0;
    for (const tile of handAkaTiles) {
        if (tile === 'aka_man_5') handAkaMan++;
        if (tile === 'aka_pin_5') handAkaPin++;
        if (tile === 'aka_sou_5') handAkaSou++;
    }

    const redFivesRule = rules?.['red_fives'] ?? 'three_one_per_suit';
    if (redFivesRule === 'none' && (handAkaMan > 0 || handAkaPin > 0 || handAkaSou > 0)) {
        throw new InvalidHandDetailStructureError();
    }
    if (redFivesRule === 'three_one_per_suit' && (handAkaMan > 1 || handAkaPin > 1 || handAkaSou > 1)) {
        throw new InvalidHandDetailStructureError();
    }
    if (redFivesRule === 'two_red_fives_five_pin_and_five_sou') {
        if (handAkaMan > 0 || handAkaPin > 1 || handAkaSou > 1) {
            throw new InvalidHandDetailStructureError();
        }
    }
    if (redFivesRule === 'three_red_fives_two_pin_and_one_sou') {
        if (handAkaMan > 0 || handAkaPin > 2 || handAkaSou > 1) {
            throw new InvalidHandDetailStructureError();
        }
    }
    if (redFivesRule === 'four_red_fives_two_pin_and_two_sou') {
        if (handAkaMan > 0 || handAkaPin > 2 || handAkaSou > 2) {
            throw new InvalidHandDetailStructureError();
        }
    }

    // 3. Meld structural integrity
    for (const meld of handDetail.melds) {
        if (meld.type === 'CHII') {
            if (meld.calledFrom !== 'KAMICHA') {
                throw new InvalidHandDetailStructureError();
            }
            const s0 = getBaseTileCode(meld.tiles[0]);
            const s1 = getBaseTileCode(meld.tiles[1]);
            const s2 = getBaseTileCode(meld.tiles[2]);
            if (!s0.startsWith('man_') && !s0.startsWith('pin_') && !s0.startsWith('sou_')) {
                throw new InvalidHandDetailStructureError();
            }
            const suit = s0.split('_')[0] as string;
            if (!s1.startsWith(`${suit}_`) || !s2.startsWith(`${suit}_`)) {
                throw new InvalidHandDetailStructureError();
            }
            const nums = [
                parseInt(s0.split('_')[1]!, 10),
                parseInt(s1.split('_')[1]!, 10),
                parseInt(s2.split('_')[1]!, 10),
            ];
            if (nums[0]! + 1 !== nums[1]! || nums[1]! + 1 !== nums[2]!) {
                throw new InvalidHandDetailStructureError();
            }
        } else if (meld.type === 'PON') {
            const b0 = getBaseTileCode(meld.tiles[0]);
            const b1 = getBaseTileCode(meld.tiles[1]);
            const b2 = getBaseTileCode(meld.tiles[2]);
            if (b0 !== b1 || b1 !== b2) {
                throw new InvalidHandDetailStructureError();
            }
        } else if (meld.type === 'DAIMINKAN' || meld.type === 'KAKAN' || meld.type === 'ANKAN') {
            const b0 = getBaseTileCode(meld.tiles[0]);
            const b1 = getBaseTileCode(meld.tiles[1]);
            const b2 = getBaseTileCode(meld.tiles[2]);
            const b3 = getBaseTileCode(meld.tiles[3]);
            if (b0 !== b1 || b1 !== b2 || b2 !== b3) {
                throw new InvalidHandDetailStructureError();
            }
        }
    }

    // 4. Riichi and indicator checks
    const winnerInRiichi = Boolean(riichiPlayerSeats?.has(winnerSeat));
    if (winnerInRiichi && rules?.['ura_dora'] !== false) {
        if (handDetail.uraDoraIndicators.length !== handDetail.doraIndicators.length) {
            throw new InvalidHandDetailStructureError();
        }
    } else {
        if (handDetail.uraDoraIndicators.length > 0) {
            throw new InvalidHandDetailStructureError();
        }
    }

    // 5. Context flag validation
    const ctx = handDetail.context;
    const hasOpenMeld = handDetail.melds.some(meld => meld.type !== 'ANKAN');
    if (winnerInRiichi && hasOpenMeld) {
        throw new HandDetailContextConflictError();
    }

    if (ctx) {
        if (winType === 'RON') {
            if (ctx.haitei || ctx.rinshanKaihou || ctx.tenhou || ctx.chiihou) {
                throw new HandDetailContextConflictError();
            }
        } else if (winType === 'TSUMO') {
            if (ctx.houtei || ctx.chankan) {
                throw new HandDetailContextConflictError();
            }
        }

        const isDealer = winnerSeat === dealerSeat;
        if (isDealer && ctx.chiihou) {
            throw new HandDetailContextConflictError();
        }
        if (!isDealer && ctx.tenhou) {
            throw new HandDetailContextConflictError();
        }

        if ((ctx.doubleRiichi || ctx.ippatsu) && !winnerInRiichi) {
            throw new HandDetailContextConflictError();
        }

        if (ctx.haitei && ctx.rinshanKaihou || ctx.houtei && ctx.chankan) {
            throw new HandDetailContextConflictError();
        }

        if (ctx.ippatsu && (ctx.rinshanKaihou || ctx.chankan)) {
            throw new HandDetailContextConflictError();
        }

        if (
            ctx.rinshanKaihou &&
            !handDetail.melds.some(meld => meld.type === 'DAIMINKAN' || meld.type === 'KAKAN' || meld.type === 'ANKAN')
        ) {
            throw new HandDetailContextConflictError();
        }

        if (ctx.renhou) {
            const isDealer = winnerSeat === dealerSeat;
            if (winType !== 'RON' || isDealer || handDetail.melds.length > 0) {
                throw new HandDetailContextConflictError();
            }
            const hasOtherSpecialContext = winnerInRiichi || ctx.doubleRiichi || ctx.ippatsu || ctx.haitei ||
                ctx.houtei || ctx.rinshanKaihou || ctx.chankan || ctx.tenhou || ctx.chiihou ||
                hasLocalYaku(ctx);
            if (hasOtherSpecialContext) {
                throw new HandDetailContextConflictError();
            }
        }

        if (ctx.tenhou || ctx.chiihou) {
            const hasOtherSpecialContext = winnerInRiichi || ctx.doubleRiichi || ctx.ippatsu || ctx.haitei ||
                ctx.houtei || ctx.rinshanKaihou || ctx.chankan || ctx.renhou ||
                hasLocalYaku(ctx);
            if (handDetail.melds.length > 0 || hasOtherSpecialContext) {
                throw new HandDetailContextConflictError();
            }
        }

        if (hasLocalYaku(ctx)) {
            const declaredIds = declaredLocalYakuIds(input.customRules);
            for (const id of ctx.localYaku) {
                const spec = LOCAL_YAKU_REGISTRY.get(id);
                if (!spec) {
                    throw new UnsupportedLocalYakuError(id);
                }
                if (!declaredIds.has(id)) {
                    throw new LocalYakuNotInRulesetError(id);
                }
                if (!spec.isApplicable(input)) {
                    throw new HandDetailContextConflictError();
                }
                if (spec.conflictingContextFlags) {
                    for (const flag of spec.conflictingContextFlags) {
                        if (Boolean(ctx[flag])) {
                            throw new HandDetailContextConflictError();
                        }
                    }
                }
            }
        }
    }
}

export function scoreHand(input: ScoreHandInput): DerivedHandScore {
    const { handDetail, winType, winnerSeat, dealerSeat, roundWindSeat, dealInSeat, riichiPlayerSeats, rules } = input;

    validateHandStructure(input);

    const numPlayers = rules?.['number_of_players'] === 3 ? 3 : 4;
    const isWinnerInRiichi = Boolean(riichiPlayerSeats?.has(winnerSeat));

    // Convert hand detail into Majiang Shoupai notation string
    const concealedMajiang = handDetail.concealedTiles.map(tileCodeToMajiang);
    let handNotation = '';
    if (winType === 'TSUMO') {
        handNotation = [...concealedMajiang, tileCodeToMajiang(handDetail.winningTile)].join('');
    } else {
        handNotation = concealedMajiang.join('');
    }

    if (handDetail.melds.length > 0) {
        const meldStrings = handDetail.melds.map(meldToMajiang);
        handNotation += ',' + meldStrings.join(',');
    }

    let hand: any;
    try {
        hand = Majiang.Shoupai.fromString(handNotation);
    } catch {
        throw new NonWinningHandError();
    }

    let ronTile: string | null = null;
    if (winType === 'RON') {
        if (dealInSeat === undefined) {
            throw new InvalidHandDetailStructureError();
        }
        const relDir = getRelativeDirectionSymbol(winnerSeat, dealInSeat, numPlayers);
        ronTile = tileCodeToMajiang(handDetail.winningTile) + relDir;
    }

    const seatWind = (winnerSeat - dealerSeat + numPlayers) % numPlayers; // 0: Ton, 1: Nan, 2: Shaa, (3: Pei)
    const roundWind = roundWindSeat;

    const ctx = handDetail.context;
    let riichiVal = 0;
    if (isWinnerInRiichi) {
        riichiVal = ctx?.doubleRiichi ? 2 : 1;
    }

    let haiteiVal = 0;
    if (ctx?.haitei) haiteiVal = 1;
    if (ctx?.houtei) haiteiVal = 2;

    let tenhouVal = 0;
    if (ctx?.tenhou) tenhouVal = 1;
    if (ctx?.chiihou) tenhouVal = 2;

    const majiangRule = mapGameRulesToMajiangRule(rules);

    const doraEnabled = rules?.['dora'] !== false;
    const doraIndicatorsMajiang = doraEnabled ? handDetail.doraIndicators.map(tileCodeToMajiang) : [];
    const uraDoraIndicatorsMajiang = doraEnabled && isWinnerInRiichi && rules?.['ura_dora'] !== false
        ? handDetail.uraDoraIndicators.map(tileCodeToMajiang)
        : null;

    const param = Majiang.Util.hule_param({
        rule: majiangRule,
        zhuangfeng: roundWind,
        menfeng: seatWind,
        lizhi: riichiVal,
        yifa: Boolean(ctx?.ippatsu),
        qianggang: Boolean(ctx?.chankan),
        lingshang: Boolean(ctx?.rinshanKaihou),
        haidi: haiteiVal,
        tianhu: tenhouVal,
        baopai: doraIndicatorsMajiang,
        fubaopai: uraDoraIndicatorsMajiang,
        kita: handDetail.kitaCount ?? 0,
    });

    let res: any;
    try {
        res = Majiang.Util.hule(hand, ronTile, param);
    } catch {
        throw new NonWinningHandError();
    }

    if (!res) {
        throw new NonWinningHandError();
    }

    // Renhou is not implemented by the engine, so it is applied here. Under
    // 'yakuman' it replaces the hand value outright; under 'mangan' it is a
    // 5-han yaku that stacks with the hand's other yaku and dora, so the hand
    // can exceed mangan. 'none' (and unset) means renhou scores nothing extra
    // and the hand must stand on its own yaku.
    const blessingOfMan = ctx?.renhou ? (rules?.['blessing_of_man'] ?? 'none') : 'none';

    if (ctx?.renhou && blessingOfMan === 'yakuman') {
        return {
            yakumanCount: 1,
            yaku: [{ code: 'renhou', yakumanCount: 1 }],
        };
    }

    const renhouHan = ctx?.renhou && blessingOfMan === 'mangan' ? 5 : 0;

    let localYakuHan = 0;
    let localYakumanCount = 0;
    const localYakus: HandYaku[] = [];

    if (hasLocalYaku(ctx)) {
        for (const id of ctx.localYaku) {
            const spec = LOCAL_YAKU_REGISTRY.get(id);
            if (!spec) continue;
            if (spec.yakumanCount !== undefined && spec.yakumanCount > 0) {
                localYakumanCount += spec.yakumanCount;
                localYakus.push({ code: spec.code, yakumanCount: spec.yakumanCount });
            } else if (spec.han !== undefined && spec.han > 0) {
                localYakuHan += spec.han;
                localYakus.push({ code: spec.code, han: spec.han });
            }
        }
    }

    // A renhou or local yaku hand may legitimately have no other yaku; the local
    // yaku itself is the yaku in that case. Without them the usual yaku-nashi rule applies.
    if (
        !renhouHan && !localYakuHan && !localYakumanCount && (res.defen === 0 || !res.hupai || res.hupai.length === 0)
    ) {
        throw new HandHasNoYakuError();
    }

    const isOrdinaryYakuman = res.damanguan !== undefined && res.damanguan > 0;

    if (localYakumanCount > 0 && !isOrdinaryYakuman) {
        return {
            yakumanCount: localYakumanCount,
            yaku: localYakus.filter(y => 'yakumanCount' in y),
        };
    }

    const yaku: HandYaku[] = [];
    let paoSeat: number | undefined;
    let paoYakumanCount = 0;

    if (renhouHan && !isOrdinaryYakuman) {
        yaku.push({ code: 'renhou', han: renhouHan });
    }

    if (localYakuHan > 0 && !isOrdinaryYakuman) {
        for (const ly of localYakus) {
            if ('han' in ly) {
                yaku.push(ly);
            }
        }
    }

    for (const h of res.hupai ?? []) {
        const code = mapJapaneseYakuToCode(h.name);
        if (isOrdinaryYakuman) {
            const count = h.fanshu === '**' ? 2 : 1;
            yaku.push({ code, yakumanCount: count });
        } else {
            yaku.push({ code, han: h.fanshu });
        }

        if (h.baojia) {
            let offset = 0;
            if (h.baojia === '+') offset = 1;
            else if (h.baojia === '=') offset = 2;
            else if (h.baojia === '-') offset = 3;

            if (offset > 0) {
                const yakuPaoSeat = (winnerSeat + offset) % numPlayers;
                if (paoSeat !== undefined && paoSeat !== yakuPaoSeat) {
                    throw new UnsupportedScoringContextError();
                }
                paoSeat = yakuPaoSeat;
                paoYakumanCount += h.fanshu === '**' ? 2 : 1;
            }
        }
    }

    if (isOrdinaryYakuman) {
        // The legacy point model has one liability player for the entire hand. It
        // cannot represent a stacked hand where pao applies to only some yakuman,
        // nor different liability players for different yakuman. Reject those rare
        // shapes instead of silently charging the wrong amount.
        if (paoSeat !== undefined && Math.min(paoYakumanCount, res.damanguan) !== res.damanguan) {
            throw new UnsupportedScoringContextError();
        }
        return {
            yakumanCount: res.damanguan,
            yaku,
            ...(paoSeat !== undefined ? { paoSeat } : {}),
        };
    }

    const totalHan = (res.fanshu ?? 0) + renhouHan + localYakuHan;
    const isCountedYakuman = totalHan >= 13 && rules?.['counted_yakuman'] !== false;

    return {
        han: totalHan,
        fu: res.fu ?? 30,
        yakumanCount: isCountedYakuman ? 1 : 0,
        yaku,
        ...(paoSeat !== undefined ? { paoSeat } : {}),
    };
}
