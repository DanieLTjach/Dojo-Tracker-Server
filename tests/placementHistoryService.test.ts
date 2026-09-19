import { PlacementHistoryService } from '../src/service/PlacementHistoryService.ts';
import { UserNotFoundById } from '../src/error/UserErrors.ts';
import { RATING_TO_POINTS_COEFFICIENT } from '../src/model/RatingModels.ts';
import type { UserEventHistoryItem } from '../src/repository/PlacementHistoryRepository.ts';

const USER_ID = 7;

function historyItem(overrides: Partial<UserEventHistoryItem> = {}): UserEventHistoryItem {
    return {
        eventId: 1,
        eventName: 'Spring Season',
        eventType: 'SEASON',
        clubId: 1,
        clubName: 'Japan Dojo',
        dateFrom: new Date('2025-01-01T00:00:00.000Z'),
        dateTo: new Date('2025-06-01T00:00:00.000Z'),
        createdAt: new Date('2024-12-01T00:00:00.000Z'),
        minimumGamesForRating: 0,
        gamesPlayed: 10,
        wins: 3,
        rating: 1500,
        ...overrides,
    } as UserEventHistoryItem;
}

/**
 * The service takes its collaborators through the constructor, so these cases
 * drive it with fixed rows instead of a database: what is under test is the
 * shaping of a player's history, not the SQL that fetches it.
 */
function buildService(
    events: UserEventHistoryItem[],
    standings: Map<number, Map<number, number>> = new Map(),
    userExists = true
) {
    const placementHistoryRepository = {
        findEventsPlayedByUser: () => events,
    } as any;
    const ratingService = {
        calculateStandings: (eventId: number) => standings.get(eventId) ?? new Map<number, number>(),
    } as any;
    const userRepository = {
        findUserById: () => (userExists ? { id: USER_ID, name: 'Player' } : undefined),
    } as any;

    return new PlacementHistoryService(placementHistoryRepository, ratingService, userRepository);
}

describe('PlacementHistoryService', () => {
    it('rejects an unknown user rather than returning an empty history', () => {
        const service = buildService([], new Map(), false);
        expect(() => service.getUserPlacementHistory(USER_ID)).toThrow(UserNotFoundById);
    });

    it('returns an empty history for a user who has played nothing', () => {
        const result = buildService([]).getUserPlacementHistory(USER_ID);

        expect(result).toEqual({ userId: USER_ID, gamesPlayed: 0, wins: 0, tournaments: [], seasons: [] });
    });

    it('splits tournaments from seasons', () => {
        const service = buildService([
            historyItem({ eventId: 1, eventType: 'SEASON', eventName: 'Season A' }),
            historyItem({ eventId: 2, eventType: 'TOURNAMENT', eventName: 'Cup B' }),
            historyItem({ eventId: 3, eventType: 'TOURNAMENT', eventName: 'Cup C' }),
        ]);

        const result = service.getUserPlacementHistory(USER_ID);

        expect(result.seasons.map(e => e.eventName)).toEqual(['Season A']);
        expect(result.tournaments.map(e => e.eventName)).toEqual(['Cup B', 'Cup C']);
    });

    it('totals games and wins across every event', () => {
        const service = buildService([
            historyItem({ eventId: 1, gamesPlayed: 10, wins: 3 }),
            historyItem({ eventId: 2, gamesPlayed: 4, wins: 1 }),
        ]);

        const result = service.getUserPlacementHistory(USER_ID);

        expect(result.gamesPlayed).toBe(14);
        expect(result.wins).toBe(4);
    });

    it('takes the place from the standings for the matching event', () => {
        const standings = new Map([
            [1, new Map([[USER_ID, 2], [99, 1]])],
            [2, new Map([[USER_ID, 5], [99, 1]])],
        ]);
        const service = buildService(
            [historyItem({ eventId: 1 }), historyItem({ eventId: 2 })],
            standings
        );

        const places = service.getUserPlacementHistory(USER_ID).seasons.map(e => e.place);
        expect(places).toEqual([2, 5]);
    });

    it('withholds the place until the event minimum is met', () => {
        // A player below the minimum is unranked, not last: showing a place
        // would claim a standing the event does not actually award them.
        const standings = new Map([[1, new Map([[USER_ID, 3]])]]);
        const service = buildService(
            [historyItem({ eventId: 1, gamesPlayed: 2, minimumGamesForRating: 5 })],
            standings
        );

        const entry = service.getUserPlacementHistory(USER_ID).seasons[0]!;
        expect(entry.place).toBeNull();
        expect(entry.minimumGamesPlayed).toBe(false);
        // The games still count toward the career total even unranked.
        expect(service.getUserPlacementHistory(USER_ID).gamesPlayed).toBe(2);
    });

    it('gives the place once the player reaches exactly the minimum', () => {
        const standings = new Map([[1, new Map([[USER_ID, 3]])]]);
        const service = buildService(
            [historyItem({ eventId: 1, gamesPlayed: 5, minimumGamesForRating: 5 })],
            standings
        );

        const entry = service.getUserPlacementHistory(USER_ID).seasons[0]!;
        expect(entry.place).toBe(3);
        expect(entry.minimumGamesPlayed).toBe(true);
    });

    it('reports a null place when the standings do not rank the player at all', () => {
        const service = buildService([historyItem({ eventId: 1 })], new Map([[1, new Map([[99, 1]])]]));

        const entry = service.getUserPlacementHistory(USER_ID).seasons[0]!;
        expect(entry.place).toBeNull();
        expect(entry.totalRankedPlayers).toBe(1);
    });

    it('scales the rating out of point units', () => {
        const service = buildService([historyItem({ eventId: 1, rating: 1750 })]);

        expect(service.getUserPlacementHistory(USER_ID).seasons[0]!.rating)
            .toBe(1750 / RATING_TO_POINTS_COEFFICIENT);
    });

    it('falls back through dateFrom to createdAt when an event has no dates', () => {
        const createdAt = new Date('2024-12-01T00:00:00.000Z');
        const service = buildService([
            historyItem({ eventId: 1, dateFrom: null, dateTo: null, createdAt }),
        ]);

        const entry = service.getUserPlacementHistory(USER_ID).seasons[0]!;
        expect(entry.dateFrom).toBe(createdAt);
        expect(entry.dateTo).toBe(createdAt);
    });

    it('uses dateFrom as the end date for an event that has no end', () => {
        const dateFrom = new Date('2025-02-01T00:00:00.000Z');
        const service = buildService([historyItem({ eventId: 1, dateFrom, dateTo: null })]);

        expect(service.getUserPlacementHistory(USER_ID).seasons[0]!.dateTo).toBe(dateFrom);
    });
});
