import Majiang from '@kobalab/majiang-core';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import {
    HandDetailContextConflictError,
    HandHasNoYakuError,
    HandDetailNotSupportedForSanmaError,
    InvalidHandDetailStructureError,
    NonWinningHandError,
} from '../error/PointCalculationErrors.ts';
import { getBaseTileCode, getRelativeDirectionSymbol, meldToMajiang, tileCodeToMajiang } from './notation.ts';
import type { DerivedHandScore, HandYaku, ScoreHandInput, TileCode } from './types.ts';
import { mapJapaneseYakuToCode } from './yakuCodes.ts';

function mapGameRulesToMajiangRule(rules?: GameRulesValues): Record<string, any> {
    const defaultRule = Majiang.Util.hule_param().rule;

    if (!rules) return defaultRule;

    const merged = { ...defaultRule };

    if (rules['open_tanyao'] !== undefined) {
        merged['クイタンあり'] = Boolean(rules['open_tanyao']);
    }
    if (rules['double_wind_fu'] !== undefined) {
        merged['連風牌は2符'] = rules['double_wind_fu'] === 'four_fu';
    }
    if (rules['red_fives'] !== undefined) {
        const rf = rules['red_fives'];
        if (rf === 'none') {
            merged['赤牌'] = { m: 0, p: 0, s: 0 };
        } else if (rf === 'three_one_per_suit') {
            merged['赤牌'] = { m: 1, p: 1, s: 1 };
        } else if (rf === 'two_red_fives_five_pin_and_five_sou') {
            merged['赤牌'] = { m: 0, p: 1, s: 1 };
        } else if (rf === 'three_red_fives_two_pin_and_one_sou') {
            merged['赤牌'] = { m: 0, p: 2, s: 1 };
        } else if (rf === 'four_red_fives_two_pin_and_two_sou') {
            merged['赤牌'] = { m: 0, p: 2, s: 2 };
        }
    }
    if (rules['dora'] === false) {
        merged['カンドラあり'] = false;
    } else if (rules['kan_dora'] !== undefined) {
        merged['カンドラあり'] = Boolean(rules['kan_dora']);
    }
    if (rules['ura_dora'] !== undefined) {
        merged['裏ドラあり'] = Boolean(rules['ura_dora']);
    }
    if (rules['kan_ura_dora'] !== undefined) {
        merged['カン裏あり'] = Boolean(rules['kan_ura_dora']);
    }
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

    if (rules?.['number_of_players'] === 3) {
        throw new HandDetailNotSupportedForSanmaError();
    }

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
    }
}

export function scoreHand(input: ScoreHandInput): DerivedHandScore {
    const { handDetail, winType, winnerSeat, dealerSeat, roundWindSeat, dealInSeat, riichiPlayerSeats, rules } = input;

    validateHandStructure(input);

    const isWinnerInRiichi = Boolean(riichiPlayerSeats?.has(winnerSeat));

    // Convert hand detail into Majiang Shoupai string
    const concealedMajiang = handDetail.concealedTiles.map(tileCodeToMajiang);
    let paistr = '';
    if (winType === 'TSUMO') {
        paistr = [...concealedMajiang, tileCodeToMajiang(handDetail.winningTile)].join('');
    } else {
        paistr = concealedMajiang.join('');
    }

    if (handDetail.melds.length > 0) {
        const meldStrings = handDetail.melds.map(meldToMajiang);
        paistr += ',' + meldStrings.join(',');
    }

    let shoupai: any;
    try {
        shoupai = Majiang.Shoupai.fromString(paistr);
    } catch {
        throw new NonWinningHandError();
    }

    let rongpai: string | null = null;
    if (winType === 'RON') {
        if (dealInSeat === undefined) {
            throw new InvalidHandDetailStructureError();
        }
        const relDir = getRelativeDirectionSymbol(winnerSeat, dealInSeat);
        rongpai = tileCodeToMajiang(handDetail.winningTile) + relDir;
    }

    const menfeng = (winnerSeat - dealerSeat + 4) % 4; // 0: Ton, 1: Nan, 2: Shaa, 3: Pei
    const zhuangfeng = roundWindSeat;

    const ctx = handDetail.context;
    let lizhiVal = 0;
    if (isWinnerInRiichi) {
        lizhiVal = ctx?.doubleRiichi ? 2 : 1;
    }

    let haidiVal = 0;
    if (ctx?.haitei) haidiVal = 1;
    if (ctx?.houtei) haidiVal = 2;

    let tianhuVal = 0;
    if (ctx?.tenhou) tianhuVal = 1;
    if (ctx?.chiihou) tianhuVal = 2;

    const majiangRule = mapGameRulesToMajiangRule(rules);

    const doraIndicatorsMajiang = handDetail.doraIndicators.map(tileCodeToMajiang);
    const uraDoraIndicatorsMajiang = isWinnerInRiichi && rules?.['ura_dora'] !== false
        ? handDetail.uraDoraIndicators.map(tileCodeToMajiang)
        : null;

    const param = Majiang.Util.hule_param({
        rule: majiangRule,
        zhuangfeng,
        menfeng,
        lizhi: lizhiVal,
        yifa: Boolean(ctx?.ippatsu),
        qianggang: Boolean(ctx?.chankan),
        lingshang: Boolean(ctx?.rinshanKaihou),
        haidi: haidiVal,
        tianhu: tianhuVal,
        baopai: doraIndicatorsMajiang,
        fubaopai: uraDoraIndicatorsMajiang,
    });

    let res: any;
    try {
        res = Majiang.Util.hule(shoupai, rongpai, param);
    } catch {
        throw new NonWinningHandError();
    }

    if (!res) {
        throw new NonWinningHandError();
    }

    if (res.defen === 0 || !res.hupai || res.hupai.length === 0) {
        throw new HandHasNoYakuError();
    }

    const yaku: HandYaku[] = [];
    let paoSeat: number | undefined;

    const isOrdinaryYakuman = res.damanguan !== undefined && res.damanguan > 0;

    for (const h of res.hupai) {
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
                paoSeat = (winnerSeat + offset) % 4;
            }
        }
    }

    if (isOrdinaryYakuman) {
        return {
            yakumanCount: res.damanguan,
            yaku,
            ...(paoSeat !== undefined ? { paoSeat } : {}),
        };
    }

    const isCountedYakuman = res.fanshu >= 13 && rules?.['counted_yakuman'] !== false;

    return {
        han: res.fanshu,
        fu: res.fu,
        yakumanCount: isCountedYakuman ? 1 : 0,
        yaku,
        ...(paoSeat !== undefined ? { paoSeat } : {}),
    };
}
