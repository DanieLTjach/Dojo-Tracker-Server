import { TimerStatus } from '../src/model/GameModels.ts';
import { computeTournamentGameTimer } from '../src/util/TournamentTimerUtil.ts';

const serverNow = new Date('2026-07-26T12:30:00.000Z');

function timerFor({
    durationSec = 3600,
    gameRound = 2,
    currentRound = 2,
    startedAt = new Date('2026-07-26T12:00:00.000Z'),
}: {
    durationSec?: number | null | undefined;
    gameRound?: number | null | undefined;
    currentRound?: number | null | undefined;
    startedAt?: Date | null | undefined;
} = {}) {
    return computeTournamentGameTimer(
        { tournamentRound: gameRound },
        {
            tournament: {
                currentRound,
                currentRoundStartedAt: startedAt,
                roundDurationSec: durationSec ?? null,
                status: 'IN_PROGRESS',
            },
        },
        serverNow
    );
}

describe('computeTournamentGameTimer', () => {
    test('returns the remaining whole seconds for the active tournament round', () => {
        expect(timerFor()).toEqual({
            status: TimerStatus.RUNNING,
            durationSec: 3600,
            remainingSec: 1800,
            serverNow: serverNow.toISOString(),
        });
    });

    test('expires at zero instead of returning a negative duration', () => {
        expect(timerFor({ durationSec: 1200 })).toEqual({
            status: TimerStatus.EXPIRED,
            durationSec: 1200,
            remainingSec: 0,
            serverNow: serverNow.toISOString(),
        });
    });

    test('stops a configured timer until its game round is current', () => {
        expect(timerFor({ gameRound: 3 })).toEqual({
            status: TimerStatus.STOPPED,
            durationSec: 3600,
            remainingSec: 3600,
            serverNow: serverNow.toISOString(),
        });
    });

    test('returns a zero-duration stopped timer when the event has no timer configuration', () => {
        expect(timerFor({ durationSec: null })).toEqual({
            status: TimerStatus.STOPPED,
            durationSec: 0,
            remainingSec: 0,
            serverNow: serverNow.toISOString(),
        });
    });
});
