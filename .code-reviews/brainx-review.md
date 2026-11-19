---
diff_hash: 86c1782b71d48072a3097323b9a40bfdc4832233061737626baf5b06e11224b9
reviewed_at: 2026-11-19T07:31:17Z
---

## Summary

Feature 07, trip management, on `feat/feature-07-trip-management` (branched from `develop` at `9071ac2`). This adds offline trips: create, edit, cancel, restore and delete, stored in on-device SQLite with no backend and kept separate per signed-in account.

Fresh review. A `brainx-review.md` existed, but it was the review for the feature 06 merge, which is already committed and squash-merged into `develop` (#4). None of its findings concern this diff, so this review replaces it, following the convention of earlier reviews in this repo. `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, also the earlier convention. Everything was already staged with `git add -A`, so option (b), all changes, applies.

**Scope (79 files).**
- `core/database`: a `SqlDatabase` port, a serialised `SqliteDatabase` with lazy open, forward-only `PRAGMA user_version` migrations and transactions, and an expo-sqlite driver.
- `features/trips`:
  - Domain: the entity, `localDate`, derived status, validation and the overlap rule, money in minor units, ports, and use cases.
  - Data: `LocalTripRepository`, a filesystem cover store, the image picker, the session-backed owner provider, and migrations.
  - Presentation: the slice and selectors, hooks, sheets and six screens.
- Integration: routes and deep links, DI, the store, en/es strings, `app.json` plugins (expo-sqlite, expo-image-picker, expo-asset), `metro.config.js` (wasm and COOP/COEP for web SQLite), docs, and test helpers (`node:sqlite`-backed driver, fixtures).

**Stack.** React (`react` in dependencies, no NestJS marker). The runtime is Expo SDK 58 / React Native 0.88, so React criteria were applied with RN semantics: `StyleSheet` and theme tokens instead of CSS classes, and Expo Router `Stack.Protected` guards instead of a `ProtectedRoute` HOC.

**Checked in particular:**
- Every SQL statement is parameterised and filtered on `owner_id`. Update and delete on another account's trip return `notFound`.
- Use cases read the owner once and return `unauthorized` when signed out.
- The slice drops its copy on sign-out, session expiry and sign-in, and ignores stale load and change results by request id.
- Cover references are pattern-checked, so a tampered value can't escape `trip-covers/`. A copied photo is removed again when the save fails, and the old photo is removed only after the update commits.
- The overlap rule uses half-open comparison in both SQL and the domain.
- Date maths is UTC-anchored, so DST has no effect.
- The leave guard and the save navigation don't loop.
- Deep-link words (`new`, `upcoming`, `completed`) are matched before the trip-id pattern.
- Migrations and their version bump commit atomically, and a newer schema is refused.

**Security (no finding).** No secrets were added. User text only ever reaches SQL as bound parameters. Rows read back are validated with zod and corrupt ones are skipped. Nothing renders HTML. The photo picker needs no library permission, and camera and microphone permissions are explicitly disabled. The separation between accounts is enforced by the app; the database file itself isn't encrypted (documented).

**Verification on the staged tree.** `tsc --noEmit` exits 0, `expo lint` exits 0, and `prettier --check .` is clean. Jest passes 117 suites and 1342 tests. `expo export` succeeds for iOS, Android and web. Not run on a device or simulator.

**Not reviewed in depth.** `package-lock.json` was checked for the dependency changes only (expo-sqlite, expo-image-picker, expo-file-system, expo-asset). `es.ts` was skimmed for parity with `en.ts`.

**Cross-repo.** Only one repository is involved.

**Re-review (2026-11-19T07:31:17Z).** The staged diff now also includes the fix for the one finding: `dateRangeSelection.ts` and its test, and `DateRangeSheet.tsx`. Only the finding's lines were re-evaluated, and no new findings were raised. Re-verified: `tsc --noEmit` exits 0, `expo lint` exits 0, `prettier --check .` is clean, and Jest passes 117 suites and 1344 tests.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (1)
- **src/features/trips/presentation/components/DateRangeSheet.tsx:56** — The calendar's month arrows have no bounds, and paging before January 1900 crashes the date sheet. *(correctness)*
  - status: fixed
  - dev_reasoning: Fixed. The visible month is clamped to January 1900 to December 9999, and the arrow at each end is disabled.
  - ai_reasoning: Re-review. `moveMonth` now calls `shiftMonth`, which clamps the month index to January 1900 to December 9999, so `firstDay` is always a valid `LocalDate` and `dayOfWeek` can't throw. Each arrow is disabled when `canShiftMonth` says it can't move, and `AppIconButton` passes `disabled` through to its accessibility state. New tests cover year rollover, both clamps and `canShiftMonth` at each end. Original issue: `moveMonth` changed `visibleMonth` without limit. `parseLocalDate` rejects years before 1900, so for a month before 1900 the render calls `dayOfWeek(firstDay)`, and `toUtcDay` throws `RangeError`, a render error. It takes about 1,500 taps on "previous month" from today, so it's very unlikely in practice. Suggested fix: clamp the visible month to the supported range (January 1900 to December 9999), disable the arrow at each end, and test it.

## Reviewed files
- README.md
- app.json
- docs/ARCHITECTURE.md
- metro.config.js
- package.json
- package-lock.json (dependency changes only)
- src/app/(app)/(tabs)/trips/[tripId]/edit.tsx
- src/app/(app)/(tabs)/trips/_layout.tsx
- src/app/(app)/(tabs)/trips/completed.tsx
- src/app/(app)/(tabs)/trips/new.tsx
- src/app/(app)/(tabs)/trips/upcoming.tsx
- src/bootstrap/coreFactories.ts
- src/bootstrap/createAppContainer.ts
- src/bootstrap/databaseMigrations.ts
- src/core/database/ExpoSqliteDriver.ts
- src/core/database/ExpoSqliteDriver.test.ts
- src/core/database/SqlDatabase.ts
- src/core/database/SqliteDatabase.ts
- src/core/database/SqliteDatabase.test.ts
- src/core/database/SqliteDriver.ts
- src/core/database/migrations.ts
- src/core/di/AppDependencies.ts
- src/core/di/CoreDependencies.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts (skimmed for parity with en.ts)
- src/core/store/store.ts
- src/features/trips/data/ExpoImagePickerService.ts
- src/features/trips/data/ExpoImagePickerService.test.ts
- src/features/trips/data/FileSystemTripCoverStore.ts
- src/features/trips/data/FileSystemTripCoverStore.test.ts
- src/features/trips/data/LocalTripRepository.ts
- src/features/trips/data/LocalTripRepository.test.ts
- src/features/trips/data/SessionTripOwnerProvider.ts
- src/features/trips/data/SessionTripOwnerProvider.test.ts
- src/features/trips/data/tripMigrations.ts
- src/features/trips/di.ts
- src/features/trips/domain/Trip.ts
- src/features/trips/domain/localDate.ts
- src/features/trips/domain/localDate.test.ts
- src/features/trips/domain/money.ts
- src/features/trips/domain/money.test.ts
- src/features/trips/domain/repositories.ts
- src/features/trips/domain/tripStatus.ts
- src/features/trips/domain/tripStatus.test.ts
- src/features/trips/domain/tripValidation.ts
- src/features/trips/domain/tripValidation.test.ts
- src/features/trips/domain/usecases/PickCoverImage.ts
- src/features/trips/domain/usecases/tripUseCases.ts
- src/features/trips/domain/usecases/tripUseCases.test.ts
- src/features/trips/presentation/components/ConfirmSheet.tsx
- src/features/trips/presentation/components/CurrencySheet.tsx
- src/features/trips/presentation/components/DateRangeSheet.tsx
- src/features/trips/presentation/components/DestinationSheet.tsx
- src/features/trips/presentation/components/PickerField.tsx
- src/features/trips/presentation/components/TripCard.tsx
- src/features/trips/presentation/components/TripStatusBadge.tsx
- src/features/trips/presentation/dateRangeSelection.ts
- src/features/trips/presentation/dateRangeSelection.test.ts
- src/features/trips/presentation/format.ts
- src/features/trips/presentation/format.test.ts
- src/features/trips/presentation/hooks/useToday.ts
- src/features/trips/presentation/hooks/useTripForm.ts
- src/features/trips/presentation/hooks/useTrips.ts
- src/features/trips/presentation/screens/TripFormScreen.tsx
- src/features/trips/presentation/screens/TripListScreen.tsx
- src/features/trips/presentation/screens/TripScreen.tsx
- src/features/trips/presentation/screens/TripScreen.test.tsx
- src/features/trips/presentation/screens/TripsScreen.tsx
- src/features/trips/presentation/screens/tripFlows.test.tsx
- src/features/trips/presentation/state/selectors.ts
- src/features/trips/presentation/state/tripsSlice.ts
- src/features/trips/presentation/state/tripsSlice.test.ts
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/nodeSqliteDriver.ts
- src/testing/testDependencies.ts
- src/testing/tripFixtures.ts
