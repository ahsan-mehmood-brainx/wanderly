---
diff_hash: c79edaf2e50e0cc28b30141ba33045f1c81f547984aef6f848ded61e91ef716a
reviewed_at: 2026-11-17T19:21:01Z

## Summary

Adds the Explore map feature (`features/map/`, route `/map`, deep link `wanderly://map`). It covers device location through expo-location, nearby places from Overpass, place search through Nominatim, client-side category filters, saved pins, a details sheet and directions. The OSM services sit behind a request throttle (1 s / 2 s spacing, 429 cooldown) and in-memory caches, and the centre is rounded to 3 decimals before it leaves the device. The map is the platform's own through react-native-maps. On Android it is not mounted unless a Google Maps key is configured or the app is running in Expo Go. Web gets a `.web.tsx` placeholder. The diff also adds a react-native-maps Jest mock and a global `syncSafeAct` patch of RNTL's internal `act` (installed in `jest.afterEnv.ts`, together with `jest.clearAllMocks()` after each test), plus i18n (en/es), README and ARCHITECTURE updates, and a Map button on Discover.

Review type: fresh. The existing `.code-reviews/brainx-review.md` belonged to the already-finalized weather commit (59d57d5). None of its findings or files are in this diff, so this file replaces it and is not a re-review. Note: the ledger shows 14b8f46 also recorded "1 resolved" from that stale file, so the hooks may be carrying a previous review forward.

Stack: React (`react` 19.3.0 in `package.json`, no NestJS marker). This is an Expo SDK 58 / React Native 0.88 app, so the React criteria were applied with RN semantics. Only one repository has staged changes, so no cross-repo check applies.

Verification run during review: `npx tsc --noEmit` exits 0, `npx expo lint` exits 0, and `npx jest` passes all 101 suites (1069 tests). No `.only`, `.skip`, `console.*`, `debugger` or hardcoded keys appear in added lines.

Security notes (no finding): place websites are limited to `http(s)` before opening, phone numbers are display-only, and nothing renders HTML. No API keys are added; the Google Maps key is read from app config at runtime and is not committed. Saved pins are parsed entry by entry with zod.

Files only skimmed: the `*.test.ts(x)` suites (checked for focus/skip markers and run). `src/testing/mapFixtures.ts` and `es.ts` were skimmed for parity with `en.ts`.

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **src/features/map/presentation/hooks/useMapLocation.ts:58** — While the map screen stays mounted, the device position is read only once. Nothing re-reads it: returning to the foreground refetches only after an error (`errorKind` must be set), and "My location" (`returnToDevice` in `useExploreMap.ts:297`) recentres on the cached `device` coordinate without refetching. *(correctness)*
  - status: open
  - dev_reasoning: Fixed. `mapApi.currentLocation` now stores `{ coordinates, readAt }` (readAt from the injected clock, same pattern as `weatherApi.deviceLocation`). `useMapLocation` re-reads the position on foreground when it failed or is older than `MAP_CACHE_SECONDS.currentLocation` (2 min), and exposes `refreshIfStale`, which "My location" (`returnToDevice`) now calls. Tests in `ExploreMapScreen.edge.test.tsx` cover fresh vs. stale on foreground and on "My location" (camera and nearby places follow the new position).
  - ai_reasoning: Example: the user opens the map at the hotel, backgrounds the app and walks across town (or comes back the next day with the screen still on the Explore stack). The blue dot (`showsUserLocation`) is in the new spot, but "My location" moves the camera back to the hotel and the nearby places are still the hotel's. The only way to refresh is to leave the screen for more than 2 min (`keepUnusedDataFor`). This also departs from the pattern the weather feature set up one commit earlier (59d57d5), which re-reads the device position on foreground when it is more than 2 min old. Suggested fix: store when the fix was read and refetch `currentLocation` on foreground when it is stale. Have "My location" refetch when the fix is stale as well.
- **src/features/map/presentation/components/MapCanvas.tsx:61** — The recenter effect calls `animateToRegion` as soon as `center` is set, but it does not wait for `onMapReady` and does not run again after it. On Android, react-native-maps drops the call while the Google map is still initialising (`MapView.java:1446`, `if (map == null) return;`). *(correctness)*
  - status: open
  - dev_reasoning: Fixed. `MapCanvas` tracks `mapReady` (set in its `onMapReady` handler, which still calls `onReady`) and the recentre effect skips until the map is ready and has `mapReady` in its deps, so a position that arrived first is applied on ready. A remount (Try again) resets it. New test: position known before `mapReady` -> no camera call, then exactly one to the device region after it.
  - ai_reasoning: When the screen mounts before the position is known, `initialRegion` is captured as `undefined` (`useState` at line 57). If the fix arrives before the Google map finishes `getMapAsync`, the only camera move is dropped and the effect never runs again. Permission is often already granted and `getLastKnownPositionAsync` can answer in well under a second, while Google Maps SDK start-up is typically slower, so this timing is realistic. The map then stays on the default world view while places load around the user. iOS (MKMapView) is not affected. I confirmed the native guard in `node_modules/react-native-maps` but did not reproduce it on a device. Suggested fix: track map readiness in `MapCanvas` and include it in the effect's dependencies, or recentre in `onMapReady` when `center` is already set.

