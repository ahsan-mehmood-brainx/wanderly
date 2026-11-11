---
diff_hash: 4c1ac439521ee25c7c9e9d244100e489e6814de190bd767bae8ed7a339fb8970
reviewed_at: 2026-11-11T06:39:39Z

## Summary

Feature 03, navigation and authentication. Adds a root `Stack` whose four groups (launch screen, onboarding, auth, app) are each behind a `Stack.Protected` guard driven by a single `selectAppPhase` selector, with `redirectTo` set to the current phase's entry route. Signed-in users get an `expo-router/drawer` around `expo-router/native-tabs` (Home, Explore, My Trips, Budget, Profile), each tab with its own Stack, plus a drawer-only Saved Places stack. Hrefs and route params are typed (`shared/navigation/routes.ts`). Settings moved from `/settings` to `/profile/settings`.

The new `auth` feature authenticates against DummyJSON. It is split into domain, data and presentation: `SessionManager` holds tokens in memory, with single-flight refresh, expiry events and a guard against races after sign-out. `SecureSessionRepository` stores the session in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) with a reinstall marker. Use cases cover sign-in (with a client-side attempt limiter), sign-out, restore, fetching the current user (401 → renew → retry) and demo registration (the password is never sent). An `authSlice` holds status, profile and UI state only, never tokens. The diff also adds the `onboarding` feature (flag in AsyncStorage, three-page intro), deep links (`+native-intent` → `DeepLinkInbox` → replay after sign-in through an allow-list with id validation), placeholder screens for trips, destinations, budget and saved places, en/es copy, new icons, an `InlineMessage` tone option, a `secureStore` core port with Expo and in-memory web adapters, docs, and 102 new tests (including `renderRouter` integration tests of the real `RootNavigator`). New dependencies, added with `npx expo install`: `expo-secure-store`, `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`.

