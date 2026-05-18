import { BadRequestError, InternalServerError } from "./BaseErrors.ts";
import type { Wind } from "../model/GameModels.ts";

export class RulesetShouldContainDetailedRulesError extends InternalServerError {
    constructor() {
        super(
            'Для відстежуваної гри правила повинні містити детальні налаштування',
            'rulesetShouldContainDetailedRules'
        );
    }
}

export class YakumanLiabilityRequiresYakumanError extends BadRequestError {
    constructor() {
        super(
            'Відповідальність за якуман можна вказати лише для якуману',
            'yakumanLiabilityRequiresYakuman'
        );
    }
}

export class NoDoubleRonFirstWinsOnlyError extends BadRequestError {
    constructor() {
        super(
            'Подвійний рон заборонено: перемагає лише перший, хто оголосив рон',
            'noDoubleRonFirstWinsOnly'
        );
    }
}

export class NoTripleRonFirstWinsOnlyError extends BadRequestError {
    constructor() {
        super(
            'Потрійний рон заборонено: перемагає лише перший, хто оголосив рон',
            'noTripleRonFirstWinsOnly'
        );
    }
}

export class TripleRonShouldBeAbortiveDrawError extends BadRequestError {
    constructor() {
        super(
            'Потрійний рон за цими правилами слід записати як нічию',
            'tripleRonShouldBeAbortiveDraw'
        );
    }
}

export class DealInPlayerCannotBeWinnerError extends BadRequestError {
    constructor() {
        super(
            'Гравець, який накинув, не може бути переможцем',
            'dealInPlayerCannotBeWinner'
        );
    }
}

export class NagashiManganNotInRulesetError extends BadRequestError {
    constructor() {
        super(
            'Нагаші манган не передбачено в цьому наборі правил',
            'nagashiManganNotInRuleset'
        );
    }
}

export class HanRequiredForNonYakumanHandError extends BadRequestError {
    constructor() {
        super(
            'Для руки, що не є якуманом, потрібно вказати кількість хан',
            'hanRequiredForNonYakumanHand'
        );
    }
}

export class HandShouldBeRecordedAsCountedYakumanError extends BadRequestError {
    constructor() {
        super(
            'Цю руку слід записати як підрахований якуман',
            'handShouldBeRecordedAsCountedYakuman'
        );
    }
}

export class FuRequiredForLowHanHandError extends BadRequestError {
    constructor() {
        super(
            'Для рук з менш ніж п’ятьма хан потрібно вказати фу',
            'fuRequiredForLowHanHand'
        );
    }
}

export class DealInPlayerNotInGameError extends InternalServerError {
    constructor() {
        super(
            'Гравець, який накинув, відсутній у грі',
            'dealInPlayerNotInGame'
        );
    }
}

export class MissingPlayerForWindError extends InternalServerError {
    constructor(wind: Wind) {
        super(
            `Відсутній гравець для вітру ${wind}`,
            'missingPlayerForWind'
        );
    }
}

export class CannotFindHeadBumpPlayerError extends InternalServerError {
    constructor() {
        super(
            'Не вдалося визначити head bump гравця',
            'cannotFindHeadBumpPlayer'
        );
    }
}

export class CannotDetermineDealerError extends InternalServerError {
    constructor() {
        super(
            'Не вдалося визначити дилера: некоректний стан гри',
            'cannotDetermineDealer'
        );
    }
}

export class CannotDetermineDealerPlacementError extends InternalServerError {
    constructor() {
        super(
            'Не вдалося визначити місце дилера: некоректний стан гри',
            'cannotDetermineDealerPlacement'
        );
    }
}

export class InvalidHonbaFormatError extends InternalServerError {
    constructor() {
        super(
            'Некоректний формат значення хонби в правилах',
            'invalidHonbaFormat'
        );
    }
}
