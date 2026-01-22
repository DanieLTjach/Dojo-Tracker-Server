interface Config {
    port: number;
    dbPath: string;
    botToken: string;
    jwtSecret: string;
    jwtExpiry: string;
    authInitDataValiditySeconds: number;
    frontendUrl: string;
}

if (!process.env["BOT_TOKEN"]) {
    throw new Error("BOT_TOKEN environment variable is required");
}

if (!process.env["JWT_SECRET"]) {
    throw new Error("JWT_SECRET environment variable is required");
}

if (!process.env["FRONTEND_URL"]) {
    throw new Error("FRONTEND_URL environment variable is required");
}

const config: Config = {
    port: Number(process.env["PORT"]) || 3000,
    dbPath: process.env["DB_PATH"] || './db/data/data.db',
    botToken: process.env["BOT_TOKEN"],
    jwtSecret: process.env["JWT_SECRET"],
    jwtExpiry: process.env["JWT_EXPIRY"] || '7d',
    authInitDataValiditySeconds: Number(process.env["AUTH_INIT_DATA_VALIDITY_SECONDS"]) || 3600,
    frontendUrl: process.env["FRONTEND_URL"]
};

export default config;