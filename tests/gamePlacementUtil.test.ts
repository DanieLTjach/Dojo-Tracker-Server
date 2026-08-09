import { jest } from '@jest/globals';
import { calculatePlacements, type PlacementInput } from '../src/util/GamePlacementUtil.ts';
import LogService from '../src/service/LogService.ts';

describe('GamePlacementUtil', () => {
    describe('calculatePlacements', () => {
        test('returns empty array for empty input', () => {
            expect(calculatePlacements([], 'DIVIDE')).toEqual([]);
            expect(calculatePlacements([], 'WIND')).toEqual([]);
        });

        test('calculates placements for distinct scores under DIVIDE and WIND', () => {
            const players: PlacementInput[] = [
                { userId: 1, points: 40000, startPlace: 'EAST' },
                { userId: 2, points: 30000, startPlace: 'SOUTH' },
                { userId: 3, points: 20000, startPlace: 'WEST' },
                { userId: 4, points: 10000, startPlace: 'NORTH' },
            ];

            expect(calculatePlacements(players, 'DIVIDE')).toEqual([1, 2, 3, 4]);
            expect(calculatePlacements(players, 'WIND')).toEqual([1, 2, 3, 4]);
        });

        test('DIVIDE assigns equal ranks on point ties (1, 2, 2, 4)', () => {
            const players: PlacementInput[] = [
                { userId: 1, points: 40000, startPlace: 'EAST' },
                { userId: 2, points: 25000, startPlace: 'SOUTH' },
                { userId: 3, points: 25000, startPlace: 'WEST' },
                { userId: 4, points: 10000, startPlace: 'NORTH' },
            ];

            expect(calculatePlacements(players, 'DIVIDE')).toEqual([1, 2, 2, 4]);
        });

        test('WIND breaks point ties by wind order (EAST < SOUTH < WEST < NORTH)', () => {
            const players: PlacementInput[] = [
                { userId: 1, points: 40000, startPlace: 'NORTH' },
                { userId: 2, points: 25000, startPlace: 'WEST' }, // WEST is 2
                { userId: 3, points: 25000, startPlace: 'SOUTH' }, // SOUTH is 1 -> better rank
                { userId: 4, points: 10000, startPlace: 'EAST' },
            ];

            // userId 1 (40000) -> 1
            // userId 3 (25000, SOUTH) -> 2
            // userId 2 (25000, WEST) -> 3
            // userId 4 (10000) -> 4
            expect(calculatePlacements(players, 'WIND')).toEqual([1, 3, 2, 4]);
        });

        test('handles 3-way and 4-way ties under DIVIDE', () => {
            const threeWayTie: PlacementInput[] = [
                { userId: 1, points: 30000 },
                { userId: 2, points: 30000 },
                { userId: 3, points: 30000 },
                { userId: 4, points: 10000 },
            ];
            expect(calculatePlacements(threeWayTie, 'DIVIDE')).toEqual([1, 1, 1, 4]);

            const fourWayTie: PlacementInput[] = [
                { userId: 1, points: 25000 },
                { userId: 2, points: 25000 },
                { userId: 3, points: 25000 },
                { userId: 4, points: 25000 },
            ];
            expect(calculatePlacements(fourWayTie, 'DIVIDE')).toEqual([1, 1, 1, 1]);
        });

        test('handles 3-player games (sanma)', () => {
            const sanmaPlayers: PlacementInput[] = [
                { userId: 1, points: 45000, startPlace: 'EAST' },
                { userId: 2, points: 30000, startPlace: 'SOUTH' },
                { userId: 3, points: 30000, startPlace: 'WEST' },
            ];

            expect(calculatePlacements(sanmaPlayers, 'DIVIDE')).toEqual([1, 2, 2]);
            expect(calculatePlacements(sanmaPlayers, 'WIND')).toEqual([1, 2, 3]);
        });

        test('preserves alignment with input order regardless of initial sorting', () => {
            // Unsorted input
            const players: PlacementInput[] = [
                { userId: 3, points: 10000, startPlace: 'WEST' },
                { userId: 1, points: 40000, startPlace: 'EAST' },
                { userId: 4, points: 20000, startPlace: 'NORTH' },
                { userId: 2, points: 30000, startPlace: 'SOUTH' },
            ];

            // user 3 (10000) -> rank 4
            // user 1 (40000) -> rank 1
            // user 4 (20000) -> rank 3
            // user 2 (30000) -> rank 2
            expect(calculatePlacements(players, 'DIVIDE')).toEqual([4, 1, 3, 2]);
            expect(calculatePlacements(players, 'WIND')).toEqual([4, 1, 3, 2]);
        });

        test('WIND with tied scores and missing startPlace falls back to DIVIDE and logs error', () => {
            const logSpy = jest.spyOn(LogService, 'logError').mockImplementation(() => {});

            const players: PlacementInput[] = [
                { userId: 1, points: 40000, startPlace: 'EAST' },
                { userId: 2, points: 25000, startPlace: null },
                { userId: 3, points: 25000, startPlace: 'WEST' },
                { userId: 4, points: 10000, startPlace: 'NORTH' },
            ];

            const ranks = calculatePlacements(players, 'WIND');
            expect(ranks).toEqual([1, 2, 2, 4]);
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Missing startPlace for player with tied score under WIND tiebreak')
            );

            logSpy.mockRestore();
        });
    });
});
