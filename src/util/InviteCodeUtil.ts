import crypto from 'crypto';

// Crockford-style base32 alphabet without ambiguous characters (no 0/O/1/I/L).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a random, URL-safe invite code using an unambiguous alphabet.
 * Uniqueness is the caller's responsibility (e.g. retry against the repository).
 *
 * @param length - Number of characters in the generated code (default 10).
 */
export function generateInviteCode(length = 10): string {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
        code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    }
    return code;
}
