---
diff_hash: f5d6226f4bc65ee7783b49c2c5072737b8b479e31399da9fcbfcb09af1a13513
reviewed_at: 2026-11-20T12:41:47Z
---

## Summary

Adds budget and expense tracking (feature 09). It includes SQLite `expenses` and `exchange_rates` tables (migration 4), an owner-scoped `LocalExpenseRepository` with zod-validated rows, and Frankfurter exchange rates behind a SQLite cache with a TTL for `latest` and a nearest-earlier fallback. Conversion uses exact BigInt minor-unit math, and manual rates cover currencies the API doesn't publish. There are create, update, delete and conversion-refresh use cases, an RTK slice with a single-writer lock and request-id staleness guards, and screens for the overview, history, details, the add/edit form and the breakdown. The diff also adds deep links for `/budget/:tripId/...`, a Budget entry card on the trip screen, and en/es strings.

Stack: React (Expo SDK 58 / React Native), reviewed with the React criteria adapted to RN. `tsc --noEmit` and `expo lint` ran clean, and the budget and navigation Jest suites pass (20 suites, 361 tests).

Security looks sound. Every SQL statement is parameterized and filtered by `owner_id`. Creating an expense checks that the trip belongs to the owner, and updates re-read the expense under the owner. Route and deep-link ids go through `parseRouteId`. The rate API is HTTPS, needs no key, and its responses are validated with zod.

The previous `.code-reviews/brainx-review.md` was the finalized review of the already committed favorites change (8ce18cf), and none of its findings touch this diff, so this run is a fresh review of the budget diff.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **src/features/budget/presentation/hooks/useTripBudget.ts:49**: The first background conversion is never re-run when a save or delete lands while it is in flight, so the overview keeps showing stale, unconverted totals. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: On a first visit, `loadTripExpenses` finishes with `converted: false`, and the effect then dispatches `retryConversions`, whose pending state keeps `status: 'ready', converted: false`. If an expense is created, updated or deleted before that retry finishes, `invalidateRunningLoad` (`budgetSlice.ts:148`) rejects the retry's result and writes `status: 'ready', converted: false` again. Those are the same values as before, so the effect's dependencies don't change and nothing dispatches a new conversion. SQLite holds the converted amounts, but the store keeps the old copy: totals leave those expenses out and the "not converted" banner stays up until the user taps Try again or the screen remounts. A slow network makes this easy to hit (open Budget, add a same-currency expense quickly). `budgetSlice.edge.test.ts:163` misses it because it starts from `loadTripBudget` (`converted: true`) and re-dispatches the retry by hand. Possible fix: have the effect also watch the load's `requestId` (or a "conversion pending" flag), so that a cleared request with `converted === false` triggers a new retry.

