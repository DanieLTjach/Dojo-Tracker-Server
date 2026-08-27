/**
 * Generates a valid Telegram initData query string signed with the local BOT_TOKEN.
 *
 * The backend validates initData by recomputing an HMAC with whatever BOT_TOKEN is
 * configured. It never asks Telegram whether that token is real, so a placeholder
 * token in .env.development is enough to produce initData the server accepts.
 * This lets you register and authenticate locally without a real bot.
 *
 * Usage:
 *   npm run initdata:dev -- --telegram-id 123456789 --username your_handle --name "Your Name"
 */
import crypto from 'crypto';
import config from '../../config/config.ts';

function getArg(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    if (index === -1 || index === process.argv.length - 1) {
        return undefined;
    }
    return process.argv[index + 1];
}

const telegramIdArg = getArg('--telegram-id') || '123456789';
const telegramId = Number.parseInt(telegramIdArg, 10);
if (Number.isNaN(telegramId)) {
    throw new Error(`--telegram-id must be an integer, got "${telegramIdArg}"`);
}

const username = getArg('--username') || 'localdev';
const name = getArg('--name') || 'Local Dev';

const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'local_dev',
    user: JSON.stringify({ id: telegramId, first_name: name, username }),
};

const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

const queryString = new URLSearchParams({ ...params, hash }).toString();

console.log(queryString);
