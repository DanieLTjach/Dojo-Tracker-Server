import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as yaml from 'js-yaml';
import { DEFAULT_LOCALE, t } from '../src/i18n/index.ts';
import { ResponseStatusError } from '../src/error/BaseErrors.ts';
import * as AuthErrors from '../src/error/AuthErrors.ts';
import * as ClubErrors from '../src/error/ClubErrors.ts';
import * as EventErrors from '../src/error/EventErrors.ts';
import * as EventRegistrationErrors from '../src/error/EventRegistrationErrors.ts';
import * as GameErrors from '../src/error/GameErrors.ts';
import * as ImportErrors from '../src/error/ImportErrors.ts';
import * as PointCalculationErrors from '../src/error/PointCalculationErrors.ts';
import * as RatingErrors from '../src/error/RatingErrors.ts';
import * as UserErrors from '../src/error/UserErrors.ts';

describe('i18n core', () => {
    it('resolves a key from the loaded catalog', () => {
        expect(t('common.none', {}, DEFAULT_LOCALE)).toBe('немає');
    });

    it('returns the key itself when missing', () => {
        expect(t('common.doesNotExist', {}, DEFAULT_LOCALE)).toBe('common.doesNotExist');
    });

    it('interpolates {{param}} placeholders', () => {
        expect(t('errors.gameNotFoundById', { id: 42 }, DEFAULT_LOCALE)).toBe('Гру з id 42 не знайдено');
    });

    it('returns the template verbatim when no params object is passed', () => {
        expect(t('errors.gameNotFoundById', undefined, DEFAULT_LOCALE)).toBe('Гру з id {{id}} не знайдено');
    });

    it('blanks out placeholders missing from a provided params object', () => {
        expect(t('errors.gameNotFoundById', {}, DEFAULT_LOCALE)).toBe('Гру з id  не знайдено');
    });
});

