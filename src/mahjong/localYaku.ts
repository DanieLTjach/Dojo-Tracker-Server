import type { HandContext, ScoreHandInput, YakuCode } from './types.ts';

export interface LocalYakuSpec {
    id: string;
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

export const LOCAL_YAKU_REGISTRY: ReadonlyMap<string, LocalYakuSpec> = new Map<string, LocalYakuSpec>([
    [
        'tsubame_gaeshi',
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
    ],
    [
        'oopun_riichi',
        {
            id: 'oopun_riichi',
            code: 'oopun_riichi',
            han: 2,
            isApplicable: () => true,
        },
    ],
    [
        'sanrenkou',
        {
            id: 'sanrenkou',
            code: 'sanrenkou',
            han: 2,
            isApplicable: () => true,
        },
    ],
    [
        'iishoku_sanjun',
        {
            id: 'iishoku_sanjun',
            code: 'iishoku_sanjun',
            han: 2,
            isApplicable: () => true,
        },
    ],
    [
        'reversible_tiles',
        {
            id: 'reversible_tiles',
            code: 'reversible_tiles',
            han: 1,
            isApplicable: () => true,
        },
    ],
    [
        'uumensai',
        {
            id: 'uumensai',
            code: 'uumensai',
            han: 2,
            isApplicable: () => true,
        },
    ],
    [
        'shousharin',
        {
            id: 'shousharin',
            code: 'shousharin',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'suurenkou',
        {
            id: 'suurenkou',
            code: 'suurenkou',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'iishoku_yonjun',
        {
            id: 'iishoku_yonjun',
            code: 'iishoku_yonjun',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'paarenchan',
        {
            id: 'paarenchan',
            code: 'paarenchan',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'shiisan_puutaa',
        {
            id: 'shiisan_puutaa',
            code: 'shiisan_puutaa',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'shiisuu_puutaa',
        {
            id: 'shiisuu_puutaa',
            code: 'shiisuu_puutaa',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'daichisei',
        {
            id: 'daichisei',
            code: 'daichisei',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'daisharin',
        {
            id: 'daisharin',
            code: 'daisharin',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'daichikurin',
        {
            id: 'daichikurin',
            code: 'daichikurin',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'daisuurin',
        {
            id: 'daisuurin',
            code: 'daisuurin',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'beni_kujaku',
        {
            id: 'beni_kujaku',
            code: 'beni_kujaku',
            yakumanCount: 1,
            isApplicable: () => true,
        },
    ],
    [
        'suuankou_tanki_double',
        {
            id: 'suuankou_tanki_double',
            code: 'suuankou_tanki_double',
            yakumanCount: 2,
            isApplicable: () => true,
        },
    ],
]);
