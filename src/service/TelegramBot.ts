import { Telegraf } from "telegraf";
import config from "../../config/config.ts";

export const telegramBot: Telegraf = new Telegraf(config.botToken);