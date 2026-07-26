import type { EventConfig } from '../model/EventModels.ts';
import { TimerStatus, type Game, type GameTimer } from '../model/GameModels.ts';
import type { Tournament } from '../model/TournamentModels.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';

type TimerGame = Pick<Game, 'tournamentRound'>;

interface TimerEvent {
    config: Pick<EventConfig, 'roundDurationSec'> | null;
    tournament: Pick<Tournament, 'status' | 'currentRound' | 'currentRoundStartedAt'> | null;
}

export function computeTournamentGameTimer(
    game: TimerGame,
    event: TimerEvent,
    serverNow: Date = new Date()
): GameTimer {
    const durationSec = event.config?.roundDurationSec ?? 0;
    const tournament = event.tournament;
    if (
        durationSec <= 0 ||
        tournament === null ||
        tournament.status === TournamentStatus.FINISHED ||
        tournament.currentRoundStartedAt === null ||
        game.tournamentRound === null ||
        game.tournamentRound !== tournament.currentRound
    ) {
        return {
            status: TimerStatus.STOPPED,
            durationSec,
            remainingSec: durationSec,
            serverNow,
        };
    }

    const elapsedSec = Math.floor(
        Math.max(
            0,
            serverNow.getTime() - tournament.currentRoundStartedAt.getTime()
        ) / 1000
    );
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    return {
        status: remainingSec > 0 ? TimerStatus.RUNNING : TimerStatus.EXPIRED,
        durationSec,
        remainingSec,
        serverNow,
    };
}
