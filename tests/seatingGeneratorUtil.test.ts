import { describe, expect, it } from '@jest/globals';
import {
    generateSeatingCandidate,
    generateSeatingCandidates,
    maxFeasibleRounds,
    SeatingGenerationError,
    type SeatingCandidate
} from '../src/util/SeatingGeneratorUtil.ts';

// Generation always spends its full budget on table-spread optimisation, so keep this
// modest to bound suite runtime. The no-repeat schedule and seat balance converge well
// within this window for the configurations exercised here.
const TIME_LIMIT_MS = 1500;

/** Counts how many player pairs are seated together more than once across all rounds. */
function countPairRepeats(candidate: SeatingCandidate): number {
    const seen = new Set<number>();
    let repeats = 0;
    for (const round of candidate.rounds) {
        for (const table of round) {
            for (let i = 0; i < table.length; i++) {
                for (let j = i + 1; j < table.length; j++) {
                    const a = table[i]!;
                    const b = table[j]!;
                    const key = a < b ? a * 100000 + b : b * 100000 + a;
                    if (seen.has(key)) repeats++;
                    seen.add(key);
                }
            }
        }
    }
    return repeats;
}

/** Returns the multiset of player indices that appear, to confirm coverage. */
function collectPlayers(candidate: SeatingCandidate): number[] {
    return candidate.rounds[0]!.flat().sort((a, b) => a - b);
}

