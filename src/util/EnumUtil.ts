import { InternalServerError } from '../error/BaseErrors.ts';
import { ClubInviteSource, ClubInviteType, ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';
import { EventRegistrationStatus } from '../model/EventRegistrationModels.ts';
import { UmaTieBreak } from '../model/EventModels.ts';
import { GameStatus, Wind } from '../model/GameModels.ts';
import { ClubTelegramTopicType } from '../model/TelegramTopic.ts';
import { UserStatus } from '../model/UserModels.ts';

class EnumParsingError extends InternalServerError {
    constructor(value: string, enumName: string, allowedValues: string[]) {
        super(
            `Неприпустиме значення '${value}' для enum ${enumName}. Дозволені значення: ${allowedValues.join(', ')}`,
            'enumParsingError'
        );
    }
}

export function parseEnumValue<T extends Record<string, string>>(
    enumName: string,
    enumObj: T,
    value: string
): T[keyof T] {
    const values = Object.values(enumObj) as string[];

    if (values.includes(value)) {
        return value as T[keyof T];
    }

    throw new EnumParsingError(value, enumName, values);
}

export function parseUserStatus(value: string): UserStatus {
    return parseEnumValue('UserStatus', UserStatus, value);
}

export function parseClubRole(value: string): ClubRole {
    return parseEnumValue('ClubRole', ClubRole, value);
}

export function parseClubMembershipStatus(value: string): ClubMembershipStatus {
    return parseEnumValue('ClubMembershipStatus', ClubMembershipStatus, value);
}

export function parseClubInviteType(value: string): ClubInviteType {
    return parseEnumValue('ClubInviteType', ClubInviteType, value);
}

export function parseClubInviteSource(value: string): ClubInviteSource {
    return parseEnumValue('ClubInviteSource', ClubInviteSource, value);
}

export function parseEventRegistrationStatus(value: string): EventRegistrationStatus {
    return parseEnumValue('EventRegistrationStatus', EventRegistrationStatus, value);
}

export function parseWind(value: string): Wind {
    return parseEnumValue('Wind', Wind, value);
}

export function parseGameStatus(value: string): GameStatus {
    return parseEnumValue('GameStatus', GameStatus, value);
}

export function parseUmaTieBreak(value: string): UmaTieBreak {
    return parseEnumValue('UmaTieBreak', UmaTieBreak, value);
}

export function parseClubTelegramTopicType(value: string): ClubTelegramTopicType {
    return parseEnumValue('ClubTelegramTopicType', ClubTelegramTopicType, value);
}
