import {
    evaluateAutomaticAchievements,
    type ComputedAchievementState,
} from '../src/util/AutomaticAchievementEvaluator.ts';
import { AUTOMATIC_ACHIEVEMENTS } from '../src/data/automaticAchievementCatalog.ts';
import {
    SCENARIOS,
    SUBJECT,
    type CheckName,
    type Scenario,
    type ScenarioInput,
} from './fixtures/achievementScenarios.ts';

// Recorded places where the evaluator does not yet implement the behaviour its
// achievement description states. Each entry is self-verifying: the listed
// checks must currently FAIL - fixing a bug means deleting its entry here, at
// which point the full assertion runs instead.
const KNOWN_DEVIATIONS: Partial<Record<string, CheckName[]>> = {
    // Comeback unlocks on "lost points at least once", not on a negative score.
    COMEBACK_NEGATIVE_TO_FIRST: ['nearMiss'],
    // Any abortive draw with four riichi players unlocks; the draw type is unchecked.
    FOUR_RIICHI_ABORTIVE_DRAW: ['nearMiss'],
    // The superior yakuman variant does not unlock the base achievement.
    FIRST_KOKUSHI: ['positive'],
    FIRST_SUUANKOU: ['positive'],
    FIRST_CHUUREN: ['positive'],
    // A tie for the lead is excluded (margin > 0 required) - 0 is inside budget.
    WIN_BY_MARGIN_1000: ['extra'],
    // Seasons feed the tournament counters.
    EVENT_DEBUT: ['nearMiss'],
    // A double ron's summed payments unlock the single-hit threshold.
    DEAL_IN_32000: ['nearMiss'],
    // Exact fu equality leaves 110-fu hands unlocking nothing.
    FU_50: ['extra'],
    FU_70: ['extra'],
    FU_100: ['extra'],
    // Peak progress is overwritten by later, lower ratings.
    OPENSKILL_PEAK_1600: ['extra'],
    OPENSKILL_PEAK_1800: ['extra'],
    OPENSKILL_PEAK_2000: ['extra'],
    OPENSKILL_PEAK_2200: ['extra'],
    // No progress call, so a small loss produces no row at all.
    OPENSKILL_LOSS_50_ONE_GAME: ['progress'],
    // Unlocks under GLOBAL scope while the catalog declares SKILL_4P.
    OPENSKILL_MULTI_CLUB_RANKED_2: ['scope'],
    // Dice come from the game row, not the rounds - trackedOnly is dishonest.
    DICE_FIRST_ROLL: ['trackedOnly'],
    DICE_SNAKE_EYES: ['trackedOnly'],
    DICE_BOXCARS: ['trackedOnly'],
    DICE_LUCKY_SEVEN: ['trackedOnly'],
    DICE_ANY_DOUBLE: ['trackedOnly'],
    DICE_TEN_DOUBLES: ['trackedOnly'],
    // The evidence margin lands in the round-number slot, value defaults to 1.
    WIN_BY_MARGIN_30000: ['extra'],
    // Seasons feed the tournament counters; the near-miss shows target progress.
    EVENT_COUNT_10: ['nearMiss', 'progress'],
};

