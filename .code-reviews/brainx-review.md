---
diff_hash: 3457de4e190236ffff25ef714dd1fe1bb67ad296589834dbf5e2eada45c89591
reviewed_at: 2026-11-10T13:38:37Z

## Summary

Feature 0 (foundation) for Wanderly, an Expo SDK 58 / Expo Router React Native app. 62 staged files. The change adds a feature-based clean architecture: `core/` (Result type, AppError, Logger port, KeyValueStore + AsyncStorage adapter, Redux store with DI through thunk `extraArgument`, typed i18n with en/es, theme tokens and provider), `bootstrap/` (composition root, providers, preferences gate that holds the splash screen), `features/preferences` (domain, Zod-validated repository, slice, view-model hook, Settings screen), `features/explore` (Explore screen), `shared/ui` components, and native-tabs routes under `src/app/(tabs)`. It also adds the Jest/RNTL v14 setup with 39 tests, stricter tsconfig and ESLint rules, app.json plugin config, README, and a staged GitHub workflow (`.github/workflows/code-review-pr.yml`) that posts a PR score from the review ledger.

Fresh review. The previous `brainx-review.md` belonged to commit 7bffe10, which is already finalized in the ledger, so its findings were not carried over. Its one open Low finding (package.json:4, no routes under the Expo Router entry) is resolved by this diff: routes now exist under `src/app/(tabs)` and the old entry files are gone.

Stack: React (`react` in dependencies, no NestJS marker). This is React Native, so the web-only criteria in the React resource (CSS class naming, CSS variables, `dangerouslySetInnerHTML`, React Router 404 routes, httpOnly cookies) were not applied. Hooks, state management, error handling, typing, accessibility, and security criteria were.

Verification run before review: `tsc --noEmit` passed, `expo lint` passed with 0 problems, `jest` passed (39/39), `expo-doctor` passed 20/20, and `expo export` bundled for iOS and Android. Two library assumptions were checked against installed sources: destructuring `t` from an i18next instance works, and Android's `AppearanceModule.setColorScheme` accepts `'auto'`.

