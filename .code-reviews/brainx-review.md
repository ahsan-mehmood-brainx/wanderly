---
diff_hash: 84f3f3eacb9022c404782e9da4c26746dd16c2511a9f419206f400ae9efa96ad
reviewed_at: 2026-11-10T19:54:33Z

## Summary

Feature 0 foundation for Wanderly (Expo SDK 58 / Expo Router, React Native) plus the shared infrastructure built on it: a typed HTTP layer (`core/http`, axios behind an `HttpClient` port with retries, auth strategies and error normalisation), a Logger port with transports and redaction, connectivity via `expo-network`, a dependency-injection container, a semantic theme with Inter fonts, a shared UI kit (`shared/ui`), the preferences feature split into domain / data / presentation with use cases, and a development-only design-system screen. 111 staged files (109 source/config/doc files plus the deletion of the previous review file and the lockfile).

Fresh review, not a re-review: the workspace had no `brainx-review.md`. The previous review (271049d) was not carried over. Two of its open findings are resolved by this diff: the preferences load now has a 3 s timeout (`LoadPreferences`), so a hung storage read no longer holds the splash screen, and the splash background colours in `app.json` now match the theme.

Stack: React (`react` in dependencies, no NestJS marker). The runtime is React Native, so the web-only criteria in `react.md` (CSS class naming, CSS variables, `dangerouslySetInnerHTML`, React Router 404 routes, httpOnly cookies) were not applied. Hooks, state management, error handling, typing, accessibility and security criteria were.

Skimmed, not read line by line: `README.md`, `docs/ARCHITECTURE.md` (checked only for stale identifiers) and `package-lock.json` (only the `package.json` dependency additions were checked against it). The `.code-reviews/brainx-review.md` deletion is not a code change.

Verification run before writing this review: `npx tsc --noEmit` clean; `npx expo lint` clean; `npx jest` 27 suites / 178 tests passing.

Cross-repo: only one repository has staged changes.

Re-review (2026-11-10T19:54:33Z): the staged diff changed after the first review, so this run re-evaluated the existing findings only; no new findings were raised. Everything is staged (`git ls-files -m -o` is empty), so the skill's workspace-hash command hashes empty input. `diff_hash` is therefore `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, which leaves out the review file so the hash does not depend on itself. Files edited since the first review: `SavePreferences.ts` (+ test), `preferences/di.ts`, `preferencesSlice.ts` (+ test), `redact.ts` (+ test), `normalizeHttpError.ts` (+ test), `settings/design-system.tsx`, `DesignSystemScreen.tsx`, `AppHeader.tsx`. `coreFactories.ts` is unchanged. Six findings are fixed and one Low is still open. Verification: `npx tsc --noEmit` clean; `npx expo lint` clean (exit 0); `npx jest` 27 suites / 184 tests passing.

## Findings

### Critical (0)

### High (1)
- **src/features/preferences/domain/usecases/LoadPreferences.ts:37** — When the preference read fails or times out, the app runs on `DEFAULT_PREFERENCES`. The next preference change then saves the full default set over the stored values, so the untouched setting is silently reset in storage. Example: stored `{theme:'dark', language:'es'}`, `getItem` throws, state becomes `{system, system}`, the user switches theme to light, and storage now holds `{light, system}` (language lost). *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `updatePreferences` now sends only the changed fields to the new `SavePreferences` use case. It re-reads storage and merges the change into what is stored, never into in-memory state (`SavePreferences.ts:32-41`). If storage still cannot be read, nothing is written and the error is returned (`:35-38`). Saves are queued, so two quick changes cannot read the same snapshot and drop each other's field. Tests cover this: "writes nothing ... when storage cannot be read", "merges the change into what storage holds" and "keeps both of two concurrent changes". In the original example, the stored language now survives. Original advice: The fallback is right for display but wrong for persistence. Fix either by recording that the load did not succeed (for example `loaded: false` in the slice) and re-reading storage, or refusing to save until a load has succeeded, or merging with the stored value at save time. Add a test: load fails, then update, then assert the stored language is unchanged.

### Medium (1)
- **src/core/http/normalizeHttpError.ts:74** — `cause: error` keeps the raw AxiosError. Its `config.params` holds query-string credentials when an API uses `ApiKeyAuth` with `location: 'query'` (`interceptors.ts` `authorize` writes them into `config.params`). `ApiError` documents that its `url` never carries query parameters, but the `cause` chain does, and `redact()` deliberately skips Error objects. Any `logger.error(message, apiError)` call, or a future crash-reporting transport that serialises `cause`, would expose the key. *(security)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `sanitizedCause()` (`normalizeHttpError.ts:48-53`) builds a fresh `Error` that keeps only `name`, `message`, `code` and `stack`. Both axios paths (cancel and `isAxiosError`) now use it, so `config`, `request` and `response` are no longer reachable from `cause`. Axios messages do not include the URL. The new test "never carries query-string credentials through the cause chain" asserts this. The non-axios fallback still keeps the raw error, which is correct because it has no axios config. Original note: Latent today: no production API uses a query-string key, and no current call site logs an ApiError through `logger.error`. Fix by not keeping the AxiosError as `cause`; attach a sanitised copy (`{ message, code, status }`) or strip `config` before attaching. Add a test that no serialisation of the resulting ApiError contains the query-string key value.