### Low (5)
- **src/features/budget/presentation/state/budgetSlice.ts:107**: `retryConversions` doesn't de-duplicate a conversion that is already running, so several callers start parallel `GetTripBudget` runs. *(efficiency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The condition only blocks while `status === 'loading'`, but a background retry keeps `status: 'ready'`. When `BudgetEntryCard` on the trip screen and the pushed `BudgetOverviewScreen` are both mounted, each effect dispatches its own retry, and pushing the overview while the card's retry runs starts another one. `UnconvertedBanner` has a `retrying` prop that no caller passes, so the Try again button gives no feedback and every tap starts another run. Results stay correct (only the newest `requestId` is accepted, and `basis` guards the writes), but each run repeats Frankfurter lookups and SQLite writes. The comment at `useTripBudget.ts:45` ("Only the first caller loads") is not true for retries. Possible fix: skip the retry when one is already in flight (`requestId !== null`), and pass `retrying` to the banner.
- **src/features/budget/data/CachedExchangeRateRepository.ts:61**: A historical rate is cached permanently under the requested date even when the API answered with an earlier day because that date's ECB rate wasn't published yet. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: A date before the device's local today counts as historical and is never refetched. A traveller well east of CET (for example NZ just after midnight) asks for local "yesterday" before the ECB has published it, so Frankfurter returns the previous working day, and that answer is saved under the requested date for good. Later expenses on that date reuse it, and `needsBetterRate` won't replace it because `updatedAt` is already after the expense date. The rate is labelled with its real `rateDate`, so the effect is a rate one working day off, not a wrong label. Possible fix: cache permanently only when `rateDate === date` or the date is safely in the past (or a weekend); otherwise apply the `latest` TTL.
- **src/features/budget/domain/usecases/expenseUseCases.ts:91**: `needsBetterRate` uses `updatedAt` as the time of conversion, but any edit changes `updatedAt`. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Take a future-dated foreign expense converted at the `latest` rate. Once its date passes it should get that day's rate. If the user edits only its title, notes, category or payment method after the date, `UpdateExpense` keeps the old conversion but sets `updatedAt` to now. The condition `localDateAt(expense.updatedAt) < expense.date` then fails, so the approximate pre-date rate is kept permanently. Possible fix: base the check on when the rate was applied (for example, store the conversion time or compare against the rate's fetch time) rather than on `updatedAt`.
- **src/features/budget/domain/budgetCalculations.ts:90**: `convertMinor` returns `Number(bigint)` without checking that the result is a safe integer, and a manual rate has no upper bound (`expenseValidation.ts:74`). *(validation)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: A mistyped manual rate (for example, extra zeros) gives a base amount above `Number.MAX_SAFE_INTEGER`. It is stored imprecisely, possibly as a REAL, and still passes the row schema (`Number.isInteger(1e26)` is true), so the trip's totals are inflated until the expense is edited. It only happens through user error, but a sanity bound is cheap. Possible fix: cap the manual rate (digits or magnitude) and reject a non-safe result in `convertMinor`, which `applyRate` already treats as "can't convert".
- **src/features/budget/presentation/state/budgetSlice.ts:69**: `loadTripBudget` is only used by tests. Production code loads with `loadTripExpenses` and then `retryConversions`. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The thunk and its reducer branches (`pending`, and the shared fulfilled/rejected matchers) are dead in the app. Many slice tests drive this path instead of the one `useTripBudget` actually uses, which is part of why the Medium finding above isn't caught. Possible fix: remove it and move the tests to the `loadTripExpenses` + `retryConversions` path, or document why it is kept.

