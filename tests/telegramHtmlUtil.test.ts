import { escapeTelegramHtml, userProfileLink } from '../src/util/TelegramHtmlUtil.ts';

describe('escapeTelegramHtml', () => {
    it('escapes the three characters Telegram HTML treats as markup', () => {
        expect(escapeTelegramHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    });

    // A caption is user-authored and lands inside a parse_mode: 'HTML' message,
    // so raw tags would corrupt it - or forge the attribution line above it.
    it('neutralises a caption that tries to inject markup', () => {
        expect(escapeTelegramHtml('<b>Admin</b> says hi'))
            .toBe('&lt;b&gt;Admin&lt;/b&gt; says hi');
    });

    it('escapes the ampersand first so an escape is not double-encoded', () => {
        expect(escapeTelegramHtml('&lt;')).toBe('&amp;lt;');
    });

    it('leaves ordinary text, including Cyrillic and emoji, untouched', () => {
        expect(escapeTelegramHtml('Рон на останньому тайлі 🀄')).toBe('Рон на останньому тайлі 🀄');
    });
});

describe('userProfileLink', () => {
    it('links to the user through the mini app', () => {
        expect(userProfileLink('https://t.me/bot', 42, 'Ihor S'))
            .toBe('<a href="https://t.me/bot?startapp=user_42"><b>Ihor S</b></a>');
    });

    // A display name is user-controlled too.
    it('escapes the display name', () => {
        expect(userProfileLink('https://t.me/bot', 7, '<i>Evil</i>'))
            .toBe('<a href="https://t.me/bot?startapp=user_7"><b>&lt;i&gt;Evil&lt;/i&gt;</b></a>');
    });
});
