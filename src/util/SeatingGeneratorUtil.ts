/**
 * Mahjong tournament seating generator.
 *
 * Ported from the Python "Social Golfer Problem" solver at https://github.com/aesdeef/sgp.
 * It builds round-by-round seating for `tables` four-player tables across `rounds`
 * hanchans such that:
 *   1. No two players share a table more than once (Social Golfer Problem, p = 4).
 *   2. Each player gets each starting seat (E/S/W/N) as evenly as possible.
 *   3. Players are spread across physical table numbers as evenly as possible.
 *
 * The original is an interactive CLI that can run unbounded. Because the table-number
 * optimisation may never converge for large fields, this port is bounded by a wall-clock
 * `timeLimitMs` and a seeded RNG so callers can generate several reproducible candidates
 * and let a moderator pick the best one.
 *
 * Players are referenced by their 0-based index into the caller's player array; the caller
 * maps indices back to user ids. Seats within a table are ordered EAST, SOUTH, WEST, NORTH.
 */

const PLAYERS_PER_TABLE = 4;

/** A single table: exactly four player indices in seat order [E, S, W, N]. */
export type SeatingTable = [number, number, number, number];
/** A round is an ordered list of tables (index in the list = physical table number). */
export type SeatingRound = SeatingTable[];

export interface SeatingCandidate {
    /** rounds[r][t] = the four player indices seated at table t in round r. */
    rounds: SeatingRound[];
    /** Lower is better. 0 = every player sat at a distinct table number every round. */
    tableSpreadScore: number;
    /** Lower is better. 0 = perfectly even seat-wind distribution. */
    seatBalanceScore: number;
}

export interface SeatingOptions {
    /** Number of four-player tables per round. */
    tables: number;
    /** Number of rounds (hanchans). */
    rounds: number;
    /** Wall-clock budget for the whole generation, in milliseconds. */
    timeLimitMs: number;
    /** Seed for the deterministic RNG. */
    seed: number;
}

export class SeatingGenerationError extends Error {}

/** Mulberry32 — small, fast, deterministic PRNG so candidates are reproducible by seed. */
class Rng {
    private state: number;

    constructor(seed: number) {
        // Avoid a zero state, which would make mulberry32 degenerate.
        this.state = (seed >>> 0) || 0x9e3779b9;
    }

    next(): number {
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(maxExclusive: number): number {
        return Math.floor(this.next() * maxExclusive);
    }

    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            const tmp = array[i]!;
            array[i] = array[j]!;
            array[j] = tmp;
        }
        return array;
    }
}

class Deadline {
    private readonly end: number;

    constructor(timeLimitMs: number) {
        this.end = Date.now() + timeLimitMs;
    }

    expired(): boolean {
        return Date.now() >= this.end;
    }
}

/**
 * Phase 1 — build `rounds` rounds of disjoint tables so that no pair of players ever
 * repeats. Mirrors the original `schedule`/`random_tables` backtracking search: greedily
 * lay down non-overlapping tables for a round, recurse, and on a dead end regenerate the
 * pool of still-allowed tables from the "remaining co-players" graph via clique expansion.
 */
function buildSchedule(playerCount: number, tables: number, rounds: number, rng: Rng, deadline: Deadline): SeatingRound[] | null {
    // The randomised DFS can hit a dead end on tight configurations (rounds near the pairing
    // maximum), so restart from a fresh state until one succeeds or the deadline passes. The
    // RNG keeps advancing across restarts, so each attempt explores a different ordering.
    while (!deadline.expired()) {
        const result = attemptSchedule(playerCount, tables, rounds, rng, deadline);
        if (result) return result;
    }
    return null;
}

