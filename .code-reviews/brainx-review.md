---
diff_hash: 7de5502fec0d10dd1c0b8cbbdee997edd5c1d26fdcf02e99a201a2707b622d79
reviewed_at: 2026-11-19T12:12:08Z
---

## Summary

Feature 08, the trip itinerary, staged on `develop`. It adds day-by-day activities for each trip. Each activity has a category, optional start and end times, a place, an estimated cost, notes, a manual order within its day and a completed flag. Like trips, activities are stored in on-device SQLite per account and work offline. The only network call is the optional place search in the form.

Fresh review. A `brainx-review.md` existed, but it was the review for feature 07, which is already committed (`ebcdaa1`) and merged into `develop` (#5). None of its findings concern this diff, so this review replaces it, following the convention of earlier reviews in this repo. `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, also the earlier convention. Everything was already staged with `git add -A`, so option (b), all changes, applies.

**Scope (76 files).**
- `features/itinerary`:
  - Domain: the `Activity` entity, `LocalTime`, validation (including the duplicate rule and the 50-per-day limit), grouping by day, progress, cost totals, time conflicts, ports, and use cases.
  - Data: `LocalActivityRepository` and migration 2 (the `activities` table, cascading from `trips`).
  - Presentation: the slice and selectors, hooks, the overview, day, details and form screens, a drag-to-reorder list, and the time, day and place sheets.
- Integration: five Expo Router routes (overview, day, new, details, edit) that replace the placeholder `ItineraryItemScreen`, deep links, DI, the store, en/es strings, icons, an entry card on `TripScreen`, docs, and test helpers (a Reanimated mock, Gesture Handler setup, fixtures).

**Stack.** React (`react` in dependencies, no NestJS marker). The runtime is Expo / React Native with Expo Router, Redux Toolkit and Reanimated with Gesture Handler. React criteria were applied with React Native semantics: `StyleSheet` and theme tokens instead of CSS classes, and `ScrollView`/`FlatList` for list virtualisation.

**Checked in particular (no finding):**
- Every SQL statement is parameterised and filtered on `owner_id`.
- Use cases read the owner once and check that the trip exists for that owner before listing or creating.
- Repository changes that move positions (insert, update across days, delete, reorder) run in one transaction, and both days stay numbered 0..n-1.
- The slice mirrors the same renumbering, ignores stale results by request id, drops everything on sign-out, sign-in and session expiry, and drops a trip's activities when the trip is deleted.
- The `changeRequestId` lock stops double saves.
- Stored rows are validated with zod before use, and unreadable rows keep their place when a day is reordered.
- Deep links match the words `new` and `day` before the item-id pattern, and validate dates with `isLocalDate`.
- Time comparison uses fixed-width `HH:mm` text, consistent in SQL CHECKs and the domain.
- Overlap detection is half-open, so back-to-back activities don't overlap.
- The leave guard and the post-save navigation wait a macrotask, as in the trip form.
- The drag list resets its settling state when the new order renders or the save fails.

**Security (no finding).** No secrets were added. User text reaches SQL only as bound parameters, and nothing renders HTML. Route ids go through `parseRouteId` and dates through `isLocalDate`. Directions links use the existing `buildDirectionsUrls`/`openExternalUrl` helpers. The location permission flow reuses the map's use cases. No new native modules or permissions were added.

**Verification on the staged tree.** `tsc --noEmit` exits 0 and `expo lint` exits 0. Jest passes 140 suites and 1,655 tests. Jest also printed one "environment torn down" warning from the existing `weatherApi.test.ts`, which is unrelated to this diff. The app was not run on a device or simulator. The two performance findings are inferred from the code, not measured.

**Not reviewed in depth.** The test files were skimmed for coverage of the paths named above, not line by line. `es.ts` was checked for parity with `en.ts` (154 lines added to each, with matching plural keys) but not for translation quality.

**Cross-repo.** Only one repository is involved.

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **src/features/itinerary/presentation/components/TripDaySheet.tsx:28**: The day picker builds one chip per trip day, up to 366, with a new `Intl.DateTimeFormat` for each label, on every render of the activity form, including every keystroke, even while the sheet is closed. *(performance)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: `ActivityForm` always renders `<TripDaySheet visible={sheet === 'day'} days={days} …>` (`ActivityFormScreen.tsx:340`), and `days = tripDays(trip)` is recomputed on every render (`ActivityFormScreen.tsx:95`). `TripDaySheet` runs `days.map(… formatDayLabel(date, …))` in its own render before `AppBottomSheet` decides whether to mount anything. `formatDayLabel` calls `formatTripDate`, which builds a new `Intl.DateTimeFormat` on each call (`trips/presentation/format.ts:16`). Each `change()` in `useActivityForm` updates state and re-renders the form. For a year-long trip (`TRIP_LIMITS.maxDurationDays` is 366), each character typed into the title, notes or cost therefore costs 366 `addDays` calls, 366 formatter constructions and 366 chip elements. On Hermes on a mid-range Android device, that is likely to make typing lag. Suggested fix: return `null` from `TripDaySheet` (or render the chips only) when `!visible`, memoise `days` with `useMemo` in the form, and reuse one `Intl.DateTimeFormat` per language for the labels. Not measured on a device.
- **src/features/itinerary/presentation/screens/ItineraryOverviewScreen.tsx:75**: The overview renders every trip day, up to 366 `DayCard`s, in a plain `ScrollView`, and `memo(DayCard)` never takes effect, so any change to the itinerary re-renders all the cards. *(performance)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: `Screen` is a `ScrollView`, and `groups.days.map(…)` mounts a card for every trip day at once. The comment at line 112 notes that a trip can be a year long. `DayCard` is wrapped in `memo`, but `groupByDay` builds new `day` objects whenever the `activities` array changes, so every card re-renders, and each one calls `formatDayLabel` (a new `Intl.DateTimeFormat`) and `dayTimeSpan`. The overview stays mounted in the stack under the day and details screens. Ticking an activity done, reordering, or saving one there updates the store and re-renders all 366 cards in the background. The React criteria ask for lists that can grow to be virtualised. Suggested fix: render the days with a `FlatList` (fixed or estimated item height), with the header, totals and outside-trip section as `ListHeaderComponent`. Also pass `DayCard` props that stay referentially stable for unchanged days, for example memoise per-day arrays by date, or compare `day.activities` items shallowly in `memo`. Not measured on a device.

### Low (1)
- **src/features/itinerary/presentation/components/LocationSheet.tsx:82**: The place search sends queries shorter than the 2-character minimum, from the keyboard's search key or the Search button. The traveller then gets the generic "Something about this request wasn't right. Please try again." error instead of guidance. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The Search button is disabled only when `!query.trim()`, so a 1-character query can be searched. `onSubmitEditing` has no check at all, so an empty query can be submitted from the keyboard. `SearchPlaces` rejects anything shorter than `SEARCH_QUERY_MIN` (2) with `badRequest`, and the sheet shows `t(getErrorMessageKey('badRequest'))`, which tells the user to "try again", but retrying can't succeed. The explore map already handles this case with `map.searchTooShort` (`ExploreMapScreen.tsx:154`). Suggested fix: disable the button and ignore submit while `query.trim().length < SEARCH_QUERY_MIN`, and show the same too-short hint as the map, or reuse its string.

## Reviewed files
- README.md
- docs/ARCHITECTURE.md
- jest.setup.ts
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId].tsx
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]/edit.tsx
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/day/[date].tsx
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/index.tsx
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/new.tsx
- src/app/(app)/(tabs)/trips/_layout.tsx
- src/bootstrap/createAppContainer.ts
- src/bootstrap/databaseMigrations.ts
- src/core/di/AppDependencies.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts (checked for parity with en.ts)
- src/core/store/store.ts
- src/features/itinerary/data/LocalActivityRepository.ts
- src/features/itinerary/data/LocalActivityRepository.test.ts (skimmed)
- src/features/itinerary/data/LocalActivityRepository.edge.test.ts (skimmed)
- src/features/itinerary/data/itineraryMigrations.ts
- src/features/itinerary/di.ts
- src/features/itinerary/domain/Activity.ts
- src/features/itinerary/domain/activityValidation.ts
- src/features/itinerary/domain/activityValidation.test.ts (skimmed)
- src/features/itinerary/domain/dayNumberOf.test.ts (skimmed)
- src/features/itinerary/domain/itinerary.ts
- src/features/itinerary/domain/itinerary.test.ts (skimmed)
- src/features/itinerary/domain/itinerary.edge.test.ts (skimmed)
- src/features/itinerary/domain/localTime.ts
- src/features/itinerary/domain/localTime.test.ts (skimmed)
- src/features/itinerary/domain/repositories.ts
- src/features/itinerary/domain/timeConflicts.ts
- src/features/itinerary/domain/timeConflicts.test.ts (skimmed)
- src/features/itinerary/domain/usecases/activityUseCases.ts
- src/features/itinerary/domain/usecases/activityUseCases.test.ts (skimmed)
- src/features/itinerary/domain/usecases/activityUseCases.edge.test.ts (skimmed)
- src/features/itinerary/presentation/components/ActivityRow.tsx
- src/features/itinerary/presentation/components/CategoryPicker.tsx
- src/features/itinerary/presentation/components/ItineraryEntryCard.tsx
- src/features/itinerary/presentation/components/ItineraryStateView.tsx
- src/features/itinerary/presentation/components/LocationSheet.tsx
- src/features/itinerary/presentation/components/LocationSheet.test.tsx (skimmed)
- src/features/itinerary/presentation/components/ProgressCard.tsx
- src/features/itinerary/presentation/components/ReorderableActivityList.tsx
- src/features/itinerary/presentation/components/ReorderableActivityList.test.tsx (skimmed)
- src/features/itinerary/presentation/components/ReorderableActivityList.review.test.tsx (skimmed)
- src/features/itinerary/presentation/components/TimeSheet.tsx
- src/features/itinerary/presentation/components/TripDaySheet.tsx
- src/features/itinerary/presentation/format.ts
- src/features/itinerary/presentation/format.test.ts (skimmed)
- src/features/itinerary/presentation/format.edge.test.ts (skimmed)
- src/features/itinerary/presentation/hooks/useActivityForm.ts
- src/features/itinerary/presentation/hooks/useActivityForm.edge.test.tsx (skimmed)
- src/features/itinerary/presentation/hooks/useItinerary.ts
- src/features/itinerary/presentation/reorder.ts
- src/features/itinerary/presentation/reorder.test.ts (skimmed)
- src/features/itinerary/presentation/screens/ActivityDetailsScreen.tsx
- src/features/itinerary/presentation/screens/ActivityFormScreen.tsx
- src/features/itinerary/presentation/screens/DailyItineraryScreen.tsx
- src/features/itinerary/presentation/screens/ItineraryOverviewScreen.tsx
- src/features/itinerary/presentation/screens/ItineraryOverviewScreen.test.tsx (skimmed)
- src/features/itinerary/presentation/screens/itineraryFlows.test.tsx (skimmed)
- src/features/itinerary/presentation/screens/itineraryScreens.edge.test.tsx (skimmed)
- src/features/itinerary/presentation/state/itinerarySlice.ts
- src/features/itinerary/presentation/state/itinerarySlice.test.ts (skimmed)
- src/features/itinerary/presentation/state/itinerarySlice.edge.test.ts (skimmed)
- src/features/itinerary/presentation/state/selectors.ts
- src/features/trips/presentation/screens/ItineraryItemScreen.tsx (deleted)
- src/features/trips/presentation/screens/TripScreen.tsx
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/deepLinks.edge.test.ts
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/itineraryFixtures.ts (skimmed)
- src/testing/reanimatedMock.ts (skimmed)
- src/testing/testDependencies.ts
