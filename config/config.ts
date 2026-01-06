interface Config {
    port: number;
    dbPath: string;
    botToken: string;
    telegramBotToken: string;
    jwtSecret: string;
    jwtExpiry: string;
    authInitDataValiditySeconds: number;
}

const config: Config = {
    port: Number(process.env["PORT"]) || 3000,
    dbPath: process.env["DB_PATH"] || './db/data/data.db',
    botToken: process.env["BOT_TOKEN"] || '',
    telegramBotToken: process.env["TELEGRAM_BOT_TOKEN"] || process.env["BOT_TOKEN"] || '',
    jwtSecret: process.env["JWT_SECRET"] || 'change_this_secret_in_production',
    jwtExpiry: process.env["JWT_EXPIRY"] || '7d',
    authInitDataValiditySeconds: Number(process.env["AUTH_INIT_DATA_VALIDITY_SECONDS"]) || 3600
};

export default config;