function attemptSchedule(playerCount: number, tables: number, rounds: number, rng: Rng, deadline: Deadline): SeatingRound[] | null {
    // remaining[a] = set of players a may still be tabled with (the complete-graph edges left).
    const remaining: Set<number>[] = Array.from({ length: playerCount }, (_, a) => {
        const s = new Set<number>();
        for (let b = 0; b < playerCount; b++) {
            if (b !== a) s.add(b);
        }
        return s;
    });

    const allTables = (): number[][] => {
        const result: number[][] = [];
        const combo = (start: number, acc: number[]): void => {
            if (acc.length === PLAYERS_PER_TABLE) {
                result.push([...acc]);
                return;
            }
            for (let p = start; p < playerCount; p++) {
                acc.push(p);
                combo(p + 1, acc);
                acc.pop();
            }
        };
        combo(0, []);
        return result;
    };

    const pairAllowed = (table: number[]): boolean => {
        for (let i = 0; i < table.length; i++) {
            for (let j = i + 1; j < table.length; j++) {
                if (!remaining[table[i]!]!.has(table[j]!)) return false;
            }
        }
        return true;
    };

    // Pick `tables` mutually player-disjoint tables out of the candidate pool (backtracking).
    const pickRound = (pool: number[][]): SeatingTable[] | null => {
        const chosen: SeatingTable[] = [];
        const used = new Set<number>();

        const recurse = (startIdx: number): boolean => {
            if (chosen.length === tables) return true;
            if (deadline.expired()) return false;
            for (let i = startIdx; i < pool.length; i++) {
                const table = pool[i]!;
                if (table.some(p => used.has(p))) continue;
                for (const p of table) used.add(p);
                chosen.push([table[0]!, table[1]!, table[2]!, table[3]!]);
                if (recurse(i + 1)) return true;
                chosen.pop();
                for (const p of table) used.delete(p);
            }
            return false;
        };

        return recurse(0) ? chosen : null;
    };

    const schedule: SeatingRound[] = [];

    const recurseRounds = (): boolean => {
        if (schedule.length === rounds) return true;
        if (deadline.expired()) return false;

        // Rebuild the still-valid table pool from the remaining-coplayers graph and shuffle
        // it, so each attempt explores a different randomised ordering.
        const pool = rng.shuffle(allTables().filter(pairAllowed));

        const attempts = schedule.length < tables - 1 ? 10 : 1;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (deadline.expired()) return false;
            rng.shuffle(pool);
            const round = pickRound(pool);
            if (!round) continue;

            // Tentatively consume the pairs used this round, recurse, roll back on failure.
            const consumed: [number, number][] = [];
            for (const table of round) {
                for (let i = 0; i < table.length; i++) {
                    for (let j = i + 1; j < table.length; j++) {
                        const a = table[i]!;
                        const b = table[j]!;
                        remaining[a]!.delete(b);
                        remaining[b]!.delete(a);
                        consumed.push([a, b]);
                    }
                }
            }
            // Shuffle seat order within each table to randomise starting winds before phase 2.
            for (const table of round) rng.shuffle(table);
            schedule.push(round);

            if (recurseRounds()) return true;

            schedule.pop();
            for (const [a, b] of consumed) {
                remaining[a]!.add(b);
                remaining[b]!.add(a);
            }
        }
        return false;
    };

    return recurseRounds() ? schedule : null;
}

function exp3(n: number): number {
    return Math.pow(3, n);
}

/** Seat-balance penalty for one player's list of seat indices (0..3). Lower is better. */
function evalWinds(seatIndices: number[], rounds: number): number {
    const minRounds = Math.floor(rounds / 4);
    const maxRounds = Math.ceil(rounds / 4);
    const counts = [0, 0, 0, 0];
    for (const s of seatIndices) counts[s]!++;
    let score = 0;
    for (let i = 0; i < 4; i++) {
        if (counts[i]! < minRounds) score += exp3(minRounds - counts[i]!);
        else if (counts[i]! > maxRounds) score += exp3(counts[i]! - maxRounds);
    }
    return score;
}

function listWinds(schedule: SeatingRound[], player: number): number[] {
    const seats: number[] = [];
    for (const round of schedule) {
        for (const table of round) {
            const idx = table.indexOf(player);
            if (idx !== -1) {
                seats.push(idx);
                break;
            }
        }
    }
    return seats;
}

function totalSeatScore(schedule: SeatingRound[], playerCount: number, rounds: number): number {
    let sum = 0;
    for (let p = 0; p < playerCount; p++) {
        sum += evalWinds(listWinds(schedule, p), rounds);
    }
    return sum;
}

const SEAT_PERMUTATIONS_4: number[][] = (() => {
    const result: number[][] = [];
    const permute = (arr: number[], acc: number[]): void => {
        if (arr.length === 0) {
            result.push([...acc]);
            return;
        }
        for (let i = 0; i < arr.length; i++) {
            acc.push(arr[i]!);
            permute([...arr.slice(0, i), ...arr.slice(i + 1)], acc);
            acc.pop();
        }
    };
    permute([0, 1, 2, 3], []);
    return result;
})();

/**
 * Phase 2 — rearrange the seat order within tables so each player gets each starting wind
 * about equally. Greedy hill-climb mirroring the original `set_winds`: repeatedly re-seat
 * the worst-scoring table with its best permutation; on a stall, randomly reshuffle a table
 * to escape. Bounded by the deadline.
 */
