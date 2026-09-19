/**
 * Telegram messages are sent with `parse_mode: 'HTML'`, so any user-authored
 * text put into one has to be escaped first. A post caption is written by a
 * user: left raw, a caption containing `<b>` or `<a href=...>` would corrupt
 * the message, and could forge the "published by" attribution the caption sits
 * under.
 *
 * Telegram's Bot API only requires these three characters to be escaped.
 * https://core.telegram.org/bots/api#html-style
 */
export function escapeTelegramHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * A user mention that opens their profile in the mini app. The name is
 * user-authored, so it is escaped.
 */
export function userProfileLink(botUrl: string, userId: number, name: string): string {
    return `<a href="${botUrl}?startapp=user_${userId}"><b>${escapeTelegramHtml(name)}</b></a>`;
}

/**
 * Escapes characters that have special meaning in HTML text and attributes.
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
