---
diff_hash: 9d9e305e37c09236e8822fdb0c3499a08d1560f8914f2ddacc27ac88b1d30230
reviewed_at: 2026-11-11T18:56:04Z

## Summary

Feature 1, destination discovery and search. The placeholder `explore` and `destinations` features are replaced by a `discover` feature in three layers. **Data:** a REST Countries v5 repository (API key via `EXPO_PUBLIC_RESTCOUNTRIES_API_KEY`, paged catalogue, per-object validation, demo-key and 401 mapped to a new `configuration` error kind), a Wikipedia repository (page summaries and title search, `Api-User-Agent`), in-memory TTL/LRU caching decorators with request coalescing, and AsyncStorage-backed search history and recently viewed. **Domain:** `DestinationId` (country / curated slug / base64url place ids, with a strict UTF-8 decoder), search matching and ranking, filters, editorial catalogue, and use cases for search, details, the feed (featured, trending, popular, recommendations), filter options and history. **Presentation:** an RTK Query `discoverApi` whose `queryFn`s call the use cases, a `discoverSlice` for history, and the Discover, Search and Destination screens with a filter sheet. Also: a new shared `AppChip`, new icons, a `/search` route and deep link, longer destination route ids (`parseDestinationRouteId`), en/es copy, `.env.example`, a Jest after-each hook that resets RTK Query stores, docs, and about 50 new test files.

