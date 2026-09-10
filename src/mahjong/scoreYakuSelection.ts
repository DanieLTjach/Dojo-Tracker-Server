import { YakuSelectionInvalidError } from '../error/PointCalculationErrors.ts';
import { declaredLocalYakuIds, LOCAL_YAKU_REGISTRY } from './localYaku.ts';
import type { CustomRuleLike } from './localYaku.ts';
import type { HandYaku, YakuCode } from './types.ts';
import {
    COUNTED_YAKU_CODES,
    isClosedOnlyYaku,
    isCountedYakuCode,
    standardYakuHan,
    standardYakumanCount,
    STANDARD_YAKU_SPECS,
} from './yakuTable.ts';

export interface YakuSelection {
    codes: readonly YakuCode[];
    isOpen?: boolean | undefined;
    dora?: number | undefined;
    akaDora?: number | undefined;
    uraDora?: number | undefined;
    kita?: number | undefined;
    /** Dragon and seat/round wind triplets, counted rather than named. */
    yakuhai?: number | undefined;
    /** Operator override of the inferred fu. */
    fu?: number | undefined;
}

export interface ScoreYakuSelectionInput {
    selection: YakuSelection;
    winType: 'TSUMO' | 'RON';
    customRules?: readonly CustomRuleLike[] | undefined;
}

export interface ScoreYakuSelectionResult {
    han?: number;
    fu?: number;
    yakumanCount: number;
    yaku: HandYaku[];
}

// Yaku that cannot describe the same hand. Each pair is a shape contradiction,
// not a rules preference, so rejecting them costs the operator nothing real.
const MUTUALLY_EXCLUSIVE: readonly (readonly [YakuCode, YakuCode])[] = [
    ['pinfu', 'toitoi'],
    ['pinfu', 'sanankou'],
    ['pinfu', 'chiitoitsu'],
    ['chiitoitsu', 'toitoi'],
    ['chiitoitsu', 'iipeikou'],
    ['chiitoitsu', 'ryanpeikou'],
    ['chiitoitsu', 'sanankou'],
    ['chanta', 'junchan'],
    ['chanta', 'tanyao'],
    ['junchan', 'tanyao'],
    ['honitsu', 'chinitsu'],
    ['honroutou', 'tanyao'],
    ['riichi', 'double_riichi'],
    ['iipeikou', 'ryanpeikou'],
];

const COUNT_FIELD: Readonly<Partial<Record<YakuCode, keyof YakuSelection>>> = {
    yakuhai: 'yakuhai',
    dora: 'dora',
    aka_dora: 'akaDora',
    ura_dora: 'uraDora',
    kita: 'kita',
};

/**
 * Fu cannot be derived without a hand shape, so infer the cases the shape is
 * already pinned by the yaku themselves and fall back to the common 30.
 * The operator can override whenever the wait or the triplets actually matter.
 */
export function inferFu(codes: readonly YakuCode[], winType: 'TSUMO' | 'RON'): number {
    if (codes.includes('chiitoitsu')) return 25;
    if (codes.includes('pinfu')) return winType === 'TSUMO' ? 20 : 30;
    return 30;
}

function countFor(selection: YakuSelection, code: YakuCode): number {
    const field = COUNT_FIELD[code];
    return field ? Number(selection[field] ?? 0) : 0;
}

/** Yakuhai is counted like dora but, unlike dora, can carry a hand on its own. */
function yakuhaiCount(selection: YakuSelection): number {
    return Number(selection.yakuhai ?? 0);
}

function validate(selection: YakuSelection, declaredLocal: Set<string>): void {
    const codes = selection.codes;
    if (codes.length === 0 && yakuhaiCount(selection) <= 0) {
        throw new YakuSelectionInvalidError('empty');
    }
    if (new Set(codes).size !== codes.length) {
        throw new YakuSelectionInvalidError('duplicate');
    }

    for (const code of codes) {
        const isStandard = code in STANDARD_YAKU_SPECS;
        const isLocal = LOCAL_YAKU_REGISTRY.has(code);
        if (!isStandard && !isLocal) {
            throw new YakuSelectionInvalidError(code);
        }
        // A local yaku is only scoreable when this ruleset declared it, exactly as
        // on the tile-entry path.
        if (!isStandard && isLocal && !declaredLocal.has(code)) {
            throw new YakuSelectionInvalidError(code);
        }
        if (selection.isOpen && isClosedOnlyYaku(code)) {
            throw new YakuSelectionInvalidError(code);
        }
    }

    const selected = new Set<string>(codes);
    for (const [a, b] of MUTUALLY_EXCLUSIVE) {
        if (selected.has(a) && selected.has(b)) {
            throw new YakuSelectionInvalidError(`${a}+${b}`);
        }
    }

    // Dora is not a yaku: a hand of nothing but dora cannot win. Yakuhai is the
    // exception among the counted codes -- a lone dragon triplet is a real hand.
    const hasNamedYaku = codes.some(code => !isCountedYakuCode(code));
    if (!hasNamedYaku && yakuhaiCount(selection) <= 0) {
        throw new YakuSelectionInvalidError('doraOnly');
    }
}

/**
 * Prices a hand from the operator's yaku list alone. Never calls majiang-core:
 * there are no tiles to evaluate, so every value comes from the han table, the
 * local-yaku registry, or the operator's own counts.
 *
 * Returns the same shape as scoreHand, so everything downstream is unaware which
 * entry mode produced the hand.
 */
export function scoreYakuSelection(input: ScoreYakuSelectionInput): ScoreYakuSelectionResult {
    const { selection, winType, customRules } = input;
    const declaredLocal = declaredLocalYakuIds(customRules);
    validate(selection, declaredLocal);

    const isOpen = Boolean(selection.isOpen);

    // A yakuman hand scores on its own track: han, fu and dora stop mattering.
    const yakumanYaku: HandYaku[] = [];
    let yakumanCount = 0;
    for (const code of selection.codes) {
        const standard = standardYakumanCount(code);
        if (standard !== undefined) {
            yakumanCount += standard;
            yakumanYaku.push({ code, yakumanCount: standard });
            continue;
        }
        const local = LOCAL_YAKU_REGISTRY.get(code);
        if (local?.yakumanCount) {
            yakumanCount += local.yakumanCount;
            yakumanYaku.push({ code, yakumanCount: local.yakumanCount });
        }
    }
    if (yakumanCount > 0) {
        return { yakumanCount, yaku: yakumanYaku };
    }

    const yaku: HandYaku[] = [];
    let han = 0;
    for (const code of selection.codes) {
        if (isCountedYakuCode(code)) continue; // handled below, from the counts
        const standard = standardYakuHan(code, { isOpen });
        if (standard !== undefined) {
            han += standard;
            yaku.push({ code, han: standard });
            continue;
        }
        const local = LOCAL_YAKU_REGISTRY.get(code);
        if (local?.han) {
            han += local.han;
            yaku.push({ code, han: local.han });
        }
    }

    // A non-zero count is itself the assertion: "3 dora" needs no separate
    // presence flag, and requiring one would silently drop the operator's count.
    for (const code of COUNTED_YAKU_CODES) {
        const count = countFor(selection, code);
        if (count > 0) {
            han += count;
            yaku.push({ code, han: count });
        }
    }

    if (han <= 0) {
        throw new YakuSelectionInvalidError('noHan');
    }

    return {
        han,
        fu: selection.fu ?? inferFu(selection.codes, winType),
        yakumanCount: 0,
        yaku,
    };
}