function balanceSeats(schedule: SeatingRound[], playerCount: number, rounds: number, rng: Rng, deadline: Deadline): void {
    let sumOfScores = totalSeatScore(schedule, playerCount, rounds);

    while (sumOfScores > 0 && !deadline.expired()) {
        // Score every table by the summed penalty of its players, worst first.
        const tableScores: { r: number; t: number; score: number }[] = [];
        for (let r = 0; r < schedule.length; r++) {
            for (let t = 0; t < schedule[r]!.length; t++) {
                const table = schedule[r]![t]!;
                let score = 0;
                for (const player of table) score += evalWinds(listWinds(schedule, player), rounds);
                tableScores.push({ r, t, score });
            }
        }
        tableScores.sort((a, b) => a.score - b.score);

        let applied = false;
        for (const { r, t, score } of tableScores) {
            const table = schedule[r]![t]!;
            // Precompute each player's seat list so we can evaluate alternative seatings cheaply.
            const baseSeats = table.map(player => listWinds(schedule, player));
            const playerRoundIndex = table.map((_, k) => {
                // Position of round r within each player's seat list (players are all in round r here).
                let idx = 0;
                for (let rr = 0; rr < r; rr++) {
                    if (schedule[rr]!.some(tbl => tbl.includes(table[k]!))) idx++;
                }
                return idx;
            });

            let bestPerm: number[] | null = null;
            let bestImprovement = -1;
            for (const perm of SEAT_PERMUTATIONS_4) {
                let newScoreSum = 0;
                for (let k = 0; k < PLAYERS_PER_TABLE; k++) {
                    const seats = [...baseSeats[k]!];
                    seats[playerRoundIndex[k]!] = perm.indexOf(k);
                    newScoreSum += evalWinds(seats, rounds);
                }
                const improvement = score - newScoreSum;
                if (improvement > bestImprovement) {
                    bestImprovement = improvement;
                    bestPerm = perm;
                }
            }

            if (bestImprovement > 0 && bestPerm) {
                const original = [...table];
                const reseated = bestPerm.map(k => original[k]!) as SeatingTable;
                schedule[r]![t] = reseated;
                applied = true;
                break;
            }
        }

        if (!applied) {
            // Stalled: randomly reshuffle one table to perturb and try again.
            const r = rng.int(schedule.length);
            const t = rng.int(schedule[r]!.length);
            rng.shuffle(schedule[r]![t]!);
        }

        sumOfScores = totalSeatScore(schedule, playerCount, rounds);
    }
}

/** Table-spread penalty for one player's list of table numbers. Lower is better. */
function evalTables(tableNumbers: number[], tables: number, rounds: number): number {
    const minRounds = Math.floor(rounds / tables);
    const maxRounds = Math.ceil(rounds / tables);
    const counts = new Array<number>(tables).fill(0);
    for (const t of tableNumbers) counts[t]!++;
    let score = 0;
    for (let i = 0; i < tables; i++) {
        if (counts[i]! < minRounds) score += exp3(minRounds - counts[i]!);
        else if (counts[i]! > maxRounds) score += exp3(counts[i]! - maxRounds);
    }
    return score;
}

function listTables(schedule: SeatingRound[], player: number): number[] {
    const result: number[] = [];
    for (const round of schedule) {
        for (let t = 0; t < round.length; t++) {
            if (round[t]!.includes(player)) {
                result.push(t);
                break;
            }
        }
    }
    return result;
}

function totalTableScore(schedule: SeatingRound[], playerCount: number, tables: number, rounds: number): number {
    let sum = 0;
    for (let p = 0; p < playerCount; p++) {
        sum += evalTables(listTables(schedule, p), tables, rounds);
    }
    return sum;
}

/**
 * Phase 3 — reorder the tables within each round (a permutation of table numbers) to
 * minimise how often a player sits at the same physical table. Mirrors the original
 * `set_tables`/`improve`: hill-climb by swapping pairs of tables within a round, keeping the
 * best arrangement seen. Bounded by the deadline; returns the best schedule found.
 */
