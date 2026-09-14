import type { HandContext, ScoreHandInput, YakuCode } from './types.ts';

export interface LocalYakuSpec {
    id: string;
    code: YakuCode;
    han?: number | undefined;
    yakumanCount?: number | undefined;
    // `() => true` means operator-asserted: majiang-core cannot evaluate the hand shape.
    isApplicable: (input: ScoreHandInput) => boolean;
    conflictingContextFlags?: readonly (keyof HandContext)[] | undefined;
}

export interface CustomRuleLike {
    category: string;
    value: boolean | number | string;
    name?: string | undefined;
    presetId?: string | undefined;
}

export function isLocalYakuEnabled(entry: CustomRuleLike): boolean {
    return entry.value !== false && entry.value !== 0;
}

// A type predicate rather than a plain boolean so callers keep narrowing on ctx.localYaku.
export function hasLocalYaku<T extends Pick<HandContext, 'localYaku'>>(
    ctx?: T | null | undefined
): ctx is T & { localYaku: string[] } {
    return Boolean(ctx?.localYaku && ctx.localYaku.length > 0);
}

export function declaredLocalYakuIds(customRules?: readonly CustomRuleLike[] | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (!customRules) return ids;

    for (const rule of customRules) {
        if (rule.category === 'yaku' && rule.presetId && isLocalYakuEnabled(rule)) {
            ids.add(rule.presetId);
        }
    }
    return ids;
}

// renhou is absent by design: blessing_of_man is a per-ruleset enum, not a fixed value.
const LOCAL_YAKU_SPECS: readonly LocalYakuSpec[] = [
    {
        id: 'tsubame_gaeshi',
        code: 'tsubame_gaeshi',
        han: 1,
        // The discarder's riichi is deliberately unchecked: a riichi ronned on its
        // declaration tile is never completed, so the discarder is absent from
        // riichiPlayerSeats (the seats actually charged the deposit). Requiring it
        // would only accept rounds that were recorded wrongly.
        isApplicable: (input: ScoreHandInput) =>
            input.winType === 'RON' &&
            input.dealInSeat !== undefined &&
            input.dealInSeat !== input.winnerSeat,
        // Not conflicting, deliberately: ippatsu, houtei, winner's riichi, open melds.
        conflictingContextFlags: ['chankan', 'haitei', 'rinshanKaihou', 'tenhou', 'chiihou', 'renhou'],
    },
    { id: 'oopun_riichi', code: 'oopun_riichi', han: 2, isApplicable: () => true },
    { id: 'sanrenkou', code: 'sanrenkou', han: 2, isApplicable: () => true },
    { id: 'iishoku_sanjun', code: 'iishoku_sanjun', han: 2, isApplicable: () => true },
    { id: 'reversible_tiles', code: 'reversible_tiles', han: 1, isApplicable: () => true },
    { id: 'uumensai', code: 'uumensai', han: 2, isApplicable: () => true },
    { id: 'shousharin', code: 'shousharin', yakumanCount: 1, isApplicable: () => true },
    { id: 'suurenkou', code: 'suurenkou', yakumanCount: 1, isApplicable: () => true },
    { id: 'iishoku_yonjun', code: 'iishoku_yonjun', yakumanCount: 1, isApplicable: () => true },
    { id: 'paarenchan', code: 'paarenchan', yakumanCount: 1, isApplicable: () => true },
    { id: 'shiisan_puutaa', code: 'shiisan_puutaa', yakumanCount: 1, isApplicable: () => true },
    { id: 'shiisuu_puutaa', code: 'shiisuu_puutaa', yakumanCount: 1, isApplicable: () => true },
    { id: 'daichisei', code: 'daichisei', yakumanCount: 1, isApplicable: () => true },
    { id: 'daisharin', code: 'daisharin', yakumanCount: 1, isApplicable: () => true },
    { id: 'daichikurin', code: 'daichikurin', yakumanCount: 1, isApplicable: () => true },
    { id: 'daisuurin', code: 'daisuurin', yakumanCount: 1, isApplicable: () => true },
    { id: 'beni_kujaku', code: 'beni_kujaku', yakumanCount: 1, isApplicable: () => true },
];

export const LOCAL_YAKU_REGISTRY: ReadonlyMap<string, LocalYakuSpec> = new Map(
    LOCAL_YAKU_SPECS.map(spec => [spec.id, spec])
);