### Low (2)
- **src/features/map/data/OsmPlacesRepository.ts:4** — The map data layer imports `MemoryCache` from another feature's data layer (`@/features/discover/data/caching`). Apart from test fixtures, this is the only cross-feature import into a `data/` folder in `src`. *(maintainability)*
  - status: open
  - dev_reasoning: Fixed. `MemoryCache` and `raceAbort` moved to `src/core/cache/MemoryCache.ts` (tests moved to `MemoryCache.test.ts`); discover's `caching.ts` and `OsmPlacesRepository` both import it from core. The `weather/domain` type sharing is left as is for now (types only).
  - ai_reasoning: `MemoryCache` is a general TTL/LRU, request-coalescing cache, but it lives in a file with discover-specific repositories (`CachedCountryRepository`, etc.). Any change to discover's caching now silently affects the map, and the two features can no longer be moved or removed independently. Moving `MemoryCache` (and its `raceAbort` helper) to `src/core/` (e.g. `core/cache/MemoryCache.ts`) and importing it from both features would keep the layering clean. The map's use of `weather/domain` types (`Coordinates`, `LocationPermission`) is a similar but smaller coupling and could move to a shared domain module at the same time.
- **src/core/i18n/locales/en.ts:457** — `map.attributionHint` is added in `en.ts` and `es.ts` (`es.ts:462`) but nothing in `src` uses it. *(maintainability)*
  - status: open
  - dev_reasoning: Fixed. Wired as the `accessibilityHint` of the attribution caption in `ExploreMapScreen.tsx`, so screen-reader users hear the ODbL source.
  - ai_reasoning: The attribution caption at `ExploreMapScreen.tsx:284` shows only `map.attribution` and has no accessibility hint. Either remove the key from both locales or wire it up, e.g. as the `accessibilityHint` of the attribution text, which would also tell screen-reader users about the ODbL licence.

## Reviewed files
- README.md
- app.json
- docs/ARCHITECTURE.md
- jest.afterEnv.ts
- jest.setup.ts
- src/app/(app)/(tabs)/(explore)/_layout.tsx
- src/app/(app)/(tabs)/(explore)/map.tsx
- src/bootstrap/createAppContainer.ts
- src/core/di/AppDependencies.ts
- src/core/errors/AppError.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts (skimmed for parity)
- src/core/store/store.ts
- src/features/discover/presentation/screens/DiscoverScreen.tsx
- src/features/discover/presentation/screens/DiscoverScreen.test.tsx (skimmed)
- src/features/map/di.ts
- src/features/map/data/ExpoLocationService.ts
- src/features/map/data/NominatimGeocodingService.ts
- src/features/map/data/OsmPlacesRepository.ts
- src/features/map/data/OverpassPlacesApiService.ts
- src/features/map/data/RequestThrottle.ts
- src/features/map/data/StorageCustomMarkerRepository.ts
- src/features/map/data/dto/nominatimDtos.ts
- src/features/map/data/dto/overpassDtos.ts
- src/features/map/data/mappers.ts
- src/features/map/data/osmApis.ts
- src/features/map/data/overpassQuery.ts
- src/features/map/domain/Place.ts
- src/features/map/domain/directions.ts
- src/features/map/domain/filterPlaces.ts
- src/features/map/domain/geo.ts
- src/features/map/domain/repositories.ts
- src/features/map/domain/usecases/GetNearbyPlaces.ts
- src/features/map/domain/usecases/SearchPlaces.ts
- src/features/map/domain/usecases/customMarkers.ts
- src/features/map/domain/usecases/locationUseCases.ts
- src/features/map/presentation/categoryIcons.ts
- src/features/map/presentation/components/CategoryChips.tsx
- src/features/map/presentation/components/MapCanvas.tsx
- src/features/map/presentation/components/PlaceSheet.tsx
- src/features/map/presentation/format.ts
- src/features/map/presentation/hooks/useExploreMap.ts
- src/features/map/presentation/hooks/useMapLocation.ts
- src/features/map/presentation/mapAvailability.ts
- src/features/map/presentation/screens/ExploreMapScreen.tsx
- src/features/map/presentation/screens/ExploreMapScreen.web.tsx
- src/features/map/presentation/state/mapApi.ts
- src/features/map/presentation/state/mapSlice.ts
- src/features/map/presentation/state/selectors.ts
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/FakeLocationService.ts
- src/testing/createTestStore.ts
- src/testing/mapFixtures.ts (skimmed)
- src/testing/syncSafeAct.ts
- src/testing/syncSafeAct.test.ts (skimmed)
- src/testing/testDependencies.ts
- src/features/map/**/*.test.ts(x) (28 suites, skimmed for focus/skip markers and run; all pass)