describe('SeatingGeneratorUtil', () => {
    describe('generateSeatingCandidate - structure', () => {
        it('produces the requested number of rounds and tables of four players each', () => {
            const candidate = generateSeatingCandidate({ tables: 4, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 1 });

            expect(candidate.rounds).toHaveLength(4);
            for (const round of candidate.rounds) {
                expect(round).toHaveLength(4);
                for (const table of round) {
                    expect(table).toHaveLength(4);
                }
            }
        });

        it('seats every player exactly once per round', () => {
            const candidate = generateSeatingCandidate({ tables: 5, rounds: 3, timeLimitMs: TIME_LIMIT_MS, seed: 2 });

            const expectedPlayers = Array.from({ length: 20 }, (_, i) => i);
            for (const round of candidate.rounds) {
                const playersThisRound = round.flat().sort((a, b) => a - b);
                expect(playersThisRound).toEqual(expectedPlayers);
            }
        });

        it('uses player indices 0..(tables*4 - 1)', () => {
            const candidate = generateSeatingCandidate({ tables: 3, rounds: 1, timeLimitMs: TIME_LIMIT_MS, seed: 3 });
            expect(collectPlayers(candidate)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        });
    });

    describe('maxFeasibleRounds', () => {
        it('caps 3 tables at a single round (a group of 4 from 3 prior groups must repeat a pair)', () => {
            expect(maxFeasibleRounds(3)).toBe(1);
        });

        it('follows the pairing bound for 4+ tables', () => {
            expect(maxFeasibleRounds(4)).toBe(5); // floor(15/3)
            expect(maxFeasibleRounds(5)).toBe(6); // floor(19/3)
            expect(maxFeasibleRounds(6)).toBe(7); // floor(23/3)
        });
    });

    describe('generateSeatingCandidate - no-repeat guarantee', () => {
        it('never seats the same pair of players together twice (4 tables, 4 rounds)', () => {
            const candidate = generateSeatingCandidate({ tables: 4, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 10 });
            expect(countPairRepeats(candidate)).toBe(0);
        });

        it('never repeats a pair at a high feasible round count (4 tables, 5 rounds)', () => {
            // 16 players; 5 rounds is the maximum feasible for 4 tables.
            const candidate = generateSeatingCandidate({ tables: 4, rounds: 5, timeLimitMs: TIME_LIMIT_MS, seed: 11 });
            expect(countPairRepeats(candidate)).toBe(0);
        });

        it('never repeats a pair for a larger field (6 tables, 4 rounds)', () => {
            const candidate = generateSeatingCandidate({ tables: 6, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 12 });
            expect(countPairRepeats(candidate)).toBe(0);
        });
    });

    describe('generateSeatingCandidate - seat balance', () => {
        it('gives each player each starting seat exactly once when rounds === 4', () => {
            const candidate = generateSeatingCandidate({ tables: 4, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 20 });

            // Build per-player seat counts across rounds.
            const seatCounts = new Map<number, number[]>();
            for (const round of candidate.rounds) {
                for (const table of round) {
                    table.forEach((player, seatIndex) => {
                        const counts = seatCounts.get(player) ?? [0, 0, 0, 0];
                        counts[seatIndex]!++;
                        seatCounts.set(player, counts);
                    });
                }
            }

            // With 4 rounds and a perfect balance, every player sits each wind once.
            expect(candidate.seatBalanceScore).toBe(0);
            for (const counts of seatCounts.values()) {
                expect(counts).toEqual([1, 1, 1, 1]);
            }
        });
    });

    describe('generateSeatingCandidate - determinism', () => {
        it('returns identical seatings for the same seed and options', () => {
            const a = generateSeatingCandidate({ tables: 4, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 99 });
            const b = generateSeatingCandidate({ tables: 4, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 99 });
            expect(a.rounds).toEqual(b.rounds);
        });

        it('returns different seatings for different seeds', () => {
            const a = generateSeatingCandidate({ tables: 5, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 100 });
            const b = generateSeatingCandidate({ tables: 5, rounds: 4, timeLimitMs: TIME_LIMIT_MS, seed: 200 });
            expect(a.rounds).not.toEqual(b.rounds);
        });
    });

    describe('generateSeatingCandidate - infeasible configurations', () => {
        it('throws when the round count exceeds what the pairing math allows', () => {
            // 3 tables only supports a single no-repeat round; 2 rounds is impossible.
            expect(() =>
                generateSeatingCandidate({ tables: 3, rounds: 2, timeLimitMs: TIME_LIMIT_MS, seed: 1 })
            ).toThrow(SeatingGenerationError);
        });

        it('throws when exceeding the feasible bound for a larger field (4 tables, 6 rounds)', () => {
            expect(() =>
                generateSeatingCandidate({ tables: 4, rounds: 6, timeLimitMs: TIME_LIMIT_MS, seed: 1 })
            ).toThrow(SeatingGenerationError);
        });
    });

    describe('generateSeatingCandidates - multiple options', () => {
        it('returns the requested number of candidates', () => {
            const candidates = generateSeatingCandidates({
                tables: 4,
                rounds: 4,
                timeLimitMs: TIME_LIMIT_MS,
                seed: 1,
                candidateCount: 3
            });
            expect(candidates.length).toBeGreaterThanOrEqual(1);
            expect(candidates.length).toBeLessThanOrEqual(3);
        });

        it('sorts candidates best-first by table spread then seat balance', () => {
            const candidates = generateSeatingCandidates({
                tables: 4,
                rounds: 4,
                timeLimitMs: TIME_LIMIT_MS,
                seed: 5,
                candidateCount: 3
            });
            for (let i = 1; i < candidates.length; i++) {
                const prev = candidates[i - 1]!;
                const curr = candidates[i]!;
                const prevWorse =
                    prev.tableSpreadScore > curr.tableSpreadScore ||
                    (prev.tableSpreadScore === curr.tableSpreadScore && prev.seatBalanceScore > curr.seatBalanceScore);
                expect(prevWorse).toBe(false);
            }
        });

        it('every returned candidate satisfies the no-repeat guarantee', () => {
            const candidates = generateSeatingCandidates({
                tables: 5,
                rounds: 5,
                timeLimitMs: TIME_LIMIT_MS,
                seed: 7,
                candidateCount: 2
            });
            for (const candidate of candidates) {
                expect(countPairRepeats(candidate)).toBe(0);
            }
        });

        it('throws when no candidate can be generated for an infeasible configuration', () => {
            expect(() =>
                generateSeatingCandidates({
                    tables: 3,
                    rounds: 2,
                    timeLimitMs: TIME_LIMIT_MS,
                    seed: 1,
                    candidateCount: 3
                })
            ).toThrow(SeatingGenerationError);
        });
    });
});