function optimiseTableNumbers(schedule: SeatingRound[], playerCount: number, tables: number, rounds: number, rng: Rng, deadline: Deadline): number {
    let current = totalTableScore(schedule, playerCount, tables, rounds);
    let best = current;
    let bestSnapshot = schedule.map(round => round.map(table => [...table] as SeatingTable));

    while (current > 0 && !deadline.expired()) {
        // Find the single best within-round table swap.
        let bestChange = 0;
        let bestMove: { r: number; a: number; b: number } | null = null;
        for (let r = 0; r < schedule.length && !deadline.expired(); r++) {
            const round = schedule[r]!;
            for (let a = 0; a < round.length; a++) {
                for (let b = a + 1; b < round.length; b++) {
                    const tmp = round[a]!;
                    round[a] = round[b]!;
                    round[b] = tmp;
                    const candidate = totalTableScore(schedule, playerCount, tables, rounds);
                    round[b] = round[a]!;
                    round[a] = tmp;
                    const change = current - candidate;
                    if (change > bestChange) {
                        bestChange = change;
                        bestMove = { r, a, b };
                    }
                }
            }
        }

        if (bestMove) {
            const round = schedule[bestMove.r]!;
            const tmp = round[bestMove.a]!;
            round[bestMove.a] = round[bestMove.b]!;
            round[bestMove.b] = tmp;
        } else {
            // Local minimum: perturb by random swaps to escape.
            for (let i = 0; i < rounds; i++) {
                const r = rng.int(schedule.length);
                const round = schedule[r]!;
                if (round.length < 2) continue;
                const a = rng.int(round.length);
                let b = rng.int(round.length);
                if (a === b) b = (b + 1) % round.length;
                const tmp = round[a]!;
                round[a] = round[b]!;
                round[b] = tmp;
            }
        }

        current = totalTableScore(schedule, playerCount, tables, rounds);
        if (current < best) {
            best = current;
            bestSnapshot = schedule.map(round => round.map(table => [...table] as SeatingTable));
        }
    }

    // Restore the best arrangement we saw (the loop may have wandered away from it).
    for (let r = 0; r < schedule.length; r++) {
        for (let t = 0; t < schedule[r]!.length; t++) {
            schedule[r]![t] = bestSnapshot[r]![t]!;
        }
    }
    return best;
}

/**
 * Maximum number of no-repeat rounds achievable for a given table count. Each round a player
 * meets 3 new opponents, and a group of 4 can include at most one player from each previous
 * group, so the pool of `4*tables - 1` possible opponents caps the rounds at
 * floor((4*tables - 1) / 3). For 3 tables this is 3, but the stricter "one-per-previous-group"
 * constraint means 3 tables in fact only supports 1 round; 4+ tables follow the formula in
 * practice. We use the pairing bound as a cheap necessary (not sufficient) feasibility check.
 */
export function maxFeasibleRounds(tables: number): number {
    if (tables < 1) return 0;
    if (tables < 4) return 1;
    return Math.floor((PLAYERS_PER_TABLE * tables - 1) / (PLAYERS_PER_TABLE - 1));
}

/**
 * Generate a single seating candidate for the given options. Throws SeatingGenerationError
 * if the configuration is infeasible, or if a no-repeat schedule cannot be found within the
 * time budget.
 */
export function generateSeatingCandidate(options: SeatingOptions): SeatingCandidate {
    const { tables, rounds, timeLimitMs, seed } = options;

    if (rounds > maxFeasibleRounds(tables)) {
        throw new SeatingGenerationError(
            `${rounds} rounds is not achievable without pair repeats for ${tables} tables ` +
            `(maximum is ${maxFeasibleRounds(tables)})`
        );
    }

    const playerCount = tables * PLAYERS_PER_TABLE;
    const rng = new Rng(seed);
    const deadline = new Deadline(timeLimitMs);

    const schedule = buildSchedule(playerCount, tables, rounds, rng, deadline);
    if (!schedule) {
        throw new SeatingGenerationError(
            `Could not build a no-repeat schedule for ${tables} tables over ${rounds} rounds within the time limit`
        );
    }

    balanceSeats(schedule, playerCount, rounds, rng, deadline);
    const tableSpreadScore = optimiseTableNumbers(schedule, playerCount, tables, rounds, rng, deadline);
    const seatBalanceScore = totalSeatScore(schedule, playerCount, rounds);

    return { rounds: schedule, tableSpreadScore, seatBalanceScore };
}

/**
 * Generate up to `candidateCount` candidates (each from a distinct derived seed) and return
 * them sorted best-first by table spread then seat balance, so a moderator can compare and
 * choose. The total wall-clock budget is split across candidates. At least one successful
 * candidate is required, otherwise SeatingGenerationError is thrown.
 */
export function generateSeatingCandidates(
    options: SeatingOptions & { candidateCount: number }
): SeatingCandidate[] {
    const { candidateCount, timeLimitMs, seed } = options;
    const perCandidateBudget = Math.max(1, Math.floor(timeLimitMs / Math.max(1, candidateCount)));

    const candidates: SeatingCandidate[] = [];
    let lastError: unknown = null;
    for (let i = 0; i < candidateCount; i++) {
        try {
            candidates.push(
                generateSeatingCandidate({ ...options, timeLimitMs: perCandidateBudget, seed: seed + i * 7919 })
            );
        } catch (error) {
            lastError = error;
        }
    }

    if (candidates.length === 0) {
        if (lastError instanceof SeatingGenerationError) throw lastError;
        throw new SeatingGenerationError('Failed to generate any seating candidate');
    }

    candidates.sort((a, b) =>
        a.tableSpreadScore !== b.tableSpreadScore
            ? a.tableSpreadScore - b.tableSpreadScore
            : a.seatBalanceScore - b.seatBalanceScore
    );
    return candidates;
}
