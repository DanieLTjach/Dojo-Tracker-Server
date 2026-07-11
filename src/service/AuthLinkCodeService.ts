import { createHash, randomInt } from 'node:crypto';
import { InvalidLinkCodeError } from '../error/AuthErrors.ts';
import type { AuthLinkCode, LinkCodeDTO } from '../model/AuthProviderModels.ts';
import { AuthLinkCodeRepository } from '../repository/AuthLinkCodeRepository.ts';
import { UserService } from './UserService.ts';
import { UserIsNotActive } from '../error/UserErrors.ts';

const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const LINK_CODE_LENGTH = 8;
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export class AuthLinkCodeService {
    private repository = new AuthLinkCodeRepository();
    private userService = new UserService();

    create(userId: number, now = new Date()): LinkCodeDTO {
        const user = this.userService.getUserById(userId);
        if (!user.isActive) {
            throw new UserIsNotActive(user.id);
        }
        this.repository.deleteExpired(now);
        const code = Array.from(
            { length: LINK_CODE_LENGTH },
            () => LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)]
        ).join('');
        const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
        this.repository.replaceForUser(hashLinkCode(code), userId, now, expiresAt);
        return { code, expiresAt: expiresAt.toISOString() };
    }

    resolve(code: string, now = new Date()): AuthLinkCode {
        this.repository.deleteExpired(now);
        const linkCode = this.repository.findValidByHash(hashLinkCode(code.toUpperCase()), now);
        if (linkCode === undefined) {
            throw new InvalidLinkCodeError();
        }
        const user = this.userService.getUserById(linkCode.userId);
        if (!user.isActive) {
            throw new UserIsNotActive(user.id);
        }
        return linkCode;
    }

    consume(codeHash: string): void {
        this.repository.deleteByHash(codeHash);
    }
}

export function hashLinkCode(code: string): string {
    return createHash('sha256').update(code.toUpperCase()).digest('hex');
}
