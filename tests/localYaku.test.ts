import { describe, expect, it } from '@jest/globals';
import { declaredLocalYakuIds, isLocalYakuEnabled, LOCAL_YAKU_REGISTRY } from '../src/mahjong/localYaku.ts';
import type { HandDetail, ScoreHandInput } from '../src/mahjong/types.ts';

describe('LOCAL_YAKU_REGISTRY', () => {
    it('contains all 18 authoritative preset entries with correct values from the PDF', () => {
        const expectedValues: Record<string, { han?: number, yakumanCount?: number }> = {
            tsubame_gaeshi: { han: 1 },
            oopun_riichi: { han: 2 },
            sanrenkou: { han: 2 },
            iishoku_sanjun: { han: 2 },
            reversible_tiles: { han: 1 }, // Note: 1 han per PDF p.4
            uumensai: { han: 2 },
            shousharin: { yakumanCount: 1 }, // Note: yakuman per PDF p.20
            suurenkou: { yakumanCount: 1 },
            iishoku_yonjun: { yakumanCount: 1 },
            paarenchan: { yakumanCount: 1 },
            shiisan_puutaa: { yakumanCount: 1 },
            shiisuu_puutaa: { yakumanCount: 1 },
            daichisei: { yakumanCount: 1 },
            daisharin: { yakumanCount: 1 },
            daichikurin: { yakumanCount: 1 },
            daisuurin: { yakumanCount: 1 },
            beni_kujaku: { yakumanCount: 1 },
            suuankou_tanki_double: { yakumanCount: 2 },
        };

        expect(LOCAL_YAKU_REGISTRY.size).toBe(18);

        for (const [id, expected] of Object.entries(expectedValues)) {
            const spec = LOCAL_YAKU_REGISTRY.get(id);
            expect(spec).toBeDefined();
            expect(spec!.id).toBe(id);
            expect(spec!.code).toBe(id);
            if (expected.han !== undefined) {
                expect(spec!.han).toBe(expected.han);
                expect(spec!.yakumanCount).toBeUndefined();
            } else {
                expect(spec!.yakumanCount).toBe(expected.yakumanCount);
                expect(spec!.han).toBeUndefined();
            }
        }
    });

    describe('tsubame_gaeshi applicability', () => {
        const tsubame = LOCAL_YAKU_REGISTRY.get('tsubame_gaeshi')!;

        const dummyHandDetail: HandDetail = {
            concealedTiles: [
                'pin_1',
                'pin_2',
                'pin_3',
                'sou_2',
                'sou_3',
                'sou_4',
                'man_5',
                'man_6',
                'man_7',
                'ton',
                'ton',
                'nan',
                'nan',
            ],
            melds: [],
            winningTile: 'nan',
            doraIndicators: ['chun'],
            uraDoraIndicators: ['haku'],
        };

        it('is applicable on RON when discarder declared riichi', () => {
            const input: ScoreHandInput = {
                handDetail: dummyHandDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 1,
                riichiPlayerSeats: new Set([1]),
            };
            expect(tsubame.isApplicable(input)).toBe(true);
        });

        it('is not applicable on TSUMO', () => {
            const input: ScoreHandInput = {
                handDetail: dummyHandDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                riichiPlayerSeats: new Set([1]),
            };
            expect(tsubame.isApplicable(input)).toBe(false);
        });

        it('is not applicable when dealInSeat is undefined', () => {
            const input: ScoreHandInput = {
                handDetail: dummyHandDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: undefined,
                riichiPlayerSeats: new Set([1]),
            };
            expect(tsubame.isApplicable(input)).toBe(false);
        });

        it('is not applicable on self-deal (dealInSeat === winnerSeat)', () => {
            const input: ScoreHandInput = {
                handDetail: dummyHandDetail,
                winType: 'RON',
                winnerSeat: 1,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 1,
                riichiPlayerSeats: new Set([1]),
            };
            expect(tsubame.isApplicable(input)).toBe(false);
        });

        it('is not applicable when discarder did not declare riichi', () => {
            const input: ScoreHandInput = {
                handDetail: dummyHandDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 1,
                riichiPlayerSeats: new Set([2]), // different seat in riichi
            };
            expect(tsubame.isApplicable(input)).toBe(false);
        });

        it('has expected conflicting context flags', () => {
            expect(tsubame.conflictingContextFlags).toEqual([
                'chankan',
                'haitei',
                'rinshanKaihou',
                'tenhou',
                'chiihou',
                'renhou',
            ]);
        });
    });

    describe('declaredLocalYakuIds and isLocalYakuEnabled', () => {
        it('identifies enabled vs disabled entries correctly', () => {
            expect(isLocalYakuEnabled({ category: 'yaku', value: true, presetId: 'tsubame_gaeshi' })).toBe(true);
            expect(isLocalYakuEnabled({ category: 'yaku', value: 1, presetId: 'tsubame_gaeshi' })).toBe(true);
            expect(isLocalYakuEnabled({ category: 'yaku', value: 'yakuman', presetId: 'shousharin' })).toBe(true);
            expect(isLocalYakuEnabled({ category: 'yaku', value: false, presetId: 'tsubame_gaeshi' })).toBe(false);
            expect(isLocalYakuEnabled({ category: 'yaku', value: 0, presetId: 'tsubame_gaeshi' })).toBe(false);
        });

        it('filters category, missing presetId, and disabled entries', () => {
            const customRules = [
                { category: 'yaku', value: 1, presetId: 'tsubame_gaeshi', name: 'Swallow' },
                { category: 'yaku', value: 0, presetId: 'sanrenkou', name: 'Sanrenkou disabled' },
                { category: 'yaku', value: false, presetId: 'uumensai', name: 'Uumensai disabled' },
                { category: 'fu', value: 30, presetId: 'custom_fu', name: 'Custom Fu' },
                { category: 'rule', value: true, presetId: 'custom_rule', name: 'Custom Rule' },
                { category: 'yaku', value: 1, name: 'Free text local yaku without presetId' },
            ];

            const result = declaredLocalYakuIds(customRules);
            expect(result).toEqual(new Set(['tsubame_gaeshi']));
        });

        it('returns empty set when customRules is null or undefined', () => {
            expect(declaredLocalYakuIds(null)).toEqual(new Set());
            expect(declaredLocalYakuIds(undefined)).toEqual(new Set());
            expect(declaredLocalYakuIds([])).toEqual(new Set());
        });
    });
});
