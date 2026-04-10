import PollSchedulerService, { getNextDayOfWeek, formatDayName } from '../src/service/PollSchedulerService.ts';
import type { ClubPollConfig } from '../src/model/PollModels.ts';

function makeConfig(overrides: Partial<ClubPollConfig> = {}): ClubPollConfig {
    return {
        clubId: 1,
        pollTitle: 'Japan Dojo',
        eventDays: [3, 5],
        sendDay: 1,
        sendTime: '10:00',
        extraOptions: ['Результати 👀'],
        isActive: true,
        ...overrides
    };
}

describe('getNextDayOfWeek', () => {
    // Wednesday 2026-04-08
    const wednesday = new Date(2026, 3, 8);

    test('same day returns today', () => {
        const result = getNextDayOfWeek(wednesday, 3); // Wednesday
        expect(result.getDate()).toBe(8);
        expect(result.getMonth()).toBe(3);
    });

    test('future day in same week', () => {
        const result = getNextDayOfWeek(wednesday, 5); // Friday
        expect(result.getDate()).toBe(10);
        expect(result.getMonth()).toBe(3);
    });

    test('past day wraps to next week', () => {
        const result = getNextDayOfWeek(wednesday, 1); // Monday -> next week
        expect(result.getDate()).toBe(13);
        expect(result.getMonth()).toBe(3);
    });

    test('Sunday from Wednesday is +4 days', () => {
        const result = getNextDayOfWeek(wednesday, 0); // Sunday
        expect(result.getDate()).toBe(12);
    });

    test('Saturday from Sunday wraps correctly', () => {
        const sunday = new Date(2026, 3, 12); // Sunday
        const result = getNextDayOfWeek(sunday, 6); // Saturday -> next week
        expect(result.getDate()).toBe(18);
    });

    test('does not mutate the input date', () => {
        const original = new Date(2026, 3, 8);
        const originalTime = original.getTime();
        getNextDayOfWeek(original, 5);
        expect(original.getTime()).toBe(originalTime);
    });
});

describe('buildPollTitle', () => {
    test('same-month dates show condensed format', () => {
        // Wednesday 2026-04-08, eventDays Wed(3) + Fri(5) -> Apr 8, Apr 10
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3, 5] });

        const title = PollSchedulerService.buildPollTitle(config, now);

        expect(title).toBe('🀄 Маджонг 8, 10 квітня');
    });

    test('cross-month dates show full format for each date', () => {
        // Monday 2026-03-30, eventDays Mon(1) + Fri(5) -> Mar 30, Apr 3
        const now = new Date(2026, 2, 30);
        const config = makeConfig({ eventDays: [1, 5] });

        const title = PollSchedulerService.buildPollTitle(config, now);

        expect(title).toBe('🀄 Маджонг 30 березня, 3 квітня');
    });

    test('single event day', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5] }); // Friday only

        const title = PollSchedulerService.buildPollTitle(config, now);

        expect(title).toBe('🀄 Маджонг 10 квітня');
    });

    test('event days are sorted chronologically regardless of input order', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5, 3] }); // Fri, Wed (reversed)

        const title = PollSchedulerService.buildPollTitle(config, now);

        // Should still show Wed(8) before Fri(10)
        expect(title).toBe('🀄 Маджонг 8, 10 квітня');
    });
});

describe('buildPollOptions', () => {
    test('options are sorted by next occurrence', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5, 3], extraOptions: [] }); // Fri, Wed

        const options = PollSchedulerService.buildPollOptions(config, now);

        // Wed(today) comes before Fri(+2 days)
        expect(options).toEqual(['Середа', 'П\u02BCятниця']);
    });

    test('extra options are appended after day names', () => {
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3], extraOptions: ['Результати 👀', 'У цей раз я пас'] });

        const options = PollSchedulerService.buildPollOptions(config, now);

        expect(options).toEqual(['Середа', 'Результати 👀', 'У цей раз я пас']);
    });

    test('empty extra options', () => {
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3, 5], extraOptions: [] });

        const options = PollSchedulerService.buildPollOptions(config, now);

        expect(options).toEqual(['Середа', 'П\u02BCятниця']);
    });
});

describe('formatDayName', () => {
    test('capitalizes the first letter', () => {
        const wednesday = new Date(2026, 3, 8);
        const name = formatDayName(wednesday);
        expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
        expect(name).toBe('Середа');
    });
});