## Reviewed files
- README.md (skimmed)
- docs/ARCHITECTURE.md (skimmed)
- src/app/(app)/(tabs)/budget/[tripId]/breakdown.tsx
- src/app/(app)/(tabs)/budget/[tripId]/expenses/[expenseId]/edit.tsx
- src/app/(app)/(tabs)/budget/[tripId]/expenses/[expenseId]/index.tsx
- src/app/(app)/(tabs)/budget/[tripId]/expenses/index.tsx
- src/app/(app)/(tabs)/budget/[tripId]/expenses/new.tsx
- src/app/(app)/(tabs)/budget/[tripId]/index.tsx
- src/app/(app)/(tabs)/budget/_layout.tsx
- src/bootstrap/createAppContainer.ts
- src/bootstrap/databaseMigrations.ts
- src/core/di/AppDependencies.ts
- src/core/i18n/locales/en.ts (skimmed)
- src/core/i18n/locales/es.ts (skimmed)
- src/core/store/store.ts
- src/features/budget/data/CachedExchangeRateRepository.edge.test.ts (skimmed)
- src/features/budget/data/CachedExchangeRateRepository.test.ts (skimmed)
- src/features/budget/data/CachedExchangeRateRepository.ts
- src/features/budget/data/FrankfurterExchangeRateRepository.test.ts (skimmed)
- src/features/budget/data/FrankfurterExchangeRateRepository.ts
- src/features/budget/data/LocalExchangeRateCache.test.ts (skimmed)
- src/features/budget/data/LocalExchangeRateCache.ts
- src/features/budget/data/LocalExpenseRepository.edge.test.ts (skimmed)
- src/features/budget/data/LocalExpenseRepository.test.ts (skimmed)
- src/features/budget/data/LocalExpenseRepository.ts
- src/features/budget/data/budgetMigrations.ts
- src/features/budget/data/dto/frankfurterDtos.ts
- src/features/budget/data/frankfurterApi.ts
- src/features/budget/di.ts
- src/features/budget/domain/ExchangeRate.ts
- src/features/budget/domain/Expense.ts
- src/features/budget/domain/budgetCalculations.edge.test.ts (skimmed)
- src/features/budget/domain/budgetCalculations.test.ts (skimmed)
- src/features/budget/domain/budgetCalculations.ts
- src/features/budget/domain/expenseValidation.test.ts (skimmed)
- src/features/budget/domain/expenseValidation.ts
- src/features/budget/domain/repositories.ts
- src/features/budget/domain/usecases/ExpenseConverter.ts
- src/features/budget/domain/usecases/expenseConversionRefresh.test.ts (skimmed)
- src/features/budget/domain/usecases/expenseUseCases.edge.test.ts (skimmed)
- src/features/budget/domain/usecases/expenseUseCases.test.ts (skimmed)
- src/features/budget/domain/usecases/expenseUseCases.ts
- src/features/budget/presentation/components/BudgetEntryCard.tsx
- src/features/budget/presentation/components/BudgetSheet.tsx
- src/features/budget/presentation/components/BudgetStateView.tsx (skimmed)
- src/features/budget/presentation/components/BudgetSummaryCard.tsx (skimmed)
- src/features/budget/presentation/components/CategoryBreakdownChart.tsx (skimmed)
- src/features/budget/presentation/components/DailySpendingChart.tsx
- src/features/budget/presentation/components/ExchangeRateNote.tsx (skimmed)
- src/features/budget/presentation/components/ExpenseCategoryPicker.tsx (skimmed)
- src/features/budget/presentation/components/ExpenseDateSheet.tsx
- src/features/budget/presentation/components/ExpenseRow.tsx
- src/features/budget/presentation/components/PaymentMethodPicker.tsx (skimmed)
- src/features/budget/presentation/components/SpendingProgressBar.tsx
- src/features/budget/presentation/components/TripSwitcherSheet.tsx (skimmed)
- src/features/budget/presentation/components/UnconvertedBanner.tsx
- src/features/budget/presentation/format.ts
- src/features/budget/presentation/hooks/useBudgetTrip.ts
- src/features/budget/presentation/hooks/useExpense.ts
- src/features/budget/presentation/hooks/useExpenseForm.edge.test.tsx (skimmed)
- src/features/budget/presentation/hooks/useExpenseForm.manualRate.test.tsx (skimmed)
- src/features/budget/presentation/hooks/useExpenseForm.ts
- src/features/budget/presentation/hooks/useTripBudget.ts
- src/features/budget/presentation/screens/BudgetOverviewScreen.tsx
- src/features/budget/presentation/screens/BudgetScreen.tsx
- src/features/budget/presentation/screens/ExpenseDetailsScreen.tsx
- src/features/budget/presentation/screens/ExpenseFormScreen.tsx
- src/features/budget/presentation/screens/ExpenseHistoryScreen.tsx
- src/features/budget/presentation/screens/SpendingBreakdownScreen.tsx
- src/features/budget/presentation/screens/budgetFlows.test.tsx (skimmed)
- src/features/budget/presentation/state/budgetSlice.edge.test.ts (skimmed)
- src/features/budget/presentation/state/budgetSlice.test.ts (skimmed)
- src/features/budget/presentation/state/budgetSlice.ts
- src/features/budget/presentation/state/selectors.ts
- src/features/favorites/data/LocalFavoritesRepository.test.ts (skimmed)
- src/features/trips/presentation/components/CurrencySheet.tsx
- src/features/trips/presentation/screens/TripScreen.tsx
- src/shared/navigation/deepLinks.test.ts (skimmed)
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/routes.ts
- src/testing/budgetFixtures.ts (skimmed)
- src/testing/testDependencies.ts
- Test files, docs and locale files were skimmed, not reviewed line by line
