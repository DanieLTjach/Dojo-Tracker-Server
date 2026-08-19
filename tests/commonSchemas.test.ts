import {
    boundedTextSchema,
    discordHandleSchema,
    gameAccountSchema,
    imageUrlSchema,
    tenhouIdSchema,
} from '../src/schema/CommonSchemas.ts';

describe('CommonSchemas', () => {
    describe('imageUrlSchema', () => {
        test('accepts valid https URLs including Firebase storage URLs', () => {
            const firebase =
                'https://firebasestorage.googleapis.com/v0/b/dojo-tracker.appspot.com/o/avatars%2F123.jpg?alt=media';
            const standard = 'https://example.com/avatar.png';

            expect(imageUrlSchema.safeParse(firebase)).toEqual({
                success: true,
                data: firebase,
            });
            expect(imageUrlSchema.safeParse(standard)).toEqual({
                success: true,
                data: standard,
            });
        });

        test('trims whitespace', () => {
            const result = imageUrlSchema.safeParse('  https://example.com/avatar.png  ');
            expect(result).toEqual({
                success: true,
                data: 'https://example.com/avatar.png',
            });
        });

        test('rejects http URLs', () => {
            const result = imageUrlSchema.safeParse('http://example.com/avatar.png');
            expect(result.success).toBe(false);
        });

        test('rejects dangerous protocols (javascript, data, vbscript)', () => {
            expect(imageUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
            expect(imageUrlSchema.safeParse('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==').success).toBe(
                false
            );
            expect(imageUrlSchema.safeParse('vbscript:msgbox(1)').success).toBe(false);
        });

        test('rejects empty string and invalid URLs', () => {
            expect(imageUrlSchema.safeParse('').success).toBe(false);
            expect(imageUrlSchema.safeParse('not-a-url').success).toBe(false);
            expect(imageUrlSchema.safeParse('https://').success).toBe(false);
        });

        test('enforces 2048 character limit', () => {
            const exact2048 = 'https://example.com/' + 'a'.repeat(2048 - 20);
            expect(exact2048.length).toBe(2048);
            expect(imageUrlSchema.safeParse(exact2048).success).toBe(true);

            const over2048 = 'https://example.com/' + 'a'.repeat(2049 - 20);
            expect(over2048.length).toBe(2049);
            expect(imageUrlSchema.safeParse(over2048).success).toBe(false);
        });
    });

    describe('boundedTextSchema', () => {
        const schema = boundedTextSchema(10);

        test('accepts valid strings up to max length', () => {
            expect(schema.safeParse('hello')).toEqual({ success: true, data: 'hello' });
            expect(schema.safeParse('1234567890')).toEqual({ success: true, data: '1234567890' });
        });

        test('trims whitespace', () => {
            expect(schema.safeParse('  test  ')).toEqual({ success: true, data: 'test' });
        });

        test('accepts null and undefined', () => {
            expect(schema.safeParse(null)).toEqual({ success: true, data: null });
            expect(schema.safeParse(undefined)).toEqual({ success: true, data: undefined });
        });

        test('rejects empty and whitespace-only strings', () => {
            expect(schema.safeParse('').success).toBe(false);
            expect(schema.safeParse('   ').success).toBe(false);
        });

        test('rejects strings exceeding max length', () => {
            expect(schema.safeParse('12345678901').success).toBe(false);
        });
    });

    describe('discordHandleSchema', () => {
        test('accepts valid handles and transforms to lowercase', () => {
            expect(discordHandleSchema.safeParse('user.name_123')).toEqual({
                success: true,
                data: 'user.name_123',
            });
            expect(discordHandleSchema.safeParse('UserName_456')).toEqual({
                success: true,
                data: 'username_456',
            });
        });

        test('rejects handles shorter than 2 chars or longer than 32 chars', () => {
            expect(discordHandleSchema.safeParse('a').success).toBe(false);
            expect(discordHandleSchema.safeParse('a'.repeat(33)).success).toBe(false);
        });

        test('rejects invalid characters', () => {
            expect(discordHandleSchema.safeParse('user#1234').success).toBe(false);
            expect(discordHandleSchema.safeParse('user@name').success).toBe(false);
            expect(discordHandleSchema.safeParse('user name').success).toBe(false);
            expect(discordHandleSchema.safeParse('').success).toBe(false);
        });
    });

    describe('tenhouIdSchema', () => {
        test('accepts valid IDs (1-16 alphanumeric, dash, underscore)', () => {
            expect(tenhouIdSchema.safeParse('NoName')).toEqual({ success: true, data: 'NoName' });
            expect(tenhouIdSchema.safeParse('ID_123-abc')).toEqual({ success: true, data: 'ID_123-abc' });
            expect(tenhouIdSchema.safeParse('x')).toEqual({ success: true, data: 'x' });
        });

        test('rejects invalid IDs', () => {
            expect(tenhouIdSchema.safeParse('').success).toBe(false);
            expect(tenhouIdSchema.safeParse('a'.repeat(17)).success).toBe(false);
            expect(tenhouIdSchema.safeParse('name with space').success).toBe(false);
            expect(tenhouIdSchema.safeParse('user@name').success).toBe(false);
        });
    });

    describe('gameAccountSchema', () => {
        test('accepts unicode characters, spaces, and alphanumeric nicknames', () => {
            expect(gameAccountSchema.safeParse('MajsoulPlayer')).toEqual({
                success: true,
                data: 'MajsoulPlayer',
            });
            expect(gameAccountSchema.safeParse('雀魂プレイヤー')).toEqual({
                success: true,
                data: '雀魂プレイヤー',
            });
            expect(gameAccountSchema.safeParse('Player One 123')).toEqual({
                success: true,
                data: 'Player One 123',
            });
            expect(gameAccountSchema.safeParse('咲-Saki- ★')).toEqual({
                success: true,
                data: '咲-Saki- ★',
            });
        });

        test('rejects control characters, quotes, and angle brackets', () => {
            expect(gameAccountSchema.safeParse('<script>').success).toBe(false);
            expect(gameAccountSchema.safeParse('player>name').success).toBe(false);
            expect(gameAccountSchema.safeParse("player'name").success).toBe(false);
            expect(gameAccountSchema.safeParse('player"name').success).toBe(false);
            expect(gameAccountSchema.safeParse('player`name').success).toBe(false);
            expect(gameAccountSchema.safeParse('player\x00name').success).toBe(false);
            expect(gameAccountSchema.safeParse('player\nname').success).toBe(false);
        });

        test('rejects empty string and strings exceeding 64 chars', () => {
            expect(gameAccountSchema.safeParse('').success).toBe(false);
            expect(gameAccountSchema.safeParse('a'.repeat(65)).success).toBe(false);
        });
    });
});
