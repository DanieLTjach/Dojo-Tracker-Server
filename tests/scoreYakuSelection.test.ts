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
        const closed = scoreYakuSelection({ selection: { codes: ['honitsu', 'toitoi'] }, winType: 'RON' });
        const open = scoreYakuSelection({
            selection: { codes: ['honitsu', 'toitoi'], isOpen: true },
            winType: 'RON',
        });
        expect(closed.han).toBe(5); // 3 + 2
        expect(open.han).toBe(4); // 2 + 2
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
            const inferred = scoreYakuSelection({ selection: { codes: ['toitoi'] }, winType: 'RON' });
            expect(inferred.fu).toBe(30);

            const overridden = scoreYakuSelection({
                selection: { codes: ['toitoi'], fu: 40 },
                winType: 'RON',
            });
            expect(overridden.fu).toBe(40);
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
        ])('rejects the contradictory pair %s + %s', (a, b) => {
            expect(() => scoreYakuSelection({ selection: { codes: [a, b] as never }, winType: 'RON' })).toThrow(
                YakuSelectionInvalidError
            );
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
