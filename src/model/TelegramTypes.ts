import type { Context } from "telegraf";
import type { CallbackQuery, Message, Update } from "telegraf/types";

export type TelegramCommandContext = Context<{
    message: Update.New & Update.NonChannel & Message.TextMessage;
    update_id: number;
}>;

export type TelegramCallbackQueryContext = Context<Update.CallbackQueryUpdate<CallbackQuery>> & { match: RegExpExecArray; };

export type ClubData = { clubId: number; clubName: string };
