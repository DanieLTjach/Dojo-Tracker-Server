import type { UserPlacementEntry, UserPlacementHistoryResponse } from '../model/PlacementModels.ts';
import { PlacementHistoryRepository } from '../repository/PlacementHistoryRepository.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { UserNotFoundById } from '../error/UserErrors.ts';
import { RatingService } from './RatingService.ts';

export class PlacementHistoryService {
    private placementHistoryRepository: PlacementHistoryRepository;
    private ratingService: RatingService;
    private userRepository: UserRepository;

    constructor(
        placementHistoryRepository = new PlacementHistoryRepository(),
        ratingService = new RatingService(),
        userRepository = new UserRepository()
    ) {
        this.placementHistoryRepository = placementHistoryRepository;
        this.ratingService = ratingService;
        this.userRepository = userRepository;
    }

    getUserPlacementHistory(userId: number): UserPlacementHistoryResponse {
        const user = this.userRepository.findUserById(userId);
        if (!user) {
            throw new UserNotFoundById(userId);
        }

        const events = this.placementHistoryRepository.findEventsPlayedByUser(userId);

        const tournaments: UserPlacementEntry[] = [];
        const seasons: UserPlacementEntry[] = [];

        for (const event of events) {
            // Reuses RatingService.calculateStandings(eventId) — O(events played) queries
            const standingsMap = this.ratingService.calculateStandings(event.eventId);
            const rawPlace = standingsMap.get(userId) ?? null;
            const meetsMinGames = event.gamesPlayed >= event.minimumGamesForRating;
            const place = meetsMinGames ? rawPlace : null;

            const entry: UserPlacementEntry = {
                eventId: event.eventId,
                eventName: event.eventName,
                eventType: event.eventType,
                clubId: event.clubId,
                clubName: event.clubName,
                dateFrom: event.dateFrom ?? event.createdAt,
                dateTo: event.dateTo ?? event.createdAt,
                place,
                totalRankedPlayers: standingsMap.size,
                gamesPlayed: event.gamesPlayed,
                rating: event.rating,
                minimumGamesPlayed: meetsMinGames,
            };

            if (event.eventType === 'TOURNAMENT') {
                tournaments.push(entry);
            } else {
                seasons.push(entry);
            }
        }

        return {
            userId,
            tournaments,
            seasons,
        };
    }
}
