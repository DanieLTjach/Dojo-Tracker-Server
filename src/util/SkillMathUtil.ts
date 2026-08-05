import { rate, rating } from 'openskill';
import {
    DEFAULT_MU,
    DEFAULT_SIGMA,
    INACTIVITY_GRACE_DAYS,
    INACTIVITY_SIGMA_RATE,
    MAX_SIGMA,
    SKILL_DISPLAY_BASE,
    SKILL_DISPLAY_SCALE,
    SKILL_TAU,
} from '../model/SkillModels.ts';

export function daysSince(date: Date, now: Date = new Date()): number {
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Calculates effective sigma after inactive period.
 * Mu is untouched; sigma inflation is capped at initial 25/3.
 */
export function inflateSigma(sigma: number, lastRatedGameAt: Date, now: Date = new Date()): number {
    const inactiveDays = Math.max(0, daysSince(lastRatedGameAt, now) - INACTIVITY_GRACE_DAYS);
    return Math.min(MAX_SIGMA, Math.max(sigma, sigma + inactiveDays * INACTIVITY_SIGMA_RATE));
}

/**
 * Calculates raw ordinal rating (mu - 3 * effectiveSigma).
 */
export function toOrdinal(mu: number, effectiveSigma: number): number {
    return mu - 3 * effectiveSigma;
}

/**
 * Converts (mu, effectiveSigma) to friendly integer display skill rating.
 * A new player with (25, 25/3) maps to exactly 1500.
 */
export function toDisplaySkill(mu: number, effectiveSigma: number): number {
    return Math.round(SKILL_DISPLAY_BASE + SKILL_DISPLAY_SCALE * (mu - 3 * effectiveSigma));
}

export interface PlayerRatingInput {
    mu?: number;
    sigma?: number;
}

export interface PlayerRatingOutput {
    mu: number;
    sigma: number;
}

/**
 * Rates a finished game using the OpenSkill Plackett-Luce model.
 * Each player is treated as a 1-player team.
 *
 * NOTE: The default model in openskill is Plackett-Luce (ideal for full finishing orders).
 * We explicitly do not pass model to keep the default Plackett-Luce behavior.
 */
export function rateGame(
    players: PlayerRatingInput[],
    ranks: number[]
): PlayerRatingOutput[] {
    if (players.length < 2 || ranks.length !== players.length) {
        throw new Error(`Cannot rate game with ${players.length} players and ${ranks.length} ranks`);
    }

    const teams = players.map(p => [
        rating({
            mu: p.mu ?? DEFAULT_MU,
            sigma: p.sigma ?? DEFAULT_SIGMA,
        }),
    ]);

    const updatedTeams = rate(teams, {
        rank: ranks,
        tau: SKILL_TAU,
        limitSigma: true,
    });

    return updatedTeams.map(team => ({
        mu: team[0]!.mu,
        sigma: team[0]!.sigma,
    }));
}
