---
diff_hash: db055f9cb9d0c5a5363dbb830c116044f0d97b8ac84ccc30563d5cedc80b9f48
reviewed_at: 2026-11-18T10:48:26Z
---

## Summary

Merge of `develop` (`dd25d9d`, "Feat/weather foreground refresh (#3)") into `feat/feature-06-explore-map-nearby-places` (head `8cf3201`). Git's merge base is `7b5983c`.

Fresh review. A `brainx-review.md` existed, but it was the review for `2e58146` (explore map), which is committed and already finalized in the ledger by `8cf3201`. None of its findings concern this merge, so this review replaces it (same convention as the earlier develop merge reviews in this repo). `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, the convention prior reviews used. For this merge that diff is empty, so the value is the SHA-256 of empty input. No unstaged or untracked changes were present, so the staged/all prompt didn't apply.

**What develop contains.** PRs #1 to #3 were squash-merged. Develop's tree is byte-identical to this branch's `caa55c8` (the commit before the map work) except for `.code-reviews/brainx-review.md`, so develop brings no code this branch lacks. Because of the squashes, git can't see the shared history, and the 3-way merge from `7b5983c` reports add/add conflicts on files both sides created. `git merge-tree --merge-base=caa55c8 HEAD origin/develop` (the true common content) conflicts only on `brainx-review.md`.

**Conflicts (26), all resolved to this branch's version.** For each of the 25 code, config and docs files, develop's blob was checked to equal the `caa55c8` blob, and this branch's version differs only by the map feature (`2e58146`). Taking develop's side would revert that work. Files: `README.md`, `app.json`, `docs/ARCHITECTURE.md`, `jest.afterEnv.ts`, `jest.setup.ts`, `package.json`, `package-lock.json`, `src/app/(app)/(tabs)/(explore)/_layout.tsx`, `src/bootstrap/createAppContainer.ts`, `src/core/di/AppDependencies.ts`, `src/core/errors/AppError.ts`, `src/core/i18n/locales/en.ts`, `src/core/i18n/locales/es.ts`, `src/core/store/store.ts`, `src/features/discover/data/caching.ts`, `src/features/discover/data/caching.test.ts`, `src/features/discover/presentation/screens/DiscoverScreen.tsx`, `src/features/discover/presentation/screens/DiscoverScreen.test.tsx`, `src/shared/navigation/deepLinks.ts`, `src/shared/navigation/deepLinks.test.ts`, `src/shared/navigation/routes.ts`, `src/shared/ui/icons.ts`, `src/testing/createTestStore.ts`, `src/testing/testDependencies.ts`, plus the hook-owned `.code-reviews/ledger.jsonl` (develop's copy equals `caa55c8`'s; ours is a superset) and `.code-reviews/brainx-review.md` (replaced by this file).

**Result.** Apart from this review file, the merged tree is identical to `HEAD` (`8cf3201`). The auto-merge did not silently change, restore or delete any other file. After the merge, `develop` is an ancestor of the branch, so a PR to `develop` shows only the map work.

**Scope.** The user asked for the complete changes to be reviewed, so the whole branch-versus-develop delta was re-read on the merged tree, not just the empty merge diff. That delta is the explore map feature (`features/map/`, about 3.1k lines of non-test source, 60 files) and its integration points: store and RTK Query middleware, DI container, Explore stack route, `/map` deep link allow-list, Discover Map button, `core/cache/MemoryCache` (moved out of discover), `locationServicesDisabled` error kind, en/es strings, icons, Jest setup (react-native-maps mock, `syncSafeAct`, `clearAllMocks`), README and ARCHITECTURE. Checked in particular: request throttle queueing and cancellation, 429 cooldown, cache keys (rounded centre, language), URL scheme filtering for websites, `geo:` label escaping, pin-change serialisation, RTK Query `currentData`/`data` use during refetch and after failures, stale-position refresh on foreground and "My location", camera moves gated on `onMapReady`, effect cleanups, and Android/web map availability.

Stack: React (`react` 19.3.0 in dependencies, no NestJS marker). The runtime is Expo SDK 58 / React Native 0.88, so React criteria were applied with RN semantics (`AppState`, `StyleSheet`, no DOM).

Security notes (no finding): no secrets added (the Google Maps key is read from app config at runtime and is not committed); place websites are limited to `http(s)` before opening; nothing renders HTML; saved pins are parsed entry by entry with zod; the centre sent to Overpass is rounded to 3 decimals.

Verification on the merged tree: `tsc --noEmit` exits 0, `expo lint` exits 0, `prettier --check .` is clean, and `jest` passes 102 suites / 1074 tests (1075 after the fix below). No conflict markers are present.

Re-review (2026-11-18T10:48:26Z): the staged diff now also carries the fix for the one finding (`useExploreMap.ts`, `ExploreMapScreen.tsx`, its test, en/es strings, and ARCHITECTURE's edge-case table, which Prettier re-aligned). Only the finding's lines were re-evaluated; no new findings were raised.

Not verified: `git fetch` failed (SSH key is passphrase-protected and not loaded in the agent), so the merge used the local `origin/develop` ref at `dd25d9d`, last updated 2026-11-18 15:26 +05:00. If develop moved after that, a follow-up merge is needed.

Cross-repo: only one repository is involved.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **src/features/map/presentation/hooks/useExploreMap.ts:229** — When places loaded but none belong to the selected categories, `placesState` is `ready` and the screen shows no markers and no message. *(correctness)*
  - status: fixed
  - dev_reasoning: Fixed. Added a `noMatches` places state (places loaded, none of the selected categories) with an en/es message and a screen test; ARCHITECTURE's edge-case table lists it.
  - ai_reasoning: Re-review. `useExploreMap.ts:231` now returns `{ status: 'noMatches' }` when the filtered `places` list is empty while categories are selected and places loaded (after the `empty` and `noCategories` checks, so those keep priority), and `places.length` is in the memo deps. `ExploreMapScreen` renders it as an info `InlineMessage` ("No places of the selected types nearby" / "No hay lugares de los tipos seleccionados cerca"). The new test "AC6 says when no loaded place is of the selected types" loads one restaurant, turns Restaurants off, expects the message, no markers and no new request, then turns it back on and expects the marker and no message. The test fails with the new branch removed and passes with it. Re-verified: `tsc --noEmit` 0, `expo lint` 0, `prettier --check .` clean, `jest` 102 suites / 1075 tests passing. Original issue: `placesState` handled "no places at all" (`empty`) and "every chip off" (`noCategories`), but not "chips on, zero matches", so in an area with only restaurants and hotels and only Museums selected the map was empty with no explanation, which looked the same as a stuck load. "no places at all" (`empty`) and "every chip off" (`noCategories`), but not "chips on, zero matches". Example: in an area with restaurants and hotels only, the user turns off everything except Museums. `filterPlaces` returns `[]`, `nearby.currentData.length > 0` and `categories.length > 0`, so the state is `ready` and `PlacesStatus` renders nothing. The map is empty with no explanation, which looks the same as a stuck load. The ARCHITECTURE edge-case table and the tests (`ExploreMapScreen.test.tsx`, AC6) cover only the two handled cases. Suggested fix: add a `noMatches` state when the filtered `places` list is empty while categories are selected, with an en/es message, and a screen test.

## Reviewed files
- .code-reviews/ledger.jsonl (merge resolution only; hook-owned)
- README.md
- app.json
- docs/ARCHITECTURE.md
- jest.afterEnv.ts
- jest.setup.ts
- package.json
- package-lock.json (dependency change only: react-native-maps 1.29.11)
- src/app/(app)/(tabs)/(explore)/_layout.tsx
- src/app/(app)/(tabs)/(explore)/map.tsx
- src/bootstrap/createAppContainer.ts
- src/core/cache/MemoryCache.ts
- src/core/di/AppDependencies.ts
- src/core/errors/AppError.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts (skimmed for parity with en.ts)
- src/core/store/store.ts
- src/features/discover/data/caching.ts
- src/features/discover/presentation/screens/DiscoverScreen.tsx
- src/features/map/di.ts
- src/features/map/data/*.ts and data/dto/*.ts (all 13 source files)
- src/features/map/domain/*.ts and domain/usecases/*.ts (all 10 source files)
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
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/FakeLocationService.ts
- src/testing/createTestStore.ts
- src/testing/mapFixtures.ts (skimmed)
- src/testing/syncSafeAct.ts
- src/testing/testDependencies.ts
- `*.test.ts(x)` in the delta (skimmed for focus/skip markers and coverage of the finding above; all run and pass)

## Skipped (hook-owned, not reviewed)
- .code-reviews/records/ (generated records)
