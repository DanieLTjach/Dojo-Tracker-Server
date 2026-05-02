import { updateClubTelegramTopic, unsetClubTelegramTopic } from '../src/service/ClubService.ts';
import { ClubTelegramTopicType } from '../src/model/TelegramTopic.ts';
import type { ClubTelegramTopics } from '../src/model/ClubModels.ts';

describe('ClubService Helpers', () => {
    const initialTopics: ClubTelegramTopics = {
        rating: null,
        userLogs: null,
        gameLogs: null,
        clubLogs: null,
        main: null,
    };

    describe('updateClubTelegramTopic', () => {
        it('updates the specified topic type', () => {
            const chatId = 123;
            const topicId = 456;
            const updated = updateClubTelegramTopic(initialTopics, ClubTelegramTopicType.RATING, chatId, topicId);

            expect(updated.rating).toEqual({
                type: ClubTelegramTopicType.RATING,
                chatId,
                topicId,
            });
            expect(updated.userLogs).toBeNull();
        });

        it('updates MAIN topic without topicId', () => {
            const chatId = 789;
            const updated = updateClubTelegramTopic(initialTopics, ClubTelegramTopicType.MAIN, chatId, undefined);

            expect(updated.main).toEqual({
                type: ClubTelegramTopicType.MAIN,
                chatId,
                topicId: undefined,
            });
        });
    });

    describe('unsetClubTelegramTopic', () => {
        const setTopics: ClubTelegramTopics = {
            rating: { type: ClubTelegramTopicType.RATING, chatId: 1, topicId: 10 },
            userLogs: { type: ClubTelegramTopicType.USER_LOGS, chatId: 2, topicId: 20 },
            gameLogs: { type: ClubTelegramTopicType.GAME_LOGS, chatId: 3, topicId: 30 },
            clubLogs: { type: ClubTelegramTopicType.CLUB_LOGS, chatId: 4, topicId: 40 },
            main: { type: ClubTelegramTopicType.MAIN, chatId: 5, topicId: 50 },
        };

        it('unsets RATING topic', () => {
            const updated = unsetClubTelegramTopic(setTopics, ClubTelegramTopicType.RATING);
            expect(updated.rating).toBeNull();
            expect(updated.userLogs).not.toBeNull();
        });

        it('unsets USER_LOGS topic', () => {
            const updated = unsetClubTelegramTopic(setTopics, ClubTelegramTopicType.USER_LOGS);
            expect(updated.userLogs).toBeNull();
        });

        it('unsets GAME_LOGS topic', () => {
            const updated = unsetClubTelegramTopic(setTopics, ClubTelegramTopicType.GAME_LOGS);
            expect(updated.gameLogs).toBeNull();
        });

        it('unsets CLUB_LOGS topic', () => {
            const updated = unsetClubTelegramTopic(setTopics, ClubTelegramTopicType.CLUB_LOGS);
            expect(updated.clubLogs).toBeNull();
        });

        it('unsets MAIN topic', () => {
            const updated = unsetClubTelegramTopic(setTopics, ClubTelegramTopicType.MAIN);
            expect(updated.main).toBeNull();
        });
    });
});
