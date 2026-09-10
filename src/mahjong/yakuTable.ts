import type { YakuCode } from './types.ts';

/**
 * Han values for standard yaku, so a hand can be priced from a yaku list alone —
 * no tiles, and therefore no `majiang-core`.
 *
 * Values are transcribed from `majiang-core/lib/hule.js`, which stays the
 * authority: `tests/yakuTable.test.ts` scores representative hands both ways and
 * asserts the totals agree, so a dependency bump that changes a value fails there
 * rather than silently mispricing hands.
 *
 * Local yaku are deliberately absent — LOCAL_YAKU_REGISTRY already prices its 17,
 * and duplicating them here would create two sources of truth for one value.
 */
export type StandardYakuSpec =
    // Fixed han regardless of open/closed.
    | { han: number, closedOnly?: boolean }
    // Han drops by one (or two) when the hand is open.
    | { hanClosed: number, hanOpen: number }
    // Yakuman: han, fu and dora stop mattering.
    | { yakumanCount: number, closedOnly?: boolean }
    // Han equals the operator-supplied count (dora and friends).
    | { counted: true };

export const STANDARD_YAKU_SPECS: Readonly<Partial<Record<YakuCode, StandardYakuSpec>>> = {
    riichi: { han: 1, closedOnly: true },
    double_riichi: { han: 2, closedOnly: true },
    ippatsu: { han: 1, closedOnly: true },
    menzen_tsumo: { han: 1, closedOnly: true },
    chankan: { han: 1 },
    rinshan_kaihou: { han: 1 },
    haitei: { han: 1 },
    houtei: { han: 1 },
    haku: { han: 1 },
    hatsu: { han: 1 },
    chun: { han: 1 },
    tanyao: { han: 1 },
    pinfu: { han: 1, closedOnly: true },
    iipeikou: { han: 1, closedOnly: true },
    sanshoku_doujun: { hanClosed: 2, hanOpen: 1 },
    ittsuu: { hanClosed: 2, hanOpen: 1 },
    chanta: { hanClosed: 2, hanOpen: 1 },
    chiitoitsu: { han: 2, closedOnly: true },
    toitoi: { han: 2 },
    sanankou: { han: 2 },
    sanshoku_doukou: { han: 2 },
    sankantsu: { han: 2 },
    shousangen: { han: 2 },
    honroutou: { han: 2 },
    junchan: { hanClosed: 3, hanOpen: 2 },
    ryanpeikou: { han: 3, closedOnly: true },
    honitsu: { hanClosed: 3, hanOpen: 2 },
    chinitsu: { hanClosed: 6, hanOpen: 5 },
    tenhou: { yakumanCount: 1 },
    chiihou: { yakumanCount: 1 },
    daisangen: { yakumanCount: 1 },
    suuankou: { yakumanCount: 1 },
    suuankou_tanki: { yakumanCount: 2 },
    tsuisou: { yakumanCount: 1 },
    ryuisou: { yakumanCount: 1 },
    chinroutou: { yakumanCount: 1 },
    chuuren_poutou: { yakumanCount: 1 },
    junsei_chuuren_poutou: { yakumanCount: 2 },
    kokushi_musou: { yakumanCount: 1 },
    kokushi_musou_13: { yakumanCount: 2 },
    daisuushi: { yakumanCount: 2 },
    shousuushi: { yakumanCount: 1 },
    suukantsu: { yakumanCount: 1 },

    // Seat and round winds: one han each, and which of the eight applies is a
    // fact about the seat, not something the operator's selection has to justify.
    bakaze_ton: { han: 1 },
    bakaze_nan: { han: 1 },
    bakaze_shaa: { han: 1 },
    bakaze_pei: { han: 1 },
    jikaze_ton: { han: 1 },
    jikaze_nan: { han: 1 },
    jikaze_shaa: { han: 1 },
    jikaze_pei: { han: 1 },

    // Han equals the count the operator entered.
    dora: { counted: true },
    aka_dora: { counted: true },
    ura_dora: { counted: true },
    kita: { counted: true },
};

// renhou is priced by the ruleset's `blessing_of_man` enum (mangan/baiman/yakuman),
// not by a fixed han, so it is excluded here exactly as it is from LOCAL_YAKU_REGISTRY.
export const YAKU_CODES_PRICED_ELSEWHERE: readonly YakuCode[] = ['renhou'];

export const COUNTED_YAKU_CODES: readonly YakuCode[] = ['dora', 'aka_dora', 'ura_dora', 'kita'];

export function isCountedYakuCode(code: YakuCode): boolean {
    return COUNTED_YAKU_CODES.includes(code);
}

export function isClosedOnlyYaku(code: YakuCode): boolean {
    const spec = STANDARD_YAKU_SPECS[code];
    return Boolean(spec && 'closedOnly' in spec && spec.closedOnly);
}

export function isYakumanYakuCode(code: YakuCode): boolean {
    const spec = STANDARD_YAKU_SPECS[code];
    return Boolean(spec && 'yakumanCount' in spec);
}

/**
 * Han for one standard yaku. Returns undefined for yakuman-valued codes (the
 * caller handles those separately) and for codes this table does not price.
 * `count` supplies the han for counted codes such as dora.
 */
export function standardYakuHan(
    code: YakuCode,
    { isOpen = false, count = 0 }: { isOpen?: boolean, count?: number } = {}
): number | undefined {
    const spec = STANDARD_YAKU_SPECS[code];
    if (!spec) return undefined;
    if ('counted' in spec) return count > 0 ? count : undefined;
    if ('yakumanCount' in spec) return undefined;
    if ('hanClosed' in spec) return isOpen ? spec.hanOpen : spec.hanClosed;
    return spec.han;
}

export function standardYakumanCount(code: YakuCode): number | undefined {
    const spec = STANDARD_YAKU_SPECS[code];
    return spec && 'yakumanCount' in spec ? spec.yakumanCount : undefined;
}
