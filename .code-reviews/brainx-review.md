---
diff_hash: e23b2ab250d186159b3a3727cdfe406fcb019addf6f9b193940b11bd77ba6d6b
reviewed_at: 2026-11-16T13:21:32Z

## Summary

Adds device-location and foreground refresh behaviour to the weather feature (React Native / Expo, TypeScript). `useDeviceWeather` re-reads the device position on return to the foreground when the read failed or is older than 2 min; the position is now stored as `{ coordinates, readAt }` using the injected clock. `useWeather` retries a non-permanent failure on return to the foreground, in addition to refreshing a forecast older than 15 min. A new `captureAppState` test helper and four new hook test suites (about 930 lines) cover these paths. `docs/ARCHITECTURE.md` is updated to match. The `.code-reviews/brainx-review.md` deletion and the `ledger.jsonl` / `records/` changes are hook-owned artefacts and were not reviewed.

Stack: React (`react` 19.3.0 in `package.json`; no NestJS, Express, or other stack marker matched first). This is an Expo / React Native app, so the React criteria were applied with RN semantics (`AppState`, no DOM). Single repository with staged changes, so no cross-repo check applies. The weather feature calls Open-Meteo directly; no backend contract change is in this diff.

Verification run during review: `npx tsc --noEmit` exits 0. `npx jest src/features/weather` plus `DestinationWeatherScreen.test.tsx` gives 17 suites, 287 tests, all passing.

Files only skimmed: the four hook test suites and `weatherIcons.test.ts` (checked for `.only`, `.skip`, `console`, `debugger`, `TODO`, and timer usage; none found, and they pass).

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (1)
- **src/testing/captureAppState.ts:14** — `remove` calls `listeners.splice(listeners.indexOf(listener), 1)`. If the same subscription is removed twice, or after it has already been removed, `indexOf` returns `-1` and `splice(-1, 1)` silently removes the last listener registered by a different subscription. Current call sites remove each subscription once, so no test is affected today. *(maintainability)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Re-review. `remove` now looks up the index, and only splices when `index !== -1`, so a second `remove()` is a no-op and cannot delete another subscription's listener. Re-verified: `npx tsc --noEmit` exits 0 and the 17 weather/discover suites (287 tests) pass.

## Reviewed files
- docs/ARCHITECTURE.md
- src/features/weather/presentation/hooks/useDeviceWeather.ts
- src/features/weather/presentation/hooks/useDeviceWeather.edge.test.tsx
- src/features/weather/presentation/hooks/useDeviceWeather.test.tsx
- src/features/weather/presentation/hooks/useWeather.ts
- src/features/weather/presentation/hooks/useWeather.edge.test.tsx
- src/features/weather/presentation/hooks/useWeather.test.tsx
- src/features/weather/presentation/state/weatherApi.ts
- src/features/weather/presentation/state/weatherApi.test.ts
- src/features/weather/presentation/weatherIcons.test.ts
- src/testing/captureAppState.ts

## Skipped (generated or hook-owned, not reviewed)
- .code-reviews/brainx-review.md (deleted in the index; this file replaces it)
- .code-reviews/ledger.jsonl (owned by the post-commit hook)
- .code-reviews/records/3d2cebf14f2feb93598e0b536b5f49a4edbc3c6e.md (generated record)
