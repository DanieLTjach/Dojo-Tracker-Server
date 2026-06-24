import type { Request } from 'express';
import { DEFAULT_LOCALE, normalizeLocale } from '../i18n/index.ts';
import type { Club } from '../model/ClubModels.ts';
import type { Event } from '../model/EventModels.ts';
import type { User } from '../model/UserModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { UserRepository } from '../repository/UserRepository.ts';

const clubRepository = new ClubRepository();
const eventRepository = new EventRepository();
const gameRepository = new GameRepository();
const userRepository = new UserRepository();

export function resolveEffectiveLocale(
    user: User | null | undefined,
    clubOrLocale?: Club | string | null
): string {
    const clubLocale = typeof clubOrLocale === 'string' ? clubOrLocale : clubOrLocale?.locale;
    return normalizeLocale(user?.profile?.locale ?? clubLocale ?? DEFAULT_LOCALE);
}

export function resolveEventLocale(event: Event, user?: User | null): string {
    const club = event.clubId === null ? null : clubRepository.findClubById(event.clubId);
    return resolveEffectiveLocale(user, club);
}

export function resolveRequestLocale(req: Request): string {
    const user = req.user?.userId !== undefined ? userRepository.findUserById(req.user.userId) : undefined;
    const clubLocale = resolveRequestClubLocale(req);
    return resolveEffectiveLocale(user, clubLocale);
}

function resolveRequestClubLocale(req: Request): string | null {
    const clubId = findRequestId(req, 'clubId') ?? findRouteResourceId(req, 'club');
    if (clubId !== null) {
        const club = clubRepository.findClubById(clubId);
        if (club !== undefined) {
            return club.locale;
        }
    }

    const eventId = findRequestId(req, 'eventId') ?? findRouteResourceId(req, 'event');
    if (eventId !== null) {
        const event = eventRepository.findEventById(eventId);
        if (event?.clubId !== null && event?.clubId !== undefined) {
            return clubRepository.findClubById(event.clubId)?.locale ?? null;
        }
    }

    const gameId = findRequestId(req, 'gameId') ?? findRouteResourceId(req, 'game');
    if (gameId !== null) {
        const game = gameRepository.findGameById(gameId);
        if (game !== undefined) {
            const event = eventRepository.findEventById(game.eventId);
            if (event?.clubId !== null && event?.clubId !== undefined) {
                return clubRepository.findClubById(event.clubId)?.locale ?? null;
            }
        }
    }

    return null;
}

function findRequestId(req: Request, field: string): number | null {
    return [
        numberFromUnknown(req.params[field]),
        numberFromUnknown((req.body as Record<string, unknown> | undefined)?.[field]),
        numberFromUnknown(req.query[field]),
    ].find(value => value !== null) ?? null;
}

function findRouteResourceId(req: Request, resource: 'club' | 'event' | 'game'): number | null {
    const path = `${req.baseUrl}${req.path}`;
    if (!new RegExp(`/${resource}s?(?:/|$)`).test(path)) {
        return null;
    }
    return numberFromUnknown(req.params['id']);
}

function numberFromUnknown(value: unknown): number | null {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate === 'number') {
        return Number.isInteger(candidate) ? candidate : null;
    }
    if (typeof candidate !== 'string' || candidate.trim() === '') {
        return null;
    }
    const parsed = Number(candidate);
    return Number.isInteger(parsed) ? parsed : null;
}
