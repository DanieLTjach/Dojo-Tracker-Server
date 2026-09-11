import { YakuSelectionInvalidError } from '../src/error/PointCalculationErrors.ts';
import { inferFu, scoreYakuSelection } from '../src/mahjong/scoreYakuSelection.ts';

const tsubameRules = [
    { category: 'yaku' as const, value: 1, presetId: 'tsubame_gaeshi', name: 'Tsubame gaeshi' },
];

describe('scoreYakuSelection', () => {
    // The count is the assertion: a client that sends `dora: 3` without listing
    // 'dora' among the codes must still be charged for it.
    it('prices the everyday case: tanyao + pinfu + 3 dora, code listed or not', () => {
        const withoutCode = scoreYakuSelection({
            selection: { codes: ['tanyao', 'pinfu'], dora: 3 },
            winType: 'RON',
        });
        expect(withoutCode.han).toBe(5);
        expect(withoutCode.yaku).toContainEqual({ code: 'dora', han: 3 });

        const res = scoreYakuSelection({
            selection: { codes: ['tanyao', 'pinfu', 'dora'], dora: 3 },
            winType: 'RON',
        });
        expect(res.han).toBe(5);
        expect(res.yakumanCount).toBe(0);
        expect(res.yaku).toEqual([
            { code: 'tanyao', han: 1 },
            { code: 'pinfu', han: 1 },
            { code: 'dora', han: 3 },
        ]);
    });

    it('charges the open value for a split yaku', () => {
        const closed = scoreYakuSelection({ selection: { codes: ['honitsu', 'ittsuu'] }, winType: 'RON' });
        const open = scoreYakuSelection({
            selection: { codes: ['honitsu', 'ittsuu'], isOpen: true },
            winType: 'RON',
        });
        expect(closed.han).toBe(5); // 3 + 2
        expect(open.han).toBe(3); // 2 + 1
    });

    describe('fu inference', () => {
        it('uses 25 for chiitoitsu, 20 for pinfu tsumo and 30 for pinfu ron', () => {
            expect(inferFu(['chiitoitsu'], 'TSUMO')).toBe(25);
            expect(inferFu(['chiitoitsu'], 'RON')).toBe(25);
            expect(inferFu(['pinfu', 'tanyao'], 'TSUMO')).toBe(20);
            expect(inferFu(['pinfu', 'tanyao'], 'RON')).toBe(30);
            expect(inferFu(['toitoi'], 'RON')).toBe(30);
        });

        it('lets the operator override the inferred value', () => {
            const inferred = scoreYakuSelection({ selection: { codes: ['toitoi'], isOpen: true }, winType: 'RON' });
            expect(inferred.fu).toBe(30);

            const overridden = scoreYakuSelection({
                selection: { codes: ['toitoi'], isOpen: true, fu: 40 },
                winType: 'RON',
            });
            expect(overridden.fu).toBe(40);
        });

        // The playtest complaint: pinfu was accepting 40 fu, which no pinfu hand
        // can score. The yaku itself asserts that nothing adds fu.
        it('refuses an override the yaku have already pinned', () => {
            expect(() =>
                scoreYakuSelection({
                    selection: { codes: ['pinfu', 'tanyao'], fu: 40 },
                    winType: 'RON',
                })
            ).toThrow(YakuSelectionInvalidError);
            expect(() =>
                scoreYakuSelection({
                    selection: { codes: ['pinfu', 'tanyao'], fu: 30 },
                    winType: 'TSUMO',
                })
            ).toThrow(YakuSelectionInvalidError);
            expect(() => scoreYakuSelection({ selection: { codes: ['chiitoitsu'], fu: 30 }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });

        it('accepts the one value each pinned shape allows', () => {
            expect(
                scoreYakuSelection({
                    selection: { codes: ['pinfu', 'tanyao'], fu: 20 },
                    winType: 'TSUMO',
                }).fu
            ).toBe(20);
            expect(
                scoreYakuSelection({ selection: { codes: ['pinfu', 'tanyao'], fu: 30 }, winType: 'RON' })
                    .fu
            ).toBe(30);
        });
    });

    // Every case here is a hand that is fine on its own but cannot have been won
    // the way the operator described the round.
    describe('round-fact contradictions', () => {
        it.each(
            [
                ['menzen_tsumo', 'RON'],
                ['haitei', 'RON'],
                ['rinshan_kaihou', 'RON'],
                ['houtei', 'TSUMO'],
                ['chankan', 'TSUMO'],
            ] as const
        )('rejects %s on a %s', (code, winType) => {
            expect(() => scoreYakuSelection({ selection: { codes: [code, 'tanyao'] }, winType }))
                .toThrow(YakuSelectionInvalidError);
        });

        it.each(
            [
                ['menzen_tsumo', 'TSUMO'],
                ['haitei', 'TSUMO'],
                ['rinshan_kaihou', 'TSUMO'],
                ['houtei', 'RON'],
                ['chankan', 'RON'],
            ] as const
        )('accepts %s on a %s', (code, winType) => {
            expect(scoreYakuSelection({ selection: { codes: [code, 'tanyao'] }, winType }).han).toBe(2);
        });

        // Ippatsu is a window riichi opens; with no riichi there is no window.
        it('rejects ippatsu without a riichi', () => {
            expect(() => scoreYakuSelection({ selection: { codes: ['ippatsu', 'tanyao'] }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });

        it.each(['riichi', 'double_riichi'] as const)('accepts ippatsu alongside %s', declaration => {
            expect(
                scoreYakuSelection({ selection: { codes: ['ippatsu', declaration] }, winType: 'RON' }).han
            ).toBeGreaterThanOrEqual(2);
        });
    });

    it('scores a yakuman on its own track, ignoring dora', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['daisangen', 'dora'], dora: 4 },
            winType: 'RON',
        });
        expect(res.yakumanCount).toBe(1);
        expect(res.han).toBeUndefined();
        expect(res.fu).toBeUndefined();
        expect(res.yaku).toEqual([{ code: 'daisangen', yakumanCount: 1 }]);
    });

    it('stacks a double yakuman', () => {
        const res = scoreYakuSelection({ selection: { codes: ['suuankou_tanki'] }, winType: 'TSUMO' });
        expect(res.yakumanCount).toBe(2);
    });

    it('prices a declared local yaku from the local registry', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['tanyao', 'tsubame_gaeshi'] },
            winType: 'RON',
            customRules: tsubameRules,
        });
        expect(res.han).toBe(2);
        expect(res.yaku).toContainEqual({ code: 'tsubame_gaeshi', han: 1 });
    });

    it('rejects a local yaku the ruleset never declared', () => {
        expect(() => scoreYakuSelection({ selection: { codes: ['tanyao', 'tsubame_gaeshi'] }, winType: 'RON' }))
            .toThrow(YakuSelectionInvalidError);
    });

    describe('consistency checks', () => {
        it('rejects a closed-only yaku on an open hand', () => {
            expect(() =>
                scoreYakuSelection({ selection: { codes: ['pinfu', 'tanyao'], isOpen: true }, winType: 'RON' })
            ).toThrow(YakuSelectionInvalidError);
            expect(() =>
                scoreYakuSelection({ selection: { codes: ['riichi', 'tanyao'], isOpen: true }, winType: 'RON' })
            ).toThrow(YakuSelectionInvalidError);
        });

        it('allows the same closed-only yaku on a closed hand', () => {
            expect(
                scoreYakuSelection({ selection: { codes: ['pinfu', 'tanyao'] }, winType: 'RON' }).han
            ).toBe(2);
        });

        it.each([
            ['pinfu', 'toitoi'],
            ['chiitoitsu', 'toitoi'],
            ['chanta', 'junchan'],
            ['honitsu', 'chinitsu'],
            ['riichi', 'double_riichi'],
            ['tanyao', 'chanta'],
            ['toitoi', 'sanshoku_doujun'],
            ['toitoi', 'ittsuu'],
            ['toitoi', 'iipeikou'],
            ['toitoi', 'ryanpeikou'],
        ])('rejects the contradictory pair %s + %s', (a, b) => {
            expect(() => scoreYakuSelection({ selection: { codes: [a, b] as never }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });

        // A closed toitoi has at least three concealed triplets, so without
        // sanankou the hand was really open.
        it('rejects a closed toitoi without sanankou', () => {
            expect(() => scoreYakuSelection({ selection: { codes: ['toitoi'] }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });

        it('accepts a closed toitoi with sanankou, and an open toitoi alone', () => {
            expect(scoreYakuSelection({ selection: { codes: ['toitoi', 'sanankou'] }, winType: 'RON' }).han).toBe(4);
            expect(
                scoreYakuSelection({ selection: { codes: ['toitoi'], isOpen: true }, winType: 'RON' }).han
            ).toBe(2);
        });

        it('rejects dora with no actual yaku', () => {
            expect(() => scoreYakuSelection({ selection: { codes: ['dora'], dora: 3 }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });

        it('rejects an empty, duplicated or unknown selection', () => {
            expect(() => scoreYakuSelection({ selection: { codes: [] }, winType: 'RON' }))
                .toThrow(YakuSelectionInvalidError);
            expect(() => scoreYakuSelection({ selection: { codes: ['tanyao', 'tanyao'] }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
            expect(() => scoreYakuSelection({ selection: { codes: ['not_a_yaku'] as never }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
        });
    });

    it('omits a counted yaku whose count is zero', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['tanyao', 'dora'], dora: 0 },
            winType: 'RON',
        });
        expect(res.han).toBe(1);
        expect(res.yaku).toEqual([{ code: 'tanyao', han: 1 }]);
    });

    it('never double-counts a listed counted code', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['tanyao', 'dora'], dora: 2 },
            winType: 'RON',
        });
        expect(res.han).toBe(3);
        expect(res.yaku.filter(y => y.code === 'dora')).toHaveLength(1);
    });

    it('sums every counted type', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['riichi'], dora: 1, akaDora: 2, uraDora: 1 },
            winType: 'RON',
        });
        expect(res.han).toBe(5);
    });
});

describe('yakuhai counting', () => {
    // Eleven dragon and wind yaku collapse into one count in the picker, so the
    // count has to score without any of their individual codes being present.
    it('scores a yakuhai count with no codes at all', () => {
        const res = scoreYakuSelection({ selection: { codes: [], yakuhai: 2 }, winType: 'RON' });
        expect(res.han).toBe(2);
        expect(res.yaku).toEqual([{ code: 'yakuhai', han: 2 }]);
    });

    it('adds the count to named yaku', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['riichi', 'chanta'], yakuhai: 3, dora: 1 },
            winType: 'RON',
        });
        expect(res.han).toBe(7); // 1 + 2 + 3 + 1
    });

    // Unlike dora, yakuhai is a real yaku: a lone dragon triplet wins.
    it('carries a hand on its own, where dora cannot', () => {
        expect(() => scoreYakuSelection({ selection: { codes: [], yakuhai: 1 }, winType: 'RON' }))
            .not.toThrow();
        expect(() => scoreYakuSelection({ selection: { codes: [], dora: 3 }, winType: 'RON' }))
            .toThrow(YakuSelectionInvalidError);
    });

    it('rejects a wholly empty selection', () => {
        expect(() => scoreYakuSelection({ selection: { codes: [], yakuhai: 0 }, winType: 'RON' }))
            .toThrow(YakuSelectionInvalidError);
        expect(() => scoreYakuSelection({ selection: { codes: [] }, winType: 'RON' }))
            .toThrow(YakuSelectionInvalidError);
    });

    it('omits the row when the count is zero', () => {
        const res = scoreYakuSelection({
            selection: { codes: ['tanyao'], yakuhai: 0 },
            winType: 'RON',
        });
        expect(res.yaku).toEqual([{ code: 'tanyao', han: 1 }]);
    });
});