describe('error catalog coverage', () => {
    // One representative instance of every error class, constructed with realistic args.
    const allErrors: ResponseStatusError[] = [
        // Auth
        new AuthErrors.InvalidInitDataError('reason'),
        new AuthErrors.ExpiredAuthDataError(),
        new AuthErrors.MissingAuthTokenError(),
        new AuthErrors.InvalidAuthTokenError('reason'),
        new AuthErrors.InsufficientPermissionsError(),
        new AuthErrors.TokenExpiredError(),
        new AuthErrors.InvalidTokenError(),
        // Club
        new ClubErrors.ClubNotFoundError(1),
        new ClubErrors.ClubMembershipNotFoundError('Club', 1),
        new ClubErrors.ClubNameAlreadyExistsError('Club'),
        new ClubErrors.ClubMembershipAlreadyExistsError('Club', 1),
        new ClubErrors.InsufficientClubPermissionsError('OWNER'),
        new ClubErrors.YouHaveToBeClubMemberError(),
        new ClubErrors.YouNeedToBeModeratorToCreateGamesWithNonClubMembersError(),
        new ClubErrors.InvalidClubMembershipStateError('act', 'INACTIVE', ['PENDING']),
        new ClubErrors.InviteNotFoundError('code'),
        new ClubErrors.InviteRevokedError(),
        new ClubErrors.InviteExpiredError(),
        new ClubErrors.InviteExhaustedError(),
        new ClubErrors.NameRequiredForNewUserError(),
        // Event
        new EventErrors.EventNotFoundError(1),
        new EventErrors.GameRulesNotFoundError(1),
        new EventErrors.CannotDeleteGameRulesInUseError('Rules', 2),
        new EventErrors.CannotUpdateGameRulesInUseError('Rules', 2),
        new EventErrors.CannotDeleteEventWithGamesError('Event', 2),
        new EventErrors.CannotDeleteEventWithRegistrationsError('Event', 2),
        new EventErrors.CurrentRatingEventMustBeClubScopedError(),
        new EventErrors.TournamentMustHaveClubError(),
        new EventErrors.GameCreationBlockedError('Event'),
        // Event registration
        new EventRegistrationErrors.EventRegistrationNotFoundError('Event', 1),
        new EventRegistrationErrors.UserNotRegisteredForTournamentError('Event', 1),
        new EventRegistrationErrors.UserNotApprovedForTournamentError('Event', 1, 'PENDING'),
        new EventRegistrationErrors.InvalidEventRegistrationStateError('act', 'PENDING', ['APPROVED']),
        new EventRegistrationErrors.MissingProfileNamesForTournamentRegistrationError(),
        new EventRegistrationErrors.EventCapacityReachedError('Event', 16),
        new EventRegistrationErrors.InsufficientEventRegistrationManagementPermissionsError(),
        // Game
        new GameErrors.GameNotFoundById(1),
        new GameErrors.TooManyGamesFoundError(),
        new GameErrors.IncorrectPlayerCountError(4),
        new GameErrors.DuplicatePlayerError('Bob'),
        new GameErrors.DuplicateGameTimestampInEventError(),
        new GameErrors.DuplicateTournamentRoundTableError(1, '2'),
        new GameErrors.IncorrectTotalPointsError(100000, 99000),
        new GameErrors.PointsNotWithinRange(5, 0, 4),
        new GameErrors.EventHasntStartedError('Event'),
        new GameErrors.EventHasEndedError('Event'),
        new GameErrors.YouHaveToBeAdminToCreateGameWithCustomTime(),
        new GameErrors.YouHaveToBeAdminToHideNewGameMessage(),
        new GameErrors.GameNotInProgressWhenAddingNewRoundError(),
        new GameErrors.GameNotInProgressWhenDeletingRoundError(),
        new GameErrors.GameNotInProgressWhenFinishingError(),
        new GameErrors.InvalidRoundIdError(2, 3),
        new GameErrors.RoundAlreadyExistsError(),
        new GameErrors.NotAuthorizedToModifyGameError(),
        new GameErrors.GamePlayerNotFoundError(1, 2),
        new GameErrors.NoRoundsToRollbackError(),
        new GameErrors.LastRoundRollbackAlreadyUsedError(),
        new GameErrors.NoRoundsCompletedError(),
        new GameErrors.GameNotFinishedWhenUpdatingError(),
        new GameErrors.GameNotFinishedWhenUndoingFinishError(),
        new GameErrors.CannotUndoFinishOnNonTrackedGameError(),
        new GameErrors.GameNotCreatedWhenStartingError(),
        new GameErrors.NotGamePlayerError(),
        // Import
        new ImportErrors.UserNotFoundByUsernameError('user'),
        new ImportErrors.NoValidGamesInCsvError(),
        // Point calculation
        new PointCalculationErrors.RulesetShouldContainDetailedRulesError(),
        new PointCalculationErrors.YakumanLiabilityRequiresYakumanError(),
        new PointCalculationErrors.NoDoubleRonFirstWinsOnlyError(),
        new PointCalculationErrors.NoTripleRonFirstWinsOnlyError(),
        new PointCalculationErrors.TripleRonShouldBeAbortiveDrawError(),
        new PointCalculationErrors.DealInPlayerCannotBeWinnerError(),
        new PointCalculationErrors.AbortiveDrawNotInRulesetError(),
        new PointCalculationErrors.NagashiManganNotInRulesetError(),
        new PointCalculationErrors.HanRequiredForNonYakumanHandError(),
        new PointCalculationErrors.HandShouldBeRecordedAsCountedYakumanError(),
        new PointCalculationErrors.FuRequiredForLowHanHandError(),
        new PointCalculationErrors.TwoHanMinimumIsRequiredError(),
        new PointCalculationErrors.DealInPlayerNotInGameError(),
        new PointCalculationErrors.MissingPlayerForWindError('EAST'),
        new PointCalculationErrors.CannotFindHeadBumpPlayerError(),
        new PointCalculationErrors.CannotDetermineDealerError(),
        new PointCalculationErrors.CannotDeterminePlayerPlacementError(),
        new PointCalculationErrors.InvalidHonbaFormatError(),
        new PointCalculationErrors.NoPlayersInTheGameError(),
        // Rating
        new RatingErrors.UserRatingChangeInGameNotFound(1, 2),
        new RatingErrors.UserHasNoRatingDespiteHavingPlayedGames(1, 2),
        new RatingErrors.PleaseProvideStartPlaceForAllPlayersToResolveTie(),
        // User
        new UserErrors.NameAlreadyTakenByAnotherUser('Bob'),
        new UserErrors.TelegramUsernameAlreadyTakenByAnotherUser('@bob'),
        new UserErrors.UserWithThisTelegramIdAlreadyExists(1),
        new UserErrors.UserNotFoundById(1),
        new UserErrors.UserNotFoundByTelegramId(1),
        new UserErrors.YouHaveToBeAdminToEditAnotherUser(),
        new UserErrors.UserIsNotActive(1),
    ];

    it.each(allErrors.map(e => [e.errorCode, e] as const))(
        'errorCode "%s" resolves to a real catalog message',
        (errorCode, error) => {
            expect(errorCode).toBeDefined();
            // A missing key makes t() echo `errors.<code>`; a resolved key yields a real string.
            expect(error.message).not.toBe(`errors.${errorCode}`);
            expect(error.message.length).toBeGreaterThan(0);
        }
    );
});

describe('errors.yaml has no orphaned placeholders', () => {
    it('every {{param}} differs across the file is fine — just assert it parses & is flat strings', () => {
        const errorsYaml = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales/uk/errors.yaml');
        const parsed = yaml.load(readFileSync(errorsYaml, 'utf8')) as { errors: Record<string, unknown> };
        expect(parsed.errors).toBeDefined();
        for (const [key, value] of Object.entries(parsed.errors)) {
            expect(typeof value).toBe('string');
            expect((value as string).length).toBeGreaterThan(0);
            // key naming: camelCase, no dots
            expect(key).not.toContain('.');
        }
    });
});
