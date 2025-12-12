export function generateShortUserId(telegramUserId) {
    const userIdInt = parseInt(String(telegramUserId), 10);
    const shortId = 1000 + (userIdInt % 9000);
    console.log(shortId);
    return shortId
}