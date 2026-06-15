import { generateInviteCode } from '../src/util/InviteCodeUtil.ts';

const ALLOWED = /^[2-9A-HJ-NP-Z]+$/; // base32 without 0/O/1/I/L

describe('generateInviteCode', () => {
    it('generates a code of the default length (10)', () => {
        expect(generateInviteCode()).toHaveLength(10);
    });

    it('respects a custom length', () => {
        expect(generateInviteCode(4)).toHaveLength(4);
        expect(generateInviteCode(16)).toHaveLength(16);
    });

    it('only uses the unambiguous alphabet', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateInviteCode();
            expect(code).toMatch(ALLOWED);
            expect(code).not.toMatch(/[01OIL]/);
        }
    });

    it('produces unique codes across many invocations', () => {
        const codes = new Set<string>();
        for (let i = 0; i < 2000; i++) {
            codes.add(generateInviteCode());
        }
        expect(codes.size).toBe(2000);
    });
});
