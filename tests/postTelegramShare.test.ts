// Imported first so the DB layer bootstraps the way every other suite does -
// PostService pulls in repositories that open the database at import time.
import { jest } from '@jest/globals';
import './testHelpers.ts';
import { PostService } from '../src/service/PostService.ts';
import telegramMessageService from '../src/service/TelegramMessageService.ts';

// A post carrying a game belongs with the rest of the game traffic (RATING);
// anything else goes where the polls are (MAIN).
const RATING_TOPIC = { type: 'RATING' as const, chatId: -100, topicId: 11 };
const MAIN_TOPIC = { type: 'MAIN' as const, chatId: -100, topicId: 22 };

const flush = () => new Promise(resolve => setImmediate(resolve));

function buildService(overrides: {
    topics?: unknown;
    post?: Record<string, unknown>;
} = {}) {
    const created = {
        id: 5,
        clubId: 3,
        gameId: null,
        images: [{ url: 'https://example.com/a.jpg' }],
        text: null,
        ...overrides.post,
    };

    const postRepository = {
        createPost: jest.fn(() => 5),
        findPostById: jest.fn(() => created),
    } as never;
    const clubRepository = {
        findClubById: jest.fn(() => ({ id: 3, name: 'Japan Dojo', country: 'UA' })),
        getClubTelegramTopics: jest.fn(() => (
            'topics' in overrides ? overrides.topics : { rating: RATING_TOPIC, main: MAIN_TOPIC }
        )),
    } as never;
    const gameRepository = {
        findGameById: jest.fn(() => ({ id: 9 })),
        findGamePlayersByGameId: jest.fn(() => [{ userId: 1 }]),
        findGameRoundsByGameId: jest.fn(() => [{ roundNumber: 1 }]),
    } as never;
    const userRepository = {
        findUserById: jest.fn(() => ({ id: 1, name: 'Ihor S' })),
    } as never;

    return new PostService(postRepository, clubRepository, {} as never, gameRepository, userRepository);
}

describe('sharing a post to Telegram', () => {
    let sendPhotos: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        sendPhotos = jest.spyOn(telegramMessageService, 'sendPhotos').mockResolvedValue(undefined) as never;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not touch Telegram unless the author asked for it', async () => {
        const service = buildService();
        service.createPost(1, { images: [{ url: 'https://example.com/a.jpg' }], clubId: 3 });
        await flush();
        expect(sendPhotos).not.toHaveBeenCalled();
    });

    it('sends a game-linked post to the club RATING topic', async () => {
        const service = buildService({ post: { gameId: 9 } });
        service.createPost(1, {
            images: [{ url: 'https://example.com/a.jpg' }],
            clubId: 3,
            gameId: 9,
            shareToTelegram: true,
        });
        await flush();
        expect(sendPhotos).toHaveBeenCalledTimes(1);
        expect(sendPhotos.mock.calls[0]![2]).toEqual(RATING_TOPIC);
    });

    it('sends a plain profile post to the club MAIN topic', async () => {
        const service = buildService();
        service.createPost(1, {
            images: [{ url: 'https://example.com/a.jpg' }],
            clubId: 3,
            shareToTelegram: true,
        });
        await flush();
        expect(sendPhotos).toHaveBeenCalledTimes(1);
        expect(sendPhotos.mock.calls[0]![2]).toEqual(MAIN_TOPIC);
    });

    it('passes every image through, up to the four a post can hold', async () => {
        const images = [1, 2, 3, 4].map(n => ({ url: `https://example.com/${n}.jpg` }));
        const service = buildService({ post: { images } });
        service.createPost(1, { images, clubId: 3, shareToTelegram: true });
        await flush();
        expect(sendPhotos.mock.calls[0]![0]).toEqual(images.map(i => i.url));
    });

    it('captions the album with a link to the author and the post text', async () => {
        const service = buildService({ post: { text: 'Рон на останньому тайлі' } });
        service.createPost(1, {
            images: [{ url: 'https://example.com/a.jpg' }],
            clubId: 3,
            text: 'Рон на останньому тайлі',
            shareToTelegram: true,
        });
        await flush();
        const caption = sendPhotos.mock.calls[0]![1] as string;
        expect(caption).toContain('startapp=user_1');
        expect(caption).toContain('Ihor S');
        expect(caption).toContain('Рон на останньому тайлі');
    });

    // The caption is sent as HTML, so user text must not be able to inject tags.
    it('escapes a caption that contains markup', async () => {
        const service = buildService({ post: { text: '<b>not bold</b>' } });
        service.createPost(1, {
            images: [{ url: 'https://example.com/a.jpg' }],
            clubId: 3,
            text: '<b>not bold</b>',
            shareToTelegram: true,
        });
        await flush();
        const caption = sendPhotos.mock.calls[0]![1] as string;
        expect(caption).toContain('&lt;b&gt;not bold&lt;/b&gt;');
        expect(caption).not.toContain('<b>not bold</b>');
    });

    it('skips a post with no club, which has no group to publish to', async () => {
        const service = buildService({ post: { clubId: null } });
        service.createPost(1, { images: [{ url: 'https://example.com/a.jpg' }], shareToTelegram: true });
        await flush();
        expect(sendPhotos).not.toHaveBeenCalled();
    });

    it('skips silently when the club has no matching topic configured', async () => {
        const service = buildService({ topics: { rating: null, main: null } });
        service.createPost(1, {
            images: [{ url: 'https://example.com/a.jpg' }],
            clubId: 3,
            shareToTelegram: true,
        });
        await flush();
        expect(sendPhotos).not.toHaveBeenCalled();
    });
});