Fresh review: the workspace had no `brainx-review.md` (its deletion was already pending before this work). The developer chose to review all changes, so `git add -A` was run first. `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, the convention prior reviews in this repo used so the hash does not depend on the review file itself.

Stack: React (`react` in dependencies, no NestJS marker). The runtime is React Native / Expo, so the web-only criteria in `react.md` (CSS class naming, CSS variables, `dangerouslySetInnerHTML`, React Router 404 routes, httpOnly cookies) were not applied. Hooks, state management, routing protection, data fetching, error handling, typing, accessibility and security criteria were.

Suspicions checked and dismissed: (1) A duplicate `signIn` dispatch while one is in flight does not clear `pending`. A probe confirmed that RTK does not dispatch `rejected` when `condition` returns false, so the state stays `{ pending: true }` and only one request is sent. (2) The tokens never reach Redux, plain storage or logs. A test asserts this, and `redact()` masks `token` keys. (3) `DEMO_CREDENTIALS` in the bundle are DummyJSON's published sample credentials and are not a secret.

Skimmed, not read line by line: `README.md` and `docs/ARCHITECTURE.md` (checked for stale paths and identifiers only), `package-lock.json` (only the four `package.json` additions were checked against it), and the en/es locale files (key parity is enforced by the compiler). Not verified on a device or simulator (the dev server could not be started in this session): drawer opening from inside native tabs via `DrawerActions` bubbling, the edge-swipe and back-gesture interaction, and `KeyboardAvoidingView` placement on the Register screen under a native header.

Verification run before writing this review: `npm run check` (tsc, expo lint, prettier --check, jest) is clean, with 37 suites / 288 tests passing. `npx expo-doctor` passed 20/20 checks.

Cross-repo: only one repository has staged changes.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **src/features/auth/domain/usecases/FetchCurrentUser.ts:27** — If renewal is refused while a profile refresh is starting, the session ends correctly, but `GET /auth/me` is still sent without credentials. Its 401 then lands in `refreshProfile.rejected` (`authSlice.ts:199`), which writes `profile: { status: 'failed', error: 'unauthorized' }` into the already signed-out state. That stale status survives into the next sign-in. Confirmed with a probe on the real axios stack: a refresh answered 403 and `/auth/me` answered 401, after which the requests were `post /auth/refresh auth=none | get /auth/me auth=none` and the final state was `unauthenticated` with `profile {"status":"failed","error":"unauthorized"}`. *(correctness)*
  - status: open
  - dev_reasoning: Fixed. `FetchCurrentUser` now calls `getValidAccessToken()` first and returns `sessionExpired` without sending `/auth/me` when it is null (no session / renewal refused); a 401 that arrives after the session ended also maps to `sessionExpired` without a refresh. `refreshProfile.fulfilled/rejected` now ignore results when `status !== 'authenticated'`. Tests: real `AxiosHttpClientFactory` + mock adapter in `authSlice.test.ts` asserts only `post /auth/refresh` is sent and profile stays `idle` (fails on the old code); late-result reducer test; three new `FetchCurrentUser` unit tests.
  - ai_reasoning: The path: `BearerTokenAuth` calls `getValidAccessToken()`, the refresh is refused, `expire()` runs `end()` and emits, so `sessionExpired` resets the profile. The token is then `null`, so the request leaves without an `Authorization` header and gets a 401. `FetchCurrentUser` sees `sessionManager.current === null`, so it skips the retry and returns `unauthorized`. The user-visible symptom is small: on the next sign-in, the Profile screen's first frame shows "We couldn't refresh your profile" until its mount effect dispatches `pending`. It also sends a pointless unauthenticated request. Fix both ends: in `FetchCurrentUser`, return `sessionExpired` (or skip the call) when there is no session before the request or after a 401, and in the `refreshProfile` reducers, ignore results that arrive when `state.status !== 'authenticated'`. Add a test with the real `AxiosHttpClientFactory` and a mock adapter (the probe above) asserting the profile status is `idle` after expiry.

### Low (2)
- **src/features/auth/presentation/state/authSlice.ts:160** — The comment says "`condition` skips (a duplicate dispatch) also arrive here". That is false: Redux Toolkit does not dispatch `rejected` when `condition` returns false unless `dispatchConditionRejection: true` is set, which this thunk doesn't use. The same mistaken belief drives the `if (meta.condition)` checks on `restoreSession`, `signOut`, `refreshProfile` and `registerDemoAccount` (lines 162, 189, 200, 215) and in `onboardingSlice.ts`. Those checks are harmless no-ops, but the comment teaches the wrong model. *(maintainability)*
  - status: open
  - dev_reasoning: Fixed. Removed the misleading comment and the dead `meta.condition` branches in `authSlice.ts` (restoreSession, signOut, refreshProfile, registerDemoAccount) and `onboardingSlice.ts`.
  - ai_reasoning: Verified with a probe: after a second `signIn` dispatch while the first was pending, the state was `{"pending":true,"error":null,"lockedUntil":null}`, so no `rejected` action was handled. Either delete the comment and the dead `meta.condition` branches, or keep the branches and reword the comment as purely defensive ("only reachable if `dispatchConditionRejection` is enabled"). No functional impact.
- **src/bootstrap/RootNavigator.test.tsx:349** — `launchWithFactory` duplicates most of `launch` (line 46): the onboarding and session storage seeding, the container setup and the route map. It exists only so one test can script the HTTP fake before the app starts. The route maps have already drifted: this one has no `(auth)/register` and no `trips/[tripId]` routes. *(maintainability)*
  - status: open
  - dev_reasoning: Fixed. `launch` takes an optional `configureApi` hook run before render; `launchWithFactory` is deleted, so there is one route map and one seeding path.
  - ai_reasoning: Give `launch` an optional `configureApi?: (api: ReturnType<typeof stubDummyJson>) => void` (or accept a pre-built `httpClientFactory`), call it before `renderRouter`, and delete `launchWithFactory`. That gives one route map and one seeding path, so future scenarios can't diverge silently.

## Reviewed files
- README.md
- app.json
- docs/ARCHITECTURE.md
- package-lock.json
- package.json
- src/app/(app)/(tabs)/(explore)/_layout.tsx
- src/app/(app)/(tabs)/(explore)/destinations/[destinationId].tsx
- src/app/(app)/(tabs)/(explore)/explore.tsx (renamed from src/app/(tabs)/(explore)/index.tsx)
- src/app/(app)/(tabs)/(home)/_layout.tsx
- src/app/(app)/(tabs)/(home)/index.tsx
- src/app/(app)/(tabs)/_layout.tsx
- src/app/(app)/(tabs)/budget/_layout.tsx
- src/app/(app)/(tabs)/budget/index.tsx
- src/app/(app)/(tabs)/profile/_layout.tsx
- src/app/(app)/(tabs)/profile/design-system.tsx (renamed from src/app/(tabs)/settings/design-system.tsx)
- src/app/(app)/(tabs)/profile/index.tsx
- src/app/(app)/(tabs)/profile/settings.tsx (renamed from src/app/(tabs)/settings/index.tsx)
- src/app/(app)/(tabs)/trips/[tripId]/index.tsx
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId].tsx
- src/app/(app)/(tabs)/trips/_layout.tsx
- src/app/(app)/(tabs)/trips/index.tsx
- src/app/(app)/_layout.tsx
- src/app/(app)/saved/_layout.tsx
- src/app/(app)/saved/index.tsx
- src/app/(auth)/_layout.tsx
- src/app/(auth)/register.tsx
- src/app/(auth)/sign-in.tsx
- src/app/(tabs)/(explore)/_layout.tsx (deleted)
- src/app/(tabs)/_layout.tsx (deleted)
- src/app/(tabs)/settings/_layout.tsx (deleted)
- src/app/+native-intent.tsx
- src/app/+not-found.tsx
- src/app/_layout.tsx
- src/app/onboarding.tsx
- src/app/splash.tsx
- src/bootstrap/RootNavigator.test.tsx
- src/bootstrap/RootNavigator.tsx
- src/bootstrap/appPhase.ts
- src/bootstrap/coreFactories.ts
- src/bootstrap/createAppContainer.ts
- src/core/di/AppDependencies.ts
- src/core/di/CoreDependencies.ts
- src/core/errors/AppError.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/storage/ExpoSecureKeyValueStore.test.ts
- src/core/storage/ExpoSecureKeyValueStore.ts
- src/core/storage/MemorySecureKeyValueStore.ts
- src/core/storage/SecureKeyValueStore.ts
- src/core/store/store.ts
- src/features/auth/data/DummyJsonAuthRepository.ts
- src/features/auth/data/SecureSessionRepository.ts
- src/features/auth/data/authData.test.ts
- src/features/auth/data/authMappers.ts
- src/features/auth/data/dto/authDtos.ts
- src/features/auth/data/dummyJsonApi.ts
- src/features/auth/data/jwt.ts
- src/features/auth/di.ts
- src/features/auth/domain/AuthRepository.ts
- src/features/auth/domain/AuthSession.ts
- src/features/auth/domain/AuthUser.ts
- src/features/auth/domain/Credentials.test.ts
- src/features/auth/domain/Credentials.ts
- src/features/auth/domain/DemoAccount.ts
- src/features/auth/domain/LoginAttemptLimiter.ts
- src/features/auth/domain/SessionManager.test.ts
- src/features/auth/domain/SessionManager.ts
- src/features/auth/domain/SessionRepository.ts
- src/features/auth/domain/usecases/FetchCurrentUser.ts
- src/features/auth/domain/usecases/RegisterDemoAccount.ts
- src/features/auth/domain/usecases/RestoreSession.ts
- src/features/auth/domain/usecases/SignIn.ts
- src/features/auth/domain/usecases/SignOut.ts
- src/features/auth/domain/usecases/authUseCases.test.ts
- src/features/auth/presentation/components/AuthScreenLayout.tsx
- src/features/auth/presentation/components/BrandMark.tsx
- src/features/auth/presentation/components/DemoAccountCard.tsx
- src/features/auth/presentation/hooks/useLockoutCountdown.test.tsx
- src/features/auth/presentation/hooks/useLockoutCountdown.ts
- src/features/auth/presentation/hooks/useProfile.ts
- src/features/auth/presentation/hooks/useRegisterForm.ts
- src/features/auth/presentation/hooks/useSessionLifecycle.ts
- src/features/auth/presentation/hooks/useSignInForm.ts
- src/features/auth/presentation/hooks/useSignOut.ts
- src/features/auth/presentation/screens/ProfileScreen.tsx
- src/features/auth/presentation/screens/RegisterScreen.tsx
- src/features/auth/presentation/screens/SignInScreen.tsx
- src/features/auth/presentation/state/authSlice.test.ts
- src/features/auth/presentation/state/authSlice.ts
- src/features/auth/presentation/state/selectors.ts
- src/features/budget/presentation/screens/BudgetScreen.tsx
- src/features/destinations/presentation/screens/DestinationScreen.tsx
- src/features/onboarding/data/StorageOnboardingRepository.ts
- src/features/onboarding/di.ts
- src/features/onboarding/domain/OnboardingRepository.ts
- src/features/onboarding/domain/usecases/CompleteOnboarding.ts
- src/features/onboarding/domain/usecases/LoadOnboardingStatus.ts
- src/features/onboarding/presentation/components/SlideIllustration.tsx
- src/features/onboarding/presentation/screens/OnboardingScreen.tsx
- src/features/onboarding/presentation/slides.ts
- src/features/onboarding/presentation/state/onboardingSlice.ts
- src/features/preferences/presentation/screens/SettingsScreen.tsx
- src/features/saved-places/presentation/screens/SavedPlacesScreen.tsx
- src/features/shell/presentation/components/AppDrawerContent.tsx
- src/features/shell/presentation/components/DrawerMenuButton.tsx
- src/features/shell/presentation/navigation.ts
- src/features/shell/presentation/screens/HomeScreen.tsx
- src/features/shell/presentation/screens/LaunchScreen.tsx
- src/features/shell/presentation/screens/NotFoundScreen.tsx
- src/features/shell/presentation/stackOptions.tsx
- src/features/trips/presentation/screens/ItineraryItemScreen.tsx
- src/features/trips/presentation/screens/TripScreen.tsx
- src/features/trips/presentation/screens/TripsScreen.tsx
- src/shared/navigation/InvalidLinkView.tsx
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/routes.ts
- src/shared/navigation/useDeferredDeepLink.ts
- src/shared/ui/InlineMessage.tsx
- src/shared/ui/icons.ts
- src/shared/ui/index.ts
- src/testing/authFixtures.ts
- src/testing/testDependencies.ts
- .code-reviews/brainx-review.md (previous review file, deleted before this work; not a code change)
