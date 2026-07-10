import { createHash, randomBytes } from 'node:crypto';
import { InvalidExternalAuthRegistrationTokenError } from '../error/AuthErrors.ts';
import type {
    ExternalAuthRegistrationRequired,
    PendingExternalAuthRegistration,
    VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import { PendingExternalAuthRegistrationRepository } from '../repository/PendingExternalAuthRegistrationRepository.ts';

const REGISTRATION_TOKEN_TTL_MS = 10 * 60 * 1000;

export class ExternalAuthRegistrationService {
    private repository = new PendingExternalAuthRegistrationRepository();

    create(profile: VerifiedExternalProfile, now = new Date()): ExternalAuthRegistrationRequired {
        this.repository.deleteExpired(now);
        const registrationToken = randomBytes(32).toString('base64url');
        this.repository.create(
            hashRegistrationToken(registrationToken),
            profile,
            now,
            new Date(now.getTime() + REGISTRATION_TOKEN_TTL_MS)
        );

        return {
            registrationRequired: true,
            registrationToken,
            provider: profile.provider,
            suggestedName: profile.displayName ?? profile.username ?? null,
            profile: {
                displayName: profile.displayName ?? null,
                email: profile.email ?? null,
                username: profile.username ?? null,
            },
        };
    }

    getValid(registrationToken: string, now = new Date()): PendingExternalAuthRegistration {
        this.repository.deleteExpired(now);
        const pending = this.repository.findByTokenHash(hashRegistrationToken(registrationToken));
        if (pending === undefined || pending.expiresAt <= now) {
            throw new InvalidExternalAuthRegistrationTokenError();
        }
        return pending;
    }

    consume(tokenHash: string): void {
        this.repository.deleteByTokenHash(tokenHash);
    }
}

export function hashRegistrationToken(registrationToken: string): string {
    return createHash('sha256').update(registrationToken).digest('hex');
}
