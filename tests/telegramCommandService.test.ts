import { Context, Telegram } from 'telegraf';
import type { Update, UserFromGetMe } from 'telegraf/types';
import { attachLocale } from '../src/service/TelegramCommandService.ts';

describe('TelegramCommandService locale context', () => {
    test('adds locale without stripping Telegraf context methods', () => {
        const update = {
            update_id: 1,
            message: {
                message_id: 1,
                date: 0,
                chat: { id: 1, type: 'private' },
                from: { id: 1, is_bot: false, first_name: 'Test' },
                text: '/help',
            },
        } as Update;
        const botInfo = {
            id: 1,
            is_bot: true,
            first_name: 'Test Bot',
            username: 'test_bot',
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
        } satisfies UserFromGetMe;
        const ctx = new Context(update, new Telegram('test-token'), botInfo);

        const localizedCtx = attachLocale(ctx, 'en');

        expect(localizedCtx).toBe(ctx);
        expect(localizedCtx.locale).toBe('en');
        expect(typeof localizedCtx.reply).toBe('function');
        expect(typeof localizedCtx.deleteMessage).toBe('function');
    });
});
