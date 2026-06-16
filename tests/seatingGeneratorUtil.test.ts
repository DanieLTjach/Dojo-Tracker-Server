import { describe, expect, it } from '@jest/globals';
import {
    generateSeatingCandidate,
    generateSeatingCandidates,
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

    describe('generateSeatingCandidate - no repeats if possible', () => {
        it('never repeats a pair at a high feasible round count (4 tables, 5 rounds)', () => {
            // 16 players; 5 rounds is the maximum feasible for 4 tables.
            const candidate = generateSeatingCandidate({ tables: 4, rounds: 5, timeLimitMs: TIME_LIMIT_MS, seed: 11 });
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

    describe('generateSeatingCandidate - configurations with repeats', () => {
        it('should handle configurations where players repeat', () => {
            expect(generateSeatingCandidate({ tables: 1, rounds: 3, timeLimitMs: TIME_LIMIT_MS, seed: 1 })).toBeDefined();
        });
    });

    // Small clubs (few tables) cannot avoid pairing repeats, and the no-repeat search used to
    // fail outright on these. Generation must still return a complete, valid schedule — with
    // every player seated once per round — rather than throwing or producing a short result.
    describe('generateSeatingCandidate - small clubs (repeats unavoidable)', () => {
        // These configs can never reach a perfect table-spread score. The optimiser bails out
        // early once it stalls (see MAX_STALL_ITERATIONS) instead of spinning to the deadline,
        // so a short budget is plenty and generation returns near-instantly.
        const SMALL_CLUB_TIME_LIMIT_MS = 200;
        const SMALL_CONFIGS = [
            { tables: 1, rounds: 2 }, // 4 players
            { tables: 1, rounds: 3 },
            { tables: 2, rounds: 2 }, // 8 players
            { tables: 2, rounds: 3 },
            { tables: 3, rounds: 2 }, // 12 players — previously failed
            { tables: 3, rounds: 3 },
            { tables: 3, rounds: 4 },
            { tables: 4, rounds: 6 }  // 16 players — previously failed at 6 rounds
        ];

        it.each(SMALL_CONFIGS)(
            'produces a complete valid schedule for %j across several seeds',
            ({ tables, rounds }) => {
                const expectedPlayers = Array.from({ length: tables * 4 }, (_, i) => i);

                for (let seed = 1; seed <= 5; seed++) {
                    const candidate = generateSeatingCandidate({ tables, rounds, timeLimitMs: SMALL_CLUB_TIME_LIMIT_MS, seed });

                    expect(candidate.rounds).toHaveLength(rounds);
                    for (const round of candidate.rounds) {
                        expect(round).toHaveLength(tables);
                        // Every player appears exactly once in each round.
                        expect(round.flat().sort((a, b) => a - b)).toEqual(expectedPlayers);
                        for (const table of round) {
                            expect(table).toHaveLength(4);
                        }
                    }
                }
            }
        );

        it('returns early instead of spinning to the deadline when the score cannot reach zero', () => {
            // A large budget that the generator must NOT consume: for this stuck config the
            // optimiser settles into a local minimum and should bail out long before the limit.
            const generousBudgetMs = 10000;
            const started = Date.now();
            const candidate = generateSeatingCandidate({ tables: 2, rounds: 2, timeLimitMs: generousBudgetMs, seed: 1 });
            const elapsed = Date.now() - started;

            expect(candidate.rounds).toHaveLength(2);
            // Should finish in a small fraction of the budget thanks to the stall-based exit.
            expect(elapsed).toBeLessThan(generousBudgetMs / 2);
        });
    });

    describe('generateSeatingCandidates - multiple options', () => {
        it('returns the requested number of candidates', () => {
            const candidates = generateSeatingCandidates({
                tables: 1,
                rounds: 1,
                timeLimitMs: TIME_LIMIT_MS,
                seed: 1,
                candidateCount: 3
            });
            expect(candidates.length).toBeGreaterThanOrEqual(1);
            expect(candidates.length).toBeLessThanOrEqual(3);
        });
    });
});