### Low (5)
- **src/core/utils/redact.ts:3** — `pass(word)?` matches any key containing "pass", so in a travel app keys such as `passengers` or `passengerCount` are masked in logs. This is over-redaction: it hides diagnostic data but does not weaken safety. *(maintainability)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The pattern now lists `passw(or)?d|passcode|passphrase|passport` instead of `pass(word)?`, so `passengers` and `passengerCount` pass through. `passport` stays masked on purpose because it is PII. `redact.test.ts:20-36` asserts both. Original advice: Match whole key names (for example `password`, `passcode`, `passwd`) instead of substrings, or add a test that `passengers` is not redacted.

- **src/bootstrap/coreFactories.ts:27** — Production builds get no logging transport (`c.config.isDev ? [new ConsoleTransport()] : []`), so every `logger.warn` and `logger.error` is dropped in release, including the Inter font failure and HTTP failures. The choice is deliberate and commented, but release errors are invisible until a crash reporter exists. *(maintainability)*
  - status: open
  - dev_reasoning: Fixed in code. `ConsoleTransport` is now wired in every build (`transports: [new ConsoleTransport()]`), with `minLevel: 'warn'` in release. No babel console-stripping plugin is configured, so in release React Native forwards `console.warn`/`console.error` to the native device log (os_log on iOS, logcat on Android); warnings and errors are no longer dropped. Sentry will be added to the transports list alongside it. New test `src/bootstrap/coreFactories.test.ts` builds the release container (`createAppConfig(false)`) and asserts warn/error reach the console while debug/info are filtered. `docs/ARCHITECTURE.md` and `README.md` updated to match.
  - ai_reasoning: Still open on re-review: `coreFactories.ts` was not changed after the first review, and line 27 still gives release builds no transport. This is the same point as the previous review's skipped Low finding, and it still applies to this diff. Either wire the planned Sentry transport before the first release build, or skip with that reason.

- **src/app/(tabs)/settings/design-system.tsx:3** — The `__DEV__` check only redirects. The `DesignSystemScreen` import is static, so the whole dev catalogue (including third-party image URLs) stays in the production bundle, and the route remains reachable by deep link. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The route now keeps only a type-only import and loads the screen with `require` inside a `__DEV__ ? ... : null` ternary (`design-system.tsx:11-15`). Metro inlines `__DEV__` and constant-folds in production transforms before collecting dependencies, so the catalogue module is dropped from release bundles. The deep link still resolves but only redirects to Settings. Original note: Not a security hole, since the screen renders nothing sensitive and redirects in release, but it ships dead code. Load the module only inside the dev branch (for example `require` it inside the `__DEV__` path) so the bundler can drop it, or exclude the file from release builds.

- **src/features/design-system/presentation/screens/DesignSystemScreen.tsx:136** — `setTimeout(() => setLoading(false), 1500)` is never cleared, so it can set state after the screen unmounts. This is harmless in React 19 but untidy. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The press handler now only sets `loading`. A `useEffect` keyed on `loading` starts the 1.5 s timer and returns `clearTimeout`, so the timer is cleared on unmount (`DesignSystemScreen.tsx:88-92`). The finding's line number has shifted. Original advice: Keep the timer id in a ref and clear it on unmount, or drive the timeout from an effect that returns a cleanup function.

- **src/shared/ui/AppHeader.tsx:6** — Imports the static `spacing` token instead of `useAppTheme().spacing`. Every other shared component in this diff reads spacing from the theme, so the header would not pick up a theme-level change. The component already calls `useAppTheme` for colours and sizes. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The static `spacing` import is gone. `AppHeader` now destructures `spacing` from `useAppTheme()` with `colors` and `sizes` (`AppHeader.tsx:51`) and uses it at every spacing site. Original advice: Read `spacing` from the `useAppTheme()` result that the component already destructures for `colors` and `sizes`.

