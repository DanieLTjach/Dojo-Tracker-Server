import { LOCAL_YAKU_REGISTRY } from '../src/mahjong/localYaku.ts';
import { scoreHand } from '../src/mahjong/scoreHand.ts';
import type { ScoreHandInput, YakuCode } from '../src/mahjong/types.ts';
import {
    isClosedOnlyYaku,
    isCountedYakuCode,
    standardYakuHan,
    standardYakumanCount,
    STANDARD_YAKU_SPECS,
    YAKU_CODES_PRICED_ELSEWHERE,
} from '../src/mahjong/yakuTable.ts';
import { yakuCodeValues } from '../src/schema/GameRoundResultSchemas.ts';

describe('yakuTable', () => {
    // The guard that matters: a yaku code added to the union without a price would
    // otherwise reach the pricer and silently contribute zero han.
    it('prices every YakuCode in the union exactly once', () => {
        const localIds = new Set([...LOCAL_YAKU_REGISTRY.values()].map(spec => spec.code));
        const elsewhere = new Set<string>(YAKU_CODES_PRICED_ELSEWHERE);

        for (const code of yakuCodeValues) {
            const inStandard = code in STANDARD_YAKU_SPECS;
            const inLocal = localIds.has(code as YakuCode);
            const sources = [inStandard, inLocal, elsewhere.has(code)].filter(Boolean).length;
            expect([code, sources]).toEqual([code, 1]);
        }
    });

    it('applies the open/closed split for the six yaku that carry one', () => {
        const splits: [YakuCode, number, number][] = [
            ['sanshoku_doujun', 2, 1],
            ['ittsuu', 2, 1],
            ['chanta', 2, 1],
            ['honitsu', 3, 2],
            ['junchan', 3, 2],
            ['chinitsu', 6, 5],
        ];
        for (const [code, closed, open] of splits) {
            expect(standardYakuHan(code, { isOpen: false })).toBe(closed);
            expect(standardYakuHan(code, { isOpen: true })).toBe(open);
        }
    });

    it('keeps flat-han yaku unchanged when the hand is open', () => {
        expect(standardYakuHan('tanyao', { isOpen: false })).toBe(1);
        expect(standardYakuHan('tanyao', { isOpen: true })).toBe(1);
        expect(standardYakuHan('toitoi', { isOpen: true })).toBe(2);
    });

    it('flags the closed-only yaku', () => {
        for (const code of ['pinfu', 'iipeikou', 'ryanpeikou', 'menzen_tsumo', 'riichi', 'chiitoitsu'] as YakuCode[]) {
            expect([code, isClosedOnlyYaku(code)]).toEqual([code, true]);
        }
        expect(isClosedOnlyYaku('tanyao')).toBe(false);
        expect(isClosedOnlyYaku('honitsu')).toBe(false);
    });

    it('takes han from the count for dora-like codes', () => {
        expect(isCountedYakuCode('dora')).toBe(true);
        expect(standardYakuHan('dora', { count: 3 })).toBe(3);
        expect(standardYakuHan('aka_dora', { count: 1 })).toBe(1);
        // A zero count is not a yaku at all, so it must not contribute a row.
        expect(standardYakuHan('dora', { count: 0 })).toBeUndefined();
    });

    it('reports yakuman codes through the yakuman accessor, not han', () => {
        expect(standardYakumanCount('daisangen')).toBe(1);
        expect(standardYakumanCount('suuankou_tanki')).toBe(2);
        expect(standardYakumanCount('kokushi_musou_13')).toBe(2);
        expect(standardYakuHan('daisangen')).toBeUndefined();
        expect(standardYakumanCount('tanyao')).toBeUndefined();
    });

    it('does not price local yaku or renhou', () => {
        expect(standardYakuHan('tsubame_gaeshi')).toBeUndefined();
        expect(standardYakuHan('renhou')).toBeUndefined();
    });
});

/**
 * The table is transcribed from majiang-core. These score real hands through the
 * engine, then re-price the engine's own yaku list from the table and assert the
 * totals agree — so a dependency bump that changes a han value fails here instead
 * of silently mispricing every yaku-list hand.
 */
describe('yakuTable agrees with the engine', () => {
    const repriceFromTable = (yaku: { code: YakuCode, han?: number }[], isOpen: boolean): number =>
        yaku.reduce((sum, entry) => {
            const counted = isCountedYakuCode(entry.code);
            const han = standardYakuHan(entry.code, { isOpen, count: counted ? entry.han ?? 0 : 0 });
            return sum + (han ?? 0);
        }, 0);

    const cases: { name: string, input: ScoreHandInput, isOpen: boolean }[] = [
        {
            name: 'closed chiitoitsu + riichi + tsumo',
            isOpen: false,
            input: {
                handDetail: {
                    concealedTiles: [
                        'man_1',
                        'man_1',
                        'pin_2',
                        'pin_2',
                        'sou_3',
                        'sou_3',
                        'ton',
                        'ton',
                        'nan',
                        'nan',
                        'haku',
                        'haku',
                        'hatsu',
                    ],
                    melds: [],
                    winningTile: 'hatsu',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                riichiPlayerSeats: new Set([0]),
            },
        },
        {
            name: 'closed pinfu + tanyao',
            isOpen: false,
            input: {
                handDetail: {
                    concealedTiles: [
                        'man_2',
                        'man_3',
                        'man_4',
                        'pin_3',
                        'pin_4',
                        'pin_5',
                        'sou_4',
                        'sou_5',
                        'sou_6',
                        'man_6',
                        'man_7',
                        'pin_8',
                        'pin_8',
                    ],
                    melds: [],
                    winningTile: 'man_8',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 1,
                roundWindSeat: 0,
                dealInSeat: 1,
            },
        },
    ];

    for (const { name, input, isOpen } of cases) {
        it(`matches the engine total for ${name}`, () => {
            const engine = scoreHand(input);
            expect(engine.han).toBeDefined();
            const fromTable = repriceFromTable(
                engine.yaku as { code: YakuCode, han?: number }[],
                isOpen
            );
            expect(fromTable).toBe(engine.han);
        });
    }

    // The open/closed split is the part most likely to drift, so pin it against a
    // genuinely open hand rather than only against the table's own constants.
    it('matches the engine for an open honitsu', () => {
        const engine = scoreHand({
            handDetail: {
                concealedTiles: ['man_1', 'man_1', 'man_1', 'man_5', 'man_6', 'man_7', 'haku', 'haku', 'haku', 'nan'],
                melds: [
                    { type: 'PON', tiles: ['man_9', 'man_9', 'man_9'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                ],
                winningTile: 'nan',
                doraIndicators: [],
                uraDoraIndicators: [],
            },
            winType: 'RON',
            winnerSeat: 0,
            dealerSeat: 1,
            roundWindSeat: 0,
            dealInSeat: 1,
        } as ScoreHandInput);

        const honitsu = engine.yaku.find(y => y.code === 'honitsu');
        expect(honitsu).toBeDefined();
        // The engine charges the open value; the table must agree.
        expect((honitsu as { han: number }).han).toBe(standardYakuHan('honitsu', { isOpen: true }));
    });
});
