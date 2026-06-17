/**
 * Worker-thread entry point for tournament seating generation.
 *
 * Seating generation is CPU-bound and runs for up to several seconds, which would block the
 * Node.js event loop (and make the whole server unresponsive) if done on the main thread.
 * Running it here keeps the server responsive while a moderator waits for candidates.
 *
 * The worker receives generation options via `workerData`, runs the (synchronous) generator,
 * and posts back either the candidates or a structured error the main thread can re-throw.
 */
import { parentPort, workerData } from 'node:worker_threads';
import {
    generateSeatingCandidates,
    SeatingGenerationError,
    type SeatingCandidate,
    type SeatingOptions,
} from './SeatingGeneratorUtil.ts';

export type SeatingWorkerInput = SeatingOptions & { candidateCount: number };

export type SeatingWorkerOutput =
    | { ok: true, candidates: SeatingCandidate[] }
    | { ok: false, generationError: boolean, message: string };

const input = workerData as SeatingWorkerInput;

let output: SeatingWorkerOutput;
try {
    output = { ok: true, candidates: generateSeatingCandidates(input) };
} catch (error) {
    output = {
        ok: false,
        generationError: error instanceof SeatingGenerationError,
        message: error instanceof Error ? error.message : String(error),
    };
}

parentPort!.postMessage(output);
