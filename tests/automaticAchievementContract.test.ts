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
    // A double ron's summed payments unlock the single-hit threshold.
    DEAL_IN_32000: ['nearMiss'],
};

// Codes whose positive unlock currently reports a bare value of 1 (rendered as
// "1 wins"-style unit lines). Shrinks to empty once unlock evidence values stop
// defaulting to 1.
const KNOWN_VALUE_DEVIATIONS = new Set<string>([]);

function run(input: ScenarioInput): ComputedAchievementState[] {
    return evaluateAutomaticAchievements(input.games ?? [], input.events ?? [], input.skill ?? []);
}

function stripRounds(input: ScenarioInput): ScenarioInput {
    return {
        ...input,
        games: (input.games ?? []).map(g => ({ ...g, rounds: [], startingDie1: null, startingDie2: null })),
    };
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
