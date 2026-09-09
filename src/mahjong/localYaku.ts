import type { HandContext, ScoreHandInput, YakuCode } from './types.ts';

export interface LocalYakuSpec {
    // The ruleset preset id (`CustomRuleEntry.presetId`), i.e. user-supplied data.
    id: string;
    // The scoring vocabulary emitted in the result's `yaku` array. Every id happens to
    // match its code today, but the two are separate vocabularies: typing this as
    // YakuCode is what makes the compiler reject an output code that does not exist.
    code: YakuCode;
    han?: number | undefined;
    yakumanCount?: number | undefined;
    // Hand-shape yaku are operator-asserted because majiang-core does not evaluate non-standard patterns.
    // Event/round-condition yaku (e.g. tsubame_gaeshi) verify verifiable round facts from ScoreHandInput.
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

// Han and yakuman values are fixed constants taken from
// notes/Local yaku - Japanese Mahjong Wiki.pdf. A ruleset enables or disables a yaku;
// it never restates its value, so a typo in ruleset data cannot mint a yakuman.
// renhou is deliberately absent: it predates this registry and keeps its own
// `blessing_of_man` catalog key and scoring branch in scoreHand.ts.
const LOCAL_YAKU_SPECS: readonly LocalYakuSpec[] = [
    {
        id: 'tsubame_gaeshi',
        code: 'tsubame_gaeshi',
        han: 1,
        isApplicable: (input: ScoreHandInput) =>
            input.winType === 'RON' &&
            input.dealInSeat !== undefined &&
            input.dealInSeat !== input.winnerSeat &&
            Boolean(input.riichiPlayerSeats?.has(input.dealInSeat)),
        // Conflicts with other situational winning declarations/conditions.
        // Deliberately not conflicting: ippatsu, houtei, winner's riichi, open melds.
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
    { id: 'suuankou_tanki_double', code: 'suuankou_tanki_double', yakumanCount: 2, isApplicable: () => true },
];

export const LOCAL_YAKU_REGISTRY: ReadonlyMap<string, LocalYakuSpec> = new Map(
    LOCAL_YAKU_SPECS.map(spec => [spec.id, spec])
);