// Codes whose positive unlock currently reports a bare value of 1 (rendered as
// "1 wins"-style unit lines). Shrinks to empty once unlock evidence values stop
// defaulting to 1.
const KNOWN_VALUE_DEVIATIONS = new Set<string>([
    'GAMES_1',
    'WINS_1',
    'WIN_STARTING_EAST',
    'FINISH_EXACT_ZERO',
    'COMEBACK_NEGATIVE_TO_FIRST',
    'FIRST_RON',
    'FIRST_TSUMO',
    'FIRST_DEALER_WIN',
    'FIRST_RIICHI',
    'RIICHI_NOMI_WIN',
    'ONE_HAN_WIN',
    'CHIITOITSU_NOMI_WIN',
    'FU_50',
    'FU_70',
    'FU_100',
    'FIRST_MANGAN',
    'FIRST_HANEMAN',
    'FIRST_BAIMAN',
    'FIRST_SANBAIMAN',
    'FIRST_KAZOE',
    'FIRST_YAKUMAN',
    'FIRST_DOUBLE_YAKUMAN',
    'NAGASHI_MANGAN',
    'DOUBLE_RON_WINNER',
    'YAKUMAN_LIABILITY',
    'FOUR_RIICHI_ABORTIVE_DRAW',
    'FOUR_WIND_COLLECTION',
    'OPENSKILL_FIRST_RATED',
    'OPENSKILL_UNDERDOG_WIN',
    'FIRST_IPPATSU',
    'FIRST_DOUBLE_RIICHI',
    'FIRST_HAITEI',
    'FIRST_HOUTEI',
    'FIRST_RINSHAN',
    'FIRST_CHANKAN',
    'FIRST_CHOMBO',
    'TSUBAME_GAESHI',
    'FIRST_TENHOU',
    'FIRST_CHIIHOU',
    'FIRST_RENHOU',
    'FIRST_PINFU',
    'FIRST_TANYAO',
    'FIRST_IIPEIKOU',
    'FIRST_RYANPEIKOU',
    'FIRST_SANSHOKU_DOUJUN',
    'FIRST_SANSHOKU_DOUKOU',
    'FIRST_ITTSUU',
    'FIRST_CHANTA',
    'FIRST_JUNCHAN',
    'FIRST_TOITOI',
    'FIRST_SANANKOU',
    'FIRST_SANKANTSU',
    'FIRST_SHOUSANGEN',
    'FIRST_HONROUTOU',
    'FIRST_HONITSU',
    'FIRST_CHINITSU',
    'FULLY_OPEN_WIN',
    'FIRST_KOKUSHI_13',
    'FIRST_SUUANKOU_TANKI',
    'FIRST_DAISANGEN',
    'FIRST_DAISUUSHI',
    'FIRST_SHOUSUUSHI',
    'FIRST_TSUISOU',
    'FIRST_RYUUISOU',
    'FIRST_CHINROUTOU',
    'FIRST_SUUKANTSU',
    'FIRST_JUNSEI_CHUUREN',
    'FIRST_AKA_DORA_WIN',
    'NO_DORA_MANGAN',
    'DORA_PON_WIN',
    'DORA_KAN_WIN',
    'SOU_1_PON_WIN',
    'SOU_1_KAN_WIN',
    'FIRST_KAN',
    'FIRST_ANKAN',
    'FIRST_DAIMINKAN',
    'FIRST_KAKAN',
    'SANMA_GAMES_1',
    'SANMA_WINS_1',
    'SANMA_FIRST_DEALER_WIN',
    'SANMA_FIRST_TSUMO',
    'SANMA_FIRST_YAKUMAN',
    'SANMA_FIRST_KITA',
    'DICE_FIRST_ROLL',
    'DICE_SNAKE_EYES',
    'DICE_BOXCARS',
    'DICE_LUCKY_SEVEN',
    'DICE_ANY_DOUBLE',
    'EVENT_DEBUT',
    'TOURNAMENT_CHAMPION',
    'WIN_BY_MARGIN_1000',
    'WIN_BY_MARGIN_30000',
    'SEASON_CHAMPION',
]);

function run(input: ScenarioInput): ComputedAchievementState[] {
    return evaluateAutomaticAchievements(input.games ?? [], input.events ?? [], input.skill ?? []);
}

function stripRounds(input: ScenarioInput): ScenarioInput {
    return { ...input, games: (input.games ?? []).map(g => ({ ...g, rounds: [] })) };
}

function unlocked(states: ComputedAchievementState[], code: string, userId?: number): ComputedAchievementState[] {
    return states.filter(s =>
        s.code === code &&
        s.unlockedAt !== null &&
        (userId === undefined || s.userId === userId)
    );
}

// Runs the assertion body, but for a recorded deviation requires it to fail.
function check(code: string, checkName: CheckName, assert: () => void): void {
    const deviations = KNOWN_DEVIATIONS[code] ?? [];
    if (!deviations.includes(checkName)) {
        assert();
        return;
    }
    let failed = false;
    try {
        assert();
    } catch {
        failed = true;
    }
    expect(failed).toBe(true);
}

