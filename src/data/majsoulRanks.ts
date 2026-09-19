/**
 * Mahjong Soul ranks, as a player would pick their own from a list.
 *
 * Stored as a code such as `expert_3`, never as a display name: the tier names
 * are localized in the mini-app, and the in-game names themselves differ
 * between the Japanese, Chinese and English clients.
 *
 * Yonma (four-player) and sanma (three-player) are ranked separately in game,
 * so a player holds two independent ranks and the profile stores two columns.
 * The tier ladder is the same in both modes, which is why one catalog serves
 * both.
 */
export const MAJSOUL_RANK_TIERS = ['novice', 'adept', 'expert', 'master', 'saint', 'celestial'] as const;

export type MajsoulRankTier = typeof MAJSOUL_RANK_TIERS[number];

/**
 * Celestial (魂天) has no 1/2/3 subdivision — it is a single rank measured in
 * Celestial points — so it is the one tier without a level suffix.
 */
const TIERS_WITHOUT_LEVELS: readonly MajsoulRankTier[] = ['celestial'];

export function tierHasLevels(tier: MajsoulRankTier): boolean {
    return !TIERS_WITHOUT_LEVELS.includes(tier);
}

function codesForTier(tier: MajsoulRankTier): string[] {
    return tierHasLevels(tier) ? [1, 2, 3].map(level => `${tier}_${level}`) : [tier];
}

/** Every valid rank code, weakest first. */
export const MAJSOUL_RANK_CODES: readonly string[] = MAJSOUL_RANK_TIERS.flatMap(codesForTier);

const RANK_CODE_SET = new Set(MAJSOUL_RANK_CODES);

export function isMajsoulRankCode(value: string): boolean {
    return RANK_CODE_SET.has(value);
}

/** The tier half of a rank code, or undefined if the code is not a known rank. */
export function majsoulRankTier(code: string): MajsoulRankTier | undefined {
    if (!isMajsoulRankCode(code)) return undefined;
    return code.split('_')[0] as MajsoulRankTier;
}