Fresh review. A `brainx-review.md` existed, but it was the review for 8992404 (navigation and auth), which was committed and already finalized in the ledger by f659319. None of its findings concern this diff, and a Step 4 re-review cannot raise new findings, so this review replaces it. The developer chose to review all changes, so `git add -A` was run first. `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, the convention prior reviews in this repo used, so the hash doesn't depend on the review file itself.

Stack: React (`react` in dependencies, no NestJS marker). The runtime is React Native / Expo SDK 58, so the web-only criteria in `react.md` (CSS class naming, CSS variables, `dangerouslySetInnerHTML`, React Router 404, httpOnly cookies) were not applied. Hooks, state management (RTK / RTK Query), routing, data fetching, error handling, typing, accessibility and security criteria were.

Suspicions checked and dismissed: (1) `BearerTokenAuth` on the REST Countries client only attaches a header (`core/http/strategies/AuthStrategy.ts:40`), so a 401 there can't trigger the DummyJSON session renewal or sign-out. (2) The API key is `EXPO_PUBLIC_*` and therefore public; this is documented in `apis.ts`, `.env.example` and the README, and `.env*.local` is gitignored. (3) URLs from both APIs reach `expo-image` and `Linking.openURL` only through `toHttpsUrl` (https only). Route and deep-link ids are charset-checked (`[A-Za-z0-9_-]{1,400}`) and then parsed strictly (`parseDestinationId`, with control characters, overlong UTF-8 and surrogates rejected). (4) Search races: RTK Query keys the cache on (query, filters), and `isError` is per argument, so an old failure or response can't attach to a new query. (5) `DiscoveryHistory` read-modify-write: mutators read the live snapshot synchronously after `await load()` and queue writes, so concurrent changes don't drop each other. (6) Destination screen opened by deep link before the Explore home mounts: `recordView` awaits `load()` itself, so the disk history isn't overwritten.

Verified with a throwaway probe test (deleted afterwards): with a synthetic 240-country catalogue, browsing the "City" category returns 50 results ending at "Capital 048", browsing a region holding 58 countries returns 50, and `GetCuratedCollection('featured')` with both sources offline returns `ok` with cards that have no image, description, country name or flag (see findings).

Skimmed, not read line by line: the ~50 test files (the suite passes; fixtures were read where probes relied on them), `editorial.ts` beyond its type and first entries (static data), the en/es locale additions (key parity is enforced by the compiler; spot-checked the strings findings refer to), and `README.md` / `docs/ARCHITECTURE.md` (checked for consistency with the code). Not verified on a device or simulator: image loading, the filter bottom sheet with the keyboard, and native-tab behaviour of the new `search` screen.

Verification run before writing this review: `npm run check` (tsc, expo lint, prettier --check, jest) is clean, with 53 suites / 476 tests passing.

Cross-repo: only one repository has staged changes.

Re-review (2026-11-11T18:56:04Z): the staged diff changed since the review above. All five findings were re-evaluated against the changed lines and are fixed (details per finding). Changes since the last review also add `src/shared/navigation/openExternalUrl.ts` (+ test), touch `AppChip`, `FilterSheet`, `DestinationScreen`, `discoverFeed`, `SearchDestinations` and their tests, and add the `destination.openLinkFailed` copy. Per the re-review rules, no new findings were raised. Verification: `npm run check` (tsc, expo lint, prettier --check, jest) is clean, with 54 suites / 484 tests passing.

## Findings

### Critical (0)

### High (1)
- **src/features/discover/domain/usecases/SearchDestinations.ts:86** — Browse mode (empty query, active filters) silently truncates an alphabetically sorted list to `MAX_RESULTS` (50), and the screen reports the truncated count as the total ("50 destinations"). Tapping the **City** category chip on the Explore home (`routes.search({ category: 'city' })`) browses every capital (~245) plus the curated cities, so the user sees only cities from A to roughly C and has no way to page further. Region browsing loses the same tail: "Africa" (about 58 entries in REST Countries) drops the last ~8 alphabetically (e.g. Zambia and Zimbabwe), and "Europe" and "Americas" are also over 50. Confirmed with a probe: a "city" browse over 240 countries returned 50 results ending at "Capital 048", and a 58-country region returned 50. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `SearchDestinations.execute` now returns browse results uncapped (line 89, with a comment explaining why); `MAX_RESULTS` is applied only to ranked search (line 110), and the constant's doc comment says so. `SearchDestinations.test.ts` adds 'does not cap browsing, so the end of the alphabet is reachable': a region browse over `MAX_RESULTS + 10` countries returns all of them, ending at the last one alphabetically, and a city browse returns at least that many. 'caps ranked search results' keeps the cap covered for search.

### Medium (2)
- **src/features/discover/domain/usecases/discoverFeed.ts:29** — Feed failures become cached successes that are never retried. `loadCountryIndex` turns a catalogue failure into an empty map, and `enrichCurated` (lines 45–60) turns Wikipedia failures into cards with no photo or description. `GetCuratedCollection` therefore returns `ok` even when every source failed. If the app opens offline (or REST Countries/Wikipedia hiccups once), Featured and Trending render as bare placeholder cards with no country name or flag, and `SectionState` shows no error, so there's no retry. The Explore screen is a tab root that stays mounted, and nothing refetches (no `refetchOnFocus` / `refetchOnReconnect` / `setupListeners`, no pull-to-refresh), so that degraded result stays for the whole app session. Popular, by contrast, fails properly and offers retry. Confirmed with a probe: with `getAll` and `getSummary` both returning `offline`, `execute({ collection: 'featured' })` returned `ok` with `{"countryName":null,"description":null,"imageUrl":null,"flagEmoji":null,…}`. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `loadCountryIndex` now reports the catalogue error alongside the empty index, and `enrichCurated` reports `allFailed` when every summary failed. `GetCuratedCollection` (lines 105–116) returns an error for any retryable catalogue failure and when every summary failed, so `SectionState` shows its retry and nothing degraded is cached as a success. A missing API key (`configuration`) still degrades to cards without the country, since retrying can't fix it, and recommendations intentionally ignore `allFailed`. `discoverFeed.test.ts` covers catalogue offline, every summary failing, both offline, and the configuration case. Not done: `refetchOnReconnect` / pull-to-refresh (the ai_reasoning offered it as optional); a failed section now recovers through its retry button.
- **src/features/discover/presentation/screens/DestinationScreen.tsx:261** — A failed Wikipedia description is cached as part of a successful details result, and the screen gives no way to retry. `describePlace` returns `ok({ status: 'failed' })` for a network or server error, so `destinationDetails` is fulfilled and RTK Query keeps it for `CACHE_SECONDS.details` (30 minutes after the screen unmounts). The About card then shows "We couldn't load the description right now." with no retry, and revisiting the destination within 30 minutes (from recents, a neighbour chip or search) serves the same cached failure. `useDestinationDetails` already returns `retry` and `refreshing`, but they're only wired to the full-screen error state. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `About` now takes `onRetry` / `refreshing` from `useDestinationDetails` (threaded through `CountryDetails` and `PlaceDetails`) and shows a 'Try again' button with a loading state when `description.status === 'failed'` (lines 294–304). The retry refetches the details query, which replaces the cached failure. `DestinationScreen.test.tsx` adds 'still shows the country when the description fails to load, and retries it': the summary fails with 503, then succeeds after pressing Try again, and the extract replaces the failure message.

### Low (2)
- **src/features/discover/presentation/screens/DestinationScreen.tsx:252** — `void Linking.openURL(...)` discards the promise, so if the URL can't be opened (no browser, restricted profile, or a web build blocked by the popup blocker), the result is an unhandled promise rejection and the button silently does nothing. The `?? ''` fallback is also dead code: the button only renders when `articleUrl` is truthy, and if it were ever reached it would ask the OS to open an empty URL. *(error-handling)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. New shared helper `src/shared/navigation/openExternalUrl.ts` awaits `Linking.openURL` in a try/catch, logs failures through the passed logger, and resolves `false` instead of rejecting. `About` captures `articleUrl` inside the guard (no `?? ''`), calls the helper with a `destination`-scoped logger, and shows an `InlineMessage` (`destination.openLinkFailed`, en/es) when opening fails. Covered by `openExternalUrl.test.ts` (success and rejection) and the screen test 'tells the user when the article link cannot be opened'.
- **src/features/discover/presentation/components/FilterSheet.tsx:154** — `FilterGroup` declares `accessibilityRole="radiogroup"`, but its children are `AppChip`s with `accessibilityRole="button"` and a `selected` state. Screen readers announce a radio group with no radio buttons, and VoiceOver/TalkBack users don't get the "1 of 7" position or the single-choice semantics the role promises. *(accessibility)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `FilterGroup` no longer declares `accessibilityRole="radiogroup"` (comment at line 154 records why); the chips stay toggle buttons announcing `selected`, matching their actual semantics.

## Reviewed files
- .env.example
- README.md
- docs/ARCHITECTURE.md
- jest.afterEnv.ts
- package.json
- src/app/(app)/(tabs)/(explore)/_layout.tsx
- src/app/(app)/(tabs)/(explore)/destinations/[destinationId].tsx
- src/app/(app)/(tabs)/(explore)/explore.tsx
- src/app/(app)/(tabs)/(explore)/search.tsx
- src/bootstrap/createAppContainer.ts
- src/core/di/AppDependencies.ts
- src/core/errors/AppError.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/store/store.ts
- src/features/destinations/presentation/screens/DestinationScreen.tsx
- src/features/discover/data/RestCountriesRepository.test.ts
- src/features/discover/data/RestCountriesRepository.ts
- src/features/discover/data/StorageDiscoveryHistoryRepository.test.ts
- src/features/discover/data/StorageDiscoveryHistoryRepository.ts
- src/features/discover/data/WikipediaPlaceContentRepository.test.ts
- src/features/discover/data/WikipediaPlaceContentRepository.ts
- src/features/discover/data/apis.ts
- src/features/discover/data/caching.test.ts
- src/features/discover/data/caching.ts
- src/features/discover/data/dto/restCountriesDtos.ts
- src/features/discover/data/dto/wikipediaDtos.ts
- src/features/discover/data/mappers.ts
- src/features/discover/di.ts
- src/features/discover/domain/Country.ts
- src/features/discover/domain/Destination.ts
- src/features/discover/domain/DestinationId.test.ts
- src/features/discover/domain/DestinationId.ts
- src/features/discover/domain/SearchFilters.test.ts
- src/features/discover/domain/SearchFilters.ts
- src/features/discover/domain/dayPeriod.test.ts
- src/features/discover/domain/dayPeriod.ts
- src/features/discover/domain/editorial.ts
- src/features/discover/domain/repositories.ts
- src/features/discover/domain/searchMatching.test.ts
- src/features/discover/domain/searchMatching.ts
- src/features/discover/domain/usecases/GetDestinationDetails.test.ts
- src/features/discover/domain/usecases/GetDestinationDetails.ts
- src/features/discover/domain/usecases/GetFilterOptions.ts
- src/features/discover/domain/usecases/SearchDestinations.test.ts
- src/features/discover/domain/usecases/SearchDestinations.ts
- src/features/discover/domain/usecases/describePlace.ts
- src/features/discover/domain/usecases/discoverFeed.test.ts
- src/features/discover/domain/usecases/discoverFeed.ts
- src/features/discover/domain/usecases/discoveryHistory.test.ts
- src/features/discover/domain/usecases/discoveryHistory.ts
- src/features/discover/presentation/categoryIcons.ts
- src/features/discover/presentation/components/DestinationCards.tsx
- src/features/discover/presentation/components/DestinationImage.tsx
- src/features/discover/presentation/components/FilterSheet.tsx
- src/features/discover/presentation/components/Section.tsx
- src/features/discover/presentation/format.ts
- src/features/discover/presentation/hooks/useDayPeriod.ts
- src/features/discover/presentation/hooks/useDebouncedValue.test.ts
- src/features/discover/presentation/hooks/useDebouncedValue.ts
- src/features/discover/presentation/hooks/useDestinationDetails.ts
- src/features/discover/presentation/hooks/useDestinationSearch.ts
- src/features/discover/presentation/hooks/useDiscoverHome.ts
- src/features/discover/presentation/screens/DestinationScreen.test.tsx
- src/features/discover/presentation/screens/DestinationScreen.tsx
- src/features/discover/presentation/screens/DiscoverScreen.test.tsx
- src/features/discover/presentation/screens/DiscoverScreen.tsx
- src/features/discover/presentation/screens/SearchScreen.test.tsx
- src/features/discover/presentation/screens/SearchScreen.tsx
- src/features/discover/presentation/state/discoverApi.test.ts
- src/features/discover/presentation/state/discoverApi.ts
- src/features/discover/presentation/state/discoverSlice.ts
- src/features/discover/presentation/state/selectors.ts
- src/features/explore/presentation/screens/ExploreScreen.test.tsx
- src/features/explore/presentation/screens/ExploreScreen.tsx
- src/features/shell/presentation/navigation.ts
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/openExternalUrl.test.ts
- src/shared/navigation/openExternalUrl.ts
- src/shared/navigation/routes.ts
- src/shared/ui/AppChip.test.tsx
- src/shared/ui/AppChip.tsx
- src/shared/ui/icons.ts
- src/shared/ui/index.ts
- src/testing/FakeHttpClient.ts
- src/testing/createTestStore.ts
- src/testing/discoverFixtures.ts
- src/testing/renderWithProviders.tsx
- src/testing/testDependencies.ts