No high or critical issues. Findings are one medium (the PR workflow's score can be forged from the PR branch) and six low items (error visibility, edge-case robustness, cosmetics).

Cross-repo: only one repository has staged changes.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **.github/workflows/code-review-pr.yml:44** — The PR score is computed from `.code-reviews/ledger.jsonl` as checked out from the PR head. The PR author fully controls that file, so they can hand-edit or append a ledger line (e.g. `"score":100,"status":"pass"` for an unreviewed or `--no-verify` commit). The workflow then reports PASS. Nothing in the job checks that a ledger entry was produced by the hooks. *(security)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The score is self-attested, so it should not be used as a merge gate as-is. Options: compute the score from the base branch's ledger plus only the hook-generated `chore(code-review):` commits; or verify each entry against its `records/<sha>.md` file and the diff hash; or treat the comment as informational and say so in its text. At minimum, document in the workflow that the ledger is author-controlled.

### Low (6)
- **src/features/preferences/presentation/state/preferencesSlice.ts:68** — The `loadPreferences.rejected` and `updatePreferences.rejected` (line 76) handlers recover the UI state but never report the error. If a repository implementation throws instead of returning `err(...)` (a contract violation), the exception is silently dropped. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: This can't happen with the current `StoragePreferencesRepository`, which catches every storage call, so it is low risk. Wrap the repository call in each thunk with try/catch and `extra.logger.error(...)`, then return defaults or `rejectWithValue('storage')`, so a future implementation that throws is visible.

- **src/bootstrap/createAppContainer.ts:20** — `new ConsoleLogger(__DEV__)` disables logging in release builds, so every `logger.error` and `logger.warn` is a no-op in production. Storage failures and render errors caught by the root ErrorBoundary leave no trace until a crash-reporting logger is wired in. *(maintainability)*
  - status: skipped
  - dev_reasoning: Deferred by design. Release logging lands with the Sentry-backed Logger (README roadmap Feature 8), which needs a Sentry project/DSN; the Logger port means that is a one-line swap at the composition root. No release build ships before then.
  - ai_reasoning: Intentional and documented: the Logger port exists so Sentry can be swapped in, and the README roadmap lists observability as Feature 8. Low until a release build ships. Resolve by adding the Sentry-backed Logger, or skip with that reason.

- **src/bootstrap/PreferencesGate.tsx:30** — Rendering is gated on `loadPreferences` settling, and the splash screen is hidden only after that. There is no timeout. If the storage read never resolves (e.g. a hung native module), the app stays on the splash screen indefinitely. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Very unlikely with AsyncStorage, but the failure is total when it happens. Fix: race the repository read against a short timeout (e.g. 2–3 s) and fall back to defaults with a logged warning.

- **src/features/explore/presentation/screens/ExploreScreen.tsx:18** — The greeting period is computed only at render. Mobile apps often stay mounted in memory for hours, so after resuming from the background the screen can show "Good morning" in the evening until something re-renders it. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Recompute when the app returns to the foreground (`AppState` 'active' listener with cleanup), or when the screen regains focus (`useFocusEffect`).

- **app.json:41** — The light splash `backgroundColor` is `#FFFFFF`, but the app's light background is `#F6F8F8`, so there is a visible colour jump when the splash hides. The dark splash colour `#0B1416` matches. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Set the light splash background to `#F6F8F8` to match `themes.light.colors.background`.

- **.github/workflows/code-review-pr.yml:92** — The existing score comment is found by its body marker alone, with no author filter. Any PR participant can post a comment starting with `<!-- brainx-code-review-score -->`. The job then tries to PATCH a comment it doesn't own, gets a 403, and fails under `set -e`, so the score comment stops updating. Separately, line 22 uses `actions/checkout@v4` by mutable tag rather than a commit SHA while the job holds a `pull-requests: write` token. *(security)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Add `and .user.login == "github-actions[bot]"` (or `.user.type == "Bot"`) to the jq select. Pin `actions/checkout` to a full commit SHA with a version comment.

## Reviewed files
- .github/workflows/code-review-pr.yml (reviewed)
- README.md (reviewed)
- app.json (reviewed)
- eslint.config.js (reviewed)
- jest.setup.ts (reviewed)
- package.json (reviewed)
- package-lock.json (skimmed: generated; checked added dependency pins only)
- tsconfig.json (reviewed)
- src/app/_layout.tsx (reviewed)
- src/app/index.tsx (reviewed: deletion; `/` now resolves to `(tabs)/(explore)/index`, confirmed on the iOS simulator)
- src/app/(tabs)/_layout.tsx (reviewed)
- src/app/(tabs)/(explore)/_layout.tsx (reviewed)
- src/app/(tabs)/(explore)/index.tsx (reviewed)
- src/app/(tabs)/settings/_layout.tsx (reviewed)
- src/app/(tabs)/settings/index.tsx (reviewed)
- src/bootstrap/AppProviders.tsx (reviewed)
- src/bootstrap/PreferencesGate.tsx (reviewed)
- src/bootstrap/PreferencesGate.test.tsx (reviewed)
- src/bootstrap/createAppContainer.ts (reviewed)
- src/core/di/AppDependencies.ts (reviewed)
- src/core/errors/AppError.ts (reviewed)
- src/core/i18n/createI18n.ts (reviewed)
- src/core/i18n/i18next.d.ts (reviewed)
- src/core/i18n/languages.ts (reviewed)
- src/core/i18n/locales/en.ts (reviewed)
- src/core/i18n/locales/es.ts (reviewed)
- src/core/logging/Logger.ts (reviewed)
- src/core/result.ts (reviewed)
- src/core/storage/AsyncStorageKeyValueStore.ts (reviewed)
- src/core/storage/AsyncStorageKeyValueStore.test.ts (reviewed)
- src/core/storage/KeyValueStore.ts (reviewed)
- src/core/store/hooks.ts (reviewed)
- src/core/store/store.ts (reviewed)
- src/core/theme/ThemeProvider.tsx (reviewed)
- src/core/theme/themes.ts (reviewed)
- src/core/theme/tokens.ts (reviewed)
- src/core/theme/types.ts (reviewed)
- src/features/explore/domain/dayPeriod.ts (reviewed)
- src/features/explore/domain/dayPeriod.test.ts (reviewed)
- src/features/explore/presentation/screens/ExploreScreen.tsx (reviewed)
- src/features/explore/presentation/screens/ExploreScreen.test.tsx (reviewed)
- src/features/preferences/data/StoragePreferencesRepository.ts (reviewed)
- src/features/preferences/data/StoragePreferencesRepository.test.ts (reviewed)
- src/features/preferences/domain/Preferences.ts (reviewed)
- src/features/preferences/domain/PreferencesRepository.ts (reviewed)
- src/features/preferences/domain/resolvePreferences.ts (reviewed)
- src/features/preferences/domain/resolvePreferences.test.ts (reviewed)
- src/features/preferences/presentation/applyNativeColorScheme.ts (reviewed)
- src/features/preferences/presentation/hooks/usePreferenceSettings.ts (reviewed)
- src/features/preferences/presentation/hooks/useResolvedPreferences.ts (reviewed)
- src/features/preferences/presentation/screens/SettingsScreen.tsx (reviewed)
- src/features/preferences/presentation/screens/SettingsScreen.test.tsx (reviewed)
- src/features/preferences/presentation/state/preferencesSlice.ts (reviewed)
- src/features/preferences/presentation/state/preferencesSlice.test.ts (reviewed)
- src/features/preferences/presentation/state/selectors.ts (reviewed)
- src/shared/ui/AppText.tsx (reviewed)
- src/shared/ui/InlineMessage.tsx (reviewed)
- src/shared/ui/OptionGroup.tsx (reviewed)
- src/shared/ui/Screen.tsx (reviewed)
- src/testing/InMemoryKeyValueStore.ts (reviewed)
- src/testing/renderWithProviders.tsx (reviewed)
- src/testing/testDependencies.ts (reviewed)