describe('Automatic achievement contract', () => {
    it('has exactly one scenario per catalog code', () => {
        expect([...SCENARIOS.keys()].sort()).toEqual(AUTOMATIC_ACHIEVEMENTS.map(d => d.code).sort());
    });

    describe.each(AUTOMATIC_ACHIEVEMENTS.map(def => [def.code, def] as const))('%s', (_code, def) => {
        const scenario: Scenario = SCENARIOS.get(def.code)!;
        const subject = scenario.subject ?? SUBJECT;
        const size = def.gameSize ?? 4;
        const deviations = KNOWN_DEVIATIONS[def.code] ?? [];

        const positiveStates = run(scenario.positive(size));
        const nearMissStates = scenario.nearMiss ? run(scenario.nearMiss(size)) : null;

        it('unlocks on the positive scenario', () => {
            check(def.code, 'positive', () => {
                const s = positiveStates.find(x => x.userId === subject && x.code === def.code);
                expect(s).toBeDefined();
                expect(s!.unlockedAt).not.toBeNull();
                expect(s!.progress).toBe(def.target);
            });
        });

        if (scenario.nearMiss) {
            it('does not unlock on the near miss', () => {
                check(def.code, 'nearMiss', () => {
                    if (scenario.othersMayUnlock) {
                        expect(unlocked(nearMissStates!, def.code, subject)).toEqual([]);
                    } else {
                        expect(unlocked(nearMissStates!, def.code)).toEqual([]);
                    }
                });
            });
        }

        if (scenario.progresses) {
            it('shows progress on the near miss', () => {
                check(def.code, 'progress', () => {
                    const s = nearMissStates!.find(x => x.userId === subject && x.code === def.code);
                    expect(s).toBeDefined();
                    expect(s!.unlockedAt).toBeNull();
                    expect(s!.progress).toBeGreaterThanOrEqual(0);
                    expect(s!.progress).toBeLessThan(def.target);
                });
            });
        }

        if (!deviations.includes('positive')) {
            it('unlocks under the scope its catalog entry declares', () => {
                check(def.code, 'scope', () => {
                    const s = positiveStates.find(x =>
                        x.userId === subject && x.code === def.code && x.unlockedAt !== null
                    );
                    expect(s).toBeDefined();
                    switch (def.scopeType) {
                        case 'GLOBAL':
                            expect(s!.scope).toBe('GLOBAL');
                            break;
                        case 'SKILL_4P':
                            expect(s!.scope.startsWith('SKILL_4P:')).toBe(true);
                            break;
                        case 'SKILL_3P':
                            expect(s!.scope.startsWith('SKILL_3P:')).toBe(true);
                            break;
                        case 'EVENT':
                            expect(s!.scope.startsWith('EVENT:')).toBe(true);
                            break;
                        case 'CLUB':
                            expect(s!.scope.startsWith('CLUB:')).toBe(true);
                            break;
                    }
                });
            });
        }

        if (def.gameSize !== undefined) {
            it('does not unlock when replayed as the other game size', () => {
                check(def.code, 'gameSize', () => {
                    const replay = run(scenario.positive(def.gameSize === 3 ? 4 : 3));
                    expect(unlocked(replay, def.code)).toEqual([]);
                });
            });
        }

        if (def.trackedOnly) {
            it('does not unlock when rounds are not recorded', () => {
                check(def.code, 'trackedOnly', () => {
                    const stripped = run(stripRounds(scenario.positive(size)));
                    expect(unlocked(stripped, def.code)).toEqual([]);
                });
            });
        }

        if (scenario.extra) {
            it('holds its pinned invariants', () => {
                check(def.code, 'extra', () => {
                    scenario.extra!({ positive: positiveStates, nearMiss: nearMissStates });
                });
            });
        }

        it('never reports progress outside [0, target]', () => {
            for (const s of [...positiveStates, ...(nearMissStates ?? [])]) {
                if (s.code !== def.code) continue;
                expect(s.progress).toBeGreaterThanOrEqual(0);
                expect(s.progress).toBeLessThanOrEqual(def.target);
            }
        });
    });

    describe('value reporting', () => {
        it('never reports a bare value of 1 next to a unit', () => {
            const offenders: string[] = [];
            for (const def of AUTOMATIC_ACHIEVEMENTS) {
                const scenario = SCENARIOS.get(def.code)!;
                const states = run(scenario.positive(def.gameSize ?? 4));
                const s = states.find(
                    x => x.userId === (scenario.subject ?? SUBJECT) && x.code === def.code && x.unlockedAt !== null
                );
                if (s && s.value === 1) offenders.push(def.code);
            }
            expect(offenders.sort()).toEqual([...KNOWN_VALUE_DEVIATIONS].sort());
        });
    });
});