## Reviewed files
- .code-reviews/brainx-review.md (deletion of previous review file; not a code change, not reviewed)
- .prettierignore
- .prettierrc.json
- README.md (skimmed)
- app.json
- docs/ARCHITECTURE.md (skimmed)
- eslint.config.js
- package-lock.json (skipped: lockfile; only package.json dependency changes were checked)
- package.json
- src/app/(tabs)/_layout.tsx
- src/app/(tabs)/settings/_layout.tsx
- src/app/(tabs)/settings/design-system.tsx
- src/app/_layout.tsx
- src/bootstrap/AppProviders.tsx
- src/bootstrap/coreFactories.ts
- src/bootstrap/createAppContainer.test.ts
- src/bootstrap/createAppContainer.ts
- src/core/config/appConfig.ts
- src/core/di/AppDependencies.ts
- src/core/di/CoreDependencies.ts
- src/core/di/DependenciesProvider.tsx
- src/core/di/createContainer.test.ts
- src/core/di/createContainer.ts
- src/core/errors/AppError.ts
- src/core/errors/errorMessages.ts
- src/core/events/Subject.test.ts
- src/core/events/Subject.ts
- src/core/http/ApiError.ts
- src/core/http/AxiosHttpClient.test.ts
- src/core/http/AxiosHttpClient.ts
- src/core/http/HttpClient.ts
- src/core/http/HttpClientFactory.ts
- src/core/http/index.ts
- src/core/http/interceptors.ts
- src/core/http/normalizeHttpError.test.ts
- src/core/http/normalizeHttpError.ts
- src/core/http/strategies/AuthStrategy.ts
- src/core/http/strategies/RetryStrategy.ts
- src/core/http/strategies/strategies.test.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/logging/Logger.test.ts
- src/core/logging/Logger.ts
- src/core/network/ConnectivityService.ts
- src/core/network/ExpoNetworkConnectivityService.test.ts
- src/core/network/ExpoNetworkConnectivityService.ts
- src/core/store/store.ts
- src/core/theme/ThemeProvider.tsx
- src/core/theme/colors.ts
- src/core/theme/fonts.ts
- src/core/theme/shadows.ts
- src/core/theme/themes.ts
- src/core/theme/tokens.ts
- src/core/theme/types.ts
- src/core/usecase/UseCase.ts
- src/core/utils/Clock.ts
- src/core/utils/IdGenerator.ts
- src/core/utils/async.test.ts
- src/core/utils/async.ts
- src/core/utils/redact.test.ts
- src/core/utils/redact.ts
- src/features/design-system/presentation/screens/DesignSystemScreen.tsx
- src/features/preferences/data/StoragePreferencesRepository.ts
- src/features/preferences/di.ts
- src/features/preferences/domain/resolvePreferences.ts
- src/features/preferences/domain/usecases/LoadPreferences.test.ts
- src/features/preferences/domain/usecases/LoadPreferences.ts
- src/features/preferences/domain/usecases/SavePreferences.test.ts
- src/features/preferences/domain/usecases/SavePreferences.ts
- src/features/preferences/presentation/hooks/usePreferenceSettings.ts
- src/features/preferences/presentation/screens/SettingsScreen.test.tsx
- src/features/preferences/presentation/screens/SettingsScreen.tsx
- src/features/preferences/presentation/state/preferencesSlice.test.ts
- src/features/preferences/presentation/state/preferencesSlice.ts
- src/shared/hooks/useConnectivity.test.tsx
- src/shared/hooks/useConnectivity.ts
- src/shared/hooks/useReduceMotion.ts
- src/shared/ui/AppAvatar.tsx
- src/shared/ui/AppBadge.tsx
- src/shared/ui/AppBottomSheet.test.tsx
- src/shared/ui/AppBottomSheet.tsx
- src/shared/ui/AppButton.test.tsx
- src/shared/ui/AppButton.tsx
- src/shared/ui/AppCard.tsx
- src/shared/ui/AppDivider.tsx
- src/shared/ui/AppEmptyView.tsx
- src/shared/ui/AppErrorView.tsx
- src/shared/ui/AppHeader.tsx
- src/shared/ui/AppIcon.tsx
- src/shared/ui/AppIconButton.tsx
- src/shared/ui/AppInput.test.tsx
- src/shared/ui/AppInput.tsx
- src/shared/ui/AppLoader.tsx
- src/shared/ui/AppText.tsx
- src/shared/ui/InlineMessage.tsx
- src/shared/ui/OptionGroup.tsx
- src/shared/ui/StateView.tsx
- src/shared/ui/StateViews.test.tsx
- src/shared/ui/getInitials.test.ts
- src/shared/ui/getInitials.ts
- src/shared/ui/icons.ts
- src/shared/ui/index.ts
- src/testing/FakeConnectivityService.ts
- src/testing/FakeHttpClient.ts
- src/testing/ManualClock.ts
- src/testing/MockPreferencesRepository.ts
- src/testing/examples/networkFeature.example.test.ts
- src/testing/mockAxiosAdapter.ts
- src/testing/renderWithProviders.tsx
- src/testing/testDependencies.ts
- tsconfig.json
