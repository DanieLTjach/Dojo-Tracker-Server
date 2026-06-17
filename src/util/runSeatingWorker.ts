import { Worker } from 'node:worker_threads';
import { SeatingGenerationError, type SeatingCandidate } from './SeatingGeneratorUtil.ts';
import type { SeatingWorkerInput, SeatingWorkerOutput } from './seatingWorker.ts';

const WORKER_URL = new URL('./seatingWorker.ts', import.meta.url);

/**
 * Run seating generation in a worker thread so the CPU-bound work does not block the main
 * event loop. Resolves with the candidates or rejects with the original error type so callers
 * can map SeatingGenerationError to a friendly response.
 */
export function runSeatingWorker(input: SeatingWorkerInput): Promise<SeatingCandidate[]> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_URL, { workerData: input });

        worker.once('message', (output: SeatingWorkerOutput) => {
            if (output.ok) {
                resolve(output.candidates);
            } else if (output.generationError) {
                reject(new SeatingGenerationError(output.message));
            } else {
                reject(new Error(output.message));
            }
            void worker.terminate();
        });

        worker.once('error', error => {
            reject(error);
            void worker.terminate();
        });
    });
}
