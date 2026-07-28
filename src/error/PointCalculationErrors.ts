import { BadRequestError, InternalServerError } from './BaseErrors.ts';
import type { Wind } from '../model/GameModels.ts';

export class RulesetShouldContainDetailedRulesError extends InternalServerError {
    constructor() {
        super('rulesetShouldContainDetailedRules');
    }
}

/**
 * Same condition as RulesetShouldContainDetailedRulesError, but a 400 rather
 * than a 500. On the tracked-game path an event's ruleset lacking details is an
 * internal invariant violation. On the stateless score-preview path the ruleset
 * id comes straight from the client, so picking a legacy details-less ruleset
 * is bad input, not a server fault.
 */
export class SelectedRulesetHasNoDetailedRulesError extends BadRequestError {
    constructor() {
        super('rulesetShouldContainDetailedRules');
    }
}

export class YakumanLiabilityRequiresYakumanError extends BadRequestError {
    constructor() {
        super('yakumanLiabilityRequiresYakuman');
    }
}

export class NoDoubleRonFirstWinsOnlyError extends BadRequestError {
    constructor() {
        super('noDoubleRonFirstWinsOnly');
    }
}

export class NoTripleRonFirstWinsOnlyError extends BadRequestError {
    constructor() {
        super('noTripleRonFirstWinsOnly');
    }
}

export class TripleRonShouldBeAbortiveDrawError extends BadRequestError {
    constructor() {
        super('tripleRonShouldBeAbortiveDraw');
    }
}

export class DealInPlayerCannotBeWinnerError extends BadRequestError {
    constructor() {
        super('dealInPlayerCannotBeWinner');
    }
}

export class AbortiveDrawNotInRulesetError extends BadRequestError {
    constructor() {
        super('abortiveDrawNotInRuleset');
    }
}

export class NagashiManganNotInRulesetError extends BadRequestError {
    constructor() {
        super('nagashiManganNotInRuleset');
    }
}

export class HanRequiredForNonYakumanHandError extends BadRequestError {
    constructor() {
        super('hanRequiredForNonYakumanHand');
    }
}

export class HandShouldBeRecordedAsCountedYakumanError extends BadRequestError {
    constructor() {
        super('handShouldBeRecordedAsCountedYakuman');
    }
}

export class FuRequiredForLowHanHandError extends BadRequestError {
    constructor() {
        super('fuRequiredForLowHanHand');
    }
}

export class TwoHanMinimumIsRequiredError extends BadRequestError {
    constructor() {
        super('twoHanMinimumIsRequired');
    }
}

export class DealInPlayerNotInGameError extends InternalServerError {
    constructor() {
        super('dealInPlayerNotInGame');
    }
}

export class MissingPlayerForWindError extends InternalServerError {
    constructor(wind: Wind) {
        super('missingPlayerForWind', { wind });
    }
}

export class CannotFindHeadBumpPlayerError extends InternalServerError {
    constructor() {
        super('cannotFindHeadBumpPlayer');
    }
}

export class CannotDetermineDealerError extends InternalServerError {
    constructor() {
        super('cannotDetermineDealer');
    }
}

export class CannotDeterminePlayerPlacementError extends InternalServerError {
    constructor() {
        super('cannotDeterminePlayerPlacement');
    }
}

export class InvalidHonbaFormatError extends InternalServerError {
    constructor() {
        super('invalidHonbaFormat');
    }
}

export class NoPlayersInTheGameError extends InternalServerError {
    constructor() {
        super('noPlayersInTheGame');
    }
}

export class PlayerNotInGameError extends BadRequestError {
    constructor(playerId: number) {
        super('playerNotInGame', { playerId });
    }
}
