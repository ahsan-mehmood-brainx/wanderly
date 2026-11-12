# Wanderly architecture

This document explains how the app is structured, how dependencies are wired, how networking works, and which design patterns are used (and why). It is the reference for anyone adding a feature.

## 1. Layers

Wanderly uses Clean Architecture with three layers per feature. Dependencies point **inward only**:

```
┌────────────────────────── presentation ──────────────────────────┐
│  screens · components · view-model hooks · Redux slices/thunks   │
└───────────────┬──────────────────────────────────────────────────┘
                │ calls use cases (injected)
┌───────────────▼──────────────── domain ──────────────────────────┐
│  entities · repository interfaces (ports) · use cases            │
│  pure TypeScript: no React, Redux, axios, Expo or zod            │
└───────────────▲──────────────────────────────────────────────────┘
                │ implements repository interfaces
┌───────────────┴───────────────── data ───────────────────────────┐
│  repository implementations · DTOs + zod schemas · mappers       │
│  data sources: HttpClient (APIs), KeyValueStore (device)         │
└──────────────────────────────────────────────────────────────────┘
```

- **Domain** owns the business rules and declares what it needs (`PreferencesRepository`) without knowing how it's provided.
- **Data** fulfils those interfaces. It validates everything it reads, because API responses and storage are untrusted. It maps DTOs into entities so API field names never leak inward.
- **Presentation** turns user intent into use-case calls and state into UI. Thunks are thin adapters, and screens never touch repositories.

ESLint enforces these boundaries (`eslint.config.js`):

- Files in `features/*/domain` cannot import React, React Native, Expo, Redux, axios, zod, or any `data`/`presentation`/`di` module.
- No file outside `src/core/http` and `src/testing` can import axios.

## 2. Folder structure

```
src/
  app/                       Expo Router routes only (thin; render feature screens)
  bootstrap/                 Composition root
    createAppContainer.ts      builds the container, store and i18n (once, in app/_layout.tsx)
    coreFactories.ts           production choice for every core port
    AppProviders.tsx           DI context, Redux, i18n, safe area, preferences gate
  core/                      Cross-cutting infrastructure; knows no feature (except the DI type aggregate)
    config/                    AppConfig (env-derived settings)
    di/                        createContainer, CoreDependencies, AppDependencies, DependenciesProvider
    errors/                    AppError taxonomy, error → i18n message mapping
    events/                    Subject / Observable (Observer pattern)
    http/                      HttpClient facade, axios adapter, interceptors, error normalisation,
                               auth & retry strategies, HttpClientFactory
    logging/                   Logger port, AppLogger, log transports
    network/                   ConnectivityService port + expo-network adapter
    storage/                   KeyValueStore port + AsyncStorage adapter
    store/                     Redux store factory, typed hooks, createAppAsyncThunk
    usecase/                   UseCase<TInput, TOutput> interface
    utils/                     Clock, IdGenerator, sleep/withTimeout, redact
    result.ts                  Result<T, E>
  features/<feature>/
    domain/                    entities, repository interfaces, usecases/
    data/                      repository implementations, DTO schemas, mappers
    presentation/              state/, hooks/, screens/
    di.ts                      the feature's DI module (interfaces + factories)
  shared/                    Cross-feature UI (design system) and hooks
  testing/                   Test doubles, render helpers, executable examples
```

## 3. Dependency injection

### The container

`core/di/createContainer.ts` builds a typed container from a map of **factories**, one per service:

```ts
const dependencies = createContainer<AppDependencies>({
  ...createCoreFactories({ config, getLanguage }), // logger, clock, storage, connectivity, http…
  ...preferencesFactories, // each feature contributes its own module
});
```

- **Lazy.** A service is built the first time it is read, so launch only pays for what the first screen uses. The HTTP stack and connectivity listener are not created until something needs them.
- **Singleton per container.** Each factory runs at most once. The app creates exactly one container (module scope in `app/_layout.tsx`), so services are app-wide singletons with no global `getInstance()`. Each test builds its own container, so state never leaks between tests.
- **Resolution by name.** Factories receive the container (`(c) => new LoadPreferences(c.preferencesRepository, c.logger)`). Overriding one service (e.g. a mock repository) therefore reaches everything that depends on it.
- **Safe.** Cycles throw `CircularDependencyError` with the full path. A factory that throws is not cached, and the container object is frozen.

`AppDependencies` is an interface (`CoreDependencies & PreferencesDependencies & …`). Consumers depend on the interface and never on the container, so this is constructor/argument injection, not a service locator.

### Feature modules

Each feature declares what it contributes in `features/<name>/di.ts`:

```ts
export interface PreferencesDependencies {
  readonly preferencesRepository: PreferencesRepository;
  readonly loadPreferences: UseCase<void, Preferences>;
  readonly savePreferences: UseCase<Preferences, Result<void, AppError>>;
}

export const preferencesFactories: Factories<PreferencesDependencies, CoreDependencies & PreferencesDependencies> = {
  preferencesRepository: (c) => new StoragePreferencesRepository(c.keyValueStore, c.logger),
  loadPreferences: (c) => new LoadPreferences(c.preferencesRepository, c.logger),
  savePreferences: (c) => new SavePreferences(c.preferencesRepository, c.logger),
};
```

The second type parameter lists only what the feature's factories need. That keeps modules decoupled, and the compiler still checks them when they are merged into the root.

### Where services are consumed

| Consumer           | How                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------- |
| Redux thunks       | `extra` (`createAppAsyncThunk`); `extraArgument` is the container                     |
| Hooks/components   | `useDependencies()`; destructure only what you need (lazy), prefer view-model hooks   |
| Services/use cases | Constructor parameters, typed by interface                                            |
| Tests              | `createTestDependencies({ …overrides })` or `testCoreFactories()` + feature factories |

## 4. Networking

### Using it from a repository

```ts
const http = c.httpClientFactory.create({
  name: 'open-meteo',
  baseUrl: 'https://api.open-meteo.com/v1',
  auth: new ApiKeyAuth({ name: 'apikey', value: KEY, location: 'query' }), // optional
  timeoutMs: 10_000, // optional
});

const result = await http.get('/forecast', { query: { latitude, longitude }, schema: forecastDtoSchema, signal });
if (!result.ok) return err(result.error); // ApiError is an AppError: the kind flows to the UI as-is
return ok(toForecast(result.value.data)); // map DTO → entity
```

The HTTP client never throws. Every call resolves to `Result<ApiResponse<T>, ApiError>`.

### Request lifecycle

```
repository ──► HttpClient (facade: AxiosHttpClient)
                 │  generates requestId; retry loop
                 ▼
               axios instance (per API, built by AxiosHttpClientFactory)
                 │  request interceptors, in order:
                 │   1. offlineGuard     fail fast with `offline` when the device is definitely offline
                 │   2. stampRequest     start time; X-Request-Id if the API opts in
                 │   3. languageHeader   Accept-Language = current UI language
                 │   4. authorize        AuthStrategy credentials (header or query)
                 ▼
               transport (XHR on device; mock adapter in tests)
                 │  response interceptor:
                 │   success → debug log with status + duration
                 │   failure → normalizeHttpError → warn log (debug if cancelled) → reject ApiError
                 ▼
               HttpClient: RetryStrategy decides retry/give up · zod schema validation · ApiResponse envelope
```

### Standard response and error model

`ApiResponse<T>` has `{ data, status, headers (lower-cased), requestId, durationMs, attempts }`.

`ApiError extends AppError`, so it shares the app-wide `kind` taxonomy. It also carries `status`, `code`, `method`, `url`, `requestId`, `retryAfterMs`, `serverMessage` (for logs, never for users) and `retryable`. All classification happens in **one** function, `normalizeHttpError`:

| Failure                               | `kind`                       | Retryable | Shown to user as (`errors.kind.*`) |
| ------------------------------------- | ---------------------------- | --------- | ---------------------------------- |
| Device offline (pre-flight)           | `offline`                    | no        | "You're offline" + offline icon    |
| No response (DNS, refused, TLS, CORS) | `network`                    | yes       | check your connection              |
| Timeout / HTTP 408                    | `timeout`                    | yes       | taking longer than expected        |
| `AbortSignal` aborted                 | `cancelled`                  | no        | not shown, not reported            |
| 401 / 403                             | `unauthorized` / `forbidden` | no        | access messages                    |
| 404 / 410                             | `notFound`                   | no        | couldn't find it                   |
| 429                                   | `rateLimited`                | yes       | wait a moment                      |
| other 4xx                             | `badRequest`                 | no        | request wasn't right               |
| 5xx                                   | `server`                     | yes       | service is having trouble          |
| Body fails the zod schema             | `parse`                      | no        | unexpected response                |
| Anything else                         | `unknown`                    | no        | generic message                    |

In the UI, `<AppErrorView errorKind={error.kind} onRetry={…} />` renders the right translated copy and icon.

### Timeouts

There is a default per-attempt timeout (`AppConfig.http.timeoutMs`, 15 s). An `ApiDefinition.timeoutMs` overrides it per API, and `RequestOptions.timeoutMs` overrides it per request. Axios is configured with `clarifyTimeoutError` so timeouts are never confused with aborts.

### Retries

`ExponentialBackoffRetry` (the default, 2 retries) uses exponential backoff with jitter and honours `Retry-After`. It retries only **idempotent** methods (GET/PUT/DELETE) and only **retryable** kinds. For example, a search-as-you-type can pass `retry: noRetry`. All attempts share one `requestId`, so logs correlate.

### Cancellation

Pass an `AbortSignal`. Aborting cancels the in-flight attempt **and** any pending retry wait, and the result is a `cancelled` error. Redux thunks already receive a signal:

```ts
export const searchPlaces = createAppAsyncThunk('places/search', (query: string, { extra, signal }) =>
  extra.searchPlaces.execute({ query, signal }),
);

useEffect(() => {
  const promise = dispatch(searchPlaces(query));
  return () => promise.abort(); // leaving the screen or typing again cancels the request
}, [dispatch, query]);
```

### Offline

`ConnectivityService` (backed by `expo-network`) is observable. Only `isConnected === false` counts as offline, because `isInternetReachable` gives false negatives on some networks. The HTTP client reads the snapshot to fail fast. UI uses `useConnectivity()`, which re-renders only on change.

### Security notes

- Query parameters (which may hold API keys) are never logged; only the path is.
- `Logger` redacts keys such as `token`, `password`, `authorization`, `apiKey` from any log context.
- `X-Request-Id` is opt-in per API. On web, non-safelisted headers trigger CORS preflights that public APIs usually reject.
- Anything in the app bundle (including `EXPO_PUBLIC_*`) is public. Only use API keys meant for client apps, and restrict them at the provider.

## 5. Logging and utility services

- **Logger** (`core/logging`). `debug/info/warn/error` plus `child(context)` for scoped loggers (`{ scope: 'http', api }`). Output goes to `LogTransport`s: `ConsoleTransport` in every build (all levels in development; `warn`+ in release, where React Native forwards it to the native device log), with crash reporting (Sentry) to be added as another transport alongside it. A failing transport never crashes the app.
- **Clock / IdGenerator.** Injected so time- and id-dependent logic is deterministic in tests (`ManualClock`, `sequentialIds`).
- **`sleep(ms, signal)` / `withTimeout(promise, ms)`.** Abort-aware delays and deadlines.
- **`redact(value)`.** Masks sensitive keys before anything is logged.

## 6. Design patterns: where and why

| Pattern                          | Where                                                                                                                                                                | Why it's used here                                                                                                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository**                   | `PreferencesRepository` → `StoragePreferencesRepository`; future `XRepository` → `HttpXRepository`                                                                   | Domain logic asks for data in domain terms and doesn't care whether it comes from AsyncStorage, an API, or a cache. Swapping the source (e.g. adding offline caching in feature 7) changes one class, and use cases are tested with in-memory repositories.                      |
| **Dependency Injection**         | `createContainer`, feature `di.ts` modules, thunk `extra`, `useDependencies`                                                                                         | Classes receive collaborators instead of constructing them. This is what makes every layer testable without network or storage, and keeps concrete choices in one place (the composition root).                                                                                  |
| **Factory**                      | `HttpClientFactory.create(apiDefinition)`; DI factories (`Factories<T>`); `createAppContainer`, `createAppStore`, `createI18n`                                       | Building an HTTP client is non-trivial (base URL, timeout, interceptors, auth, retry). A factory lets features describe _what_ they need while the factory owns _how_ it's assembled. The test factory returns fakes with no other change.                                       |
| **Strategy**                     | `RetryStrategy` (`ExponentialBackoffRetry`, `noRetry`), `AuthStrategy` (`noAuth`, `ApiKeyAuth`, `BearerTokenAuth`), `LogTransport`                                   | Public travel APIs differ in how keys are sent and how retries should behave, and log destinations differ by environment. The algorithm (retry loop, interceptor pipeline, logger) stays fixed, and behaviour varies by plugging in a strategy, per API or per request.          |
| **Adapter**                      | `AxiosHttpClient` (axios → `HttpClient`), `ExpoNetworkConnectivityService` (expo-network → `ConnectivityService`), `AsyncStorageKeyValueStore`, DTO → entity mappers | Third-party APIs are wrapped behind interfaces the app owns. axios or expo-network could be replaced without touching features, and API field names stay out of the domain.                                                                                                      |
| **Facade**                       | `HttpClient` (`get/post/put/patch/delete` → `Result`)                                                                                                                | Repositories see five verbs and a Result. Interceptors, auth, retries, timeouts, cancellation, validation and error mapping are hidden behind it, so network code stays short and consistent.                                                                                    |
| **Observer**                     | `Subject`/`Observable`; `ConnectivityService.subscribe`; `useConnectivity` (`useSyncExternalStore`); Redux store subscriptions                                       | Connectivity changes are pushed to interested parties (UI, HTTP guard) instead of being polled. Listeners are isolated, so one throwing listener can't break the others.                                                                                                         |
| **Singleton** (container-scoped) | Every service in the app container; one container per app run                                                                                                        | Services such as the logger, HTTP clients and connectivity listener must exist once (shared state, one native listener). This is done by container lifetime rather than global `getInstance()`, because global singletons are hidden dependencies that leak state between tests. |

Also used: **Result type** (errors as values at layer boundaries), **Template Method** (`BaseHttpClient` implements the verbs once over `request`, for the real and fake clients), and **Chain of Responsibility** (the axios interceptor pipeline).

## 7. SOLID in practice

- **Single Responsibility.** Each interceptor does one thing. `normalizeHttpError` only classifies, retry policy only decides delays, use cases hold one business action, and thunks only bridge Redux.
- **Open/Closed.** New auth schemes, retry policies, log destinations or APIs are added as new strategies, transports or `ApiDefinition`s, with no edits to the HTTP client or logger. New features add a DI module without changing existing ones.
- **Liskov Substitution.** `FakeHttpClient`, `MockPreferencesRepository`, `FakeConnectivityService` and `InMemoryKeyValueStore` honour the same contracts as production (e.g. the fake HTTP client still applies schemas and cancellation), so tests exercise real behaviour.
- **Interface Segregation.** Small ports (`Clock`, `KeyValueStore`, `UseCase`), and feature factories declare only the slice of the container they need. The interceptors depend on `Pick<ConnectivityService, 'isOffline'>`.
- **Dependency Inversion.** Domain declares interfaces and outer layers implement them. Concrete classes are named only in `bootstrap/` and feature `di.ts` files.

## 8. Testing

No test makes a real network request or touches device storage.

| Test double                                | Replaces                | Notes                                                                            |
| ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------- |
| `createTestDependencies(overrides)`        | the whole app container | real feature code over in-memory fakes; overrides flow to dependants             |
| `testCoreFactories()`                      | core ports              | compose with a feature's factories to test a module in isolation                 |
| `MockPreferencesRepository`                | `PreferencesRepository` | stateful, switchable failures, jest spies                                        |
| `FakeHttpClient` / `FakeHttpClientFactory` | `HttpClient` / factory  | stub `METHOD path` replies, applies zod schemas, honours abort, records requests |
| `createMockAxiosAdapter`                   | axios transport         | drives the _real_ client, interceptors and retries with scripted replies         |
| `FakeConnectivityService`                  | `ConnectivityService`   | `fake.set(OFFLINE)` notifies subscribers                                         |
| `ManualClock`, `sequentialIds`             | `Clock`, `IdGenerator`  | deterministic time and ids                                                       |
| `createTestLogger()`                       | `Logger`                | jest spies; `child()` returns the same logger                                    |
| `InMemoryKeyValueStore`                    | `KeyValueStore`         |                                                                                  |

What to test at each layer:

- **Use cases:** with mock repositories, no store and no HTTP (`LoadPreferences.test.ts`).
- **Repositories:** with `FakeHttpClient` or `InMemoryKeyValueStore`. Check endpoint, mapping, validation and error propagation.
- **HTTP infrastructure:** through the real factory with `createMockAxiosAdapter` (`AxiosHttpClient.test.ts`).
- **State and screens:** through `createAppStore(createTestDependencies(...))` and `renderWithProviders`.

`src/testing/examples/networkFeature.example.test.ts` is an executable walkthrough of a complete network-backed feature: entity, repository port, use case, DTO schema, mapper, HTTP repository and DI module, with tests at each level.

## 9. Adding a network-backed feature

1. **Domain:** entities, a repository interface, and use cases implementing `UseCase<I, O>` that return `Result<T, AppError>`.
2. **Data:** a zod DTO schema, a DTO → entity mapper, and `HttpXRepository` taking an `HttpClient`. Pass `schema` and `signal` on every call.
3. **DI:** `features/x/di.ts` with an `XDependencies` interface and factories, where the client comes from `c.httpClientFactory.create(X_API)`. Add `XDependencies` to `AppDependencies` and spread the factories in `createAppContainer` and `createTestDependencies`.
4. **Presentation:** thunks call `extra.useCase.execute({ …, signal })`, and screens use a view-model hook. Render loading/empty/error states with `AppErrorView errorKind`.
5. **Tests:** use case with a mock repository, repository with `FakeHttpClient`, screen with `renderWithProviders`.
6. **README:** add the API to "Third-party data and attribution".

## 10. Navigation and authentication

### Route tree

```
src/app/
  _layout.tsx            providers + RootNavigator (bootstrap/RootNavigator.tsx)
  +native-intent.tsx     records every incoming native link in the DeepLinkInbox
  +not-found.tsx
  splash.tsx             launch screen while the session is restored       (phase: splash)
  onboarding.tsx         three intro pages                                 (phase: onboarding)
  (auth)/                Stack: sign-in, register                          (phase: auth)
  (app)/_layout.tsx      Drawer: custom content, swipe only on root screens (phase: app)
    (tabs)/_layout.tsx   NativeTabs: (home) · (explore) · trips · budget · profile, each a Stack
    saved/               drawer-only destination (Saved Places)
```

### Protected navigation

`selectAppPhase` (`bootstrap/appPhase.ts`) reduces auth status and the onboarding flag to one phase: `splash` → `onboarding` (first run) → `auth` → `app`. A restored session skips onboarding. `RootNavigator` opens exactly one `Stack.Protected` guard per phase. Every guard has `redirectTo` set to the current phase's entry route, because without it a group with no index (`(auth)`) resolves to not-found. No screen navigates to or from sign-in by hand. Signing in, signing out and session expiry only change state, and the guards move the user.

### Session model

| Piece                             | Responsibility                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DummyJsonAuthRepository`         | login, refresh, `/auth/me`, demo sign-up. Maps 400/401 at login to `invalidCredentials` and a refused refresh to `sessionExpired`.                                        |
| `SecureSessionRepository`         | Session JSON in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). A plain-storage marker discards Keychain sessions left behind by a previous install.                      |
| `SessionManager` (domain service) | Holds tokens in memory. `getValidAccessToken()` renews expired tokens with a single in-flight refresh. A refused renewal ends the session and emits `onExpired`.          |
| Use cases                         | `SignIn` (with `LoginAttemptLimiter`: 5 wrong passwords → 30 s pause), `SignOut`, `RestoreSession`, `FetchCurrentUser` (401 → renew once → retry), `RegisterDemoAccount`. |
| `authSlice`                       | Status, user, notice (`sessionExpired` / `restoreFailed` / `signedOut`), sign-in/profile/registration UI state. Never tokens.                                             |

The authorized HTTP client reads the token through `BearerTokenAuth(() => sessionManager.getValidAccessToken())`, a closure resolved per request, so there is no DI cycle and renewed tokens are picked up automatically. `useSessionLifecycle` restores the session at launch, turns `onExpired` into a `sessionExpired` action, and renews stale tokens when the app returns to the foreground.

| Edge case                       | Behaviour                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Missing token                   | Signed out with no notice (first run or after sign-out).                                           |
| Expired access token            | Renewed before the request is sent, at launch, on foreground, or on a 401.                         |
| Refresh refused                 | Session cleared everywhere and the user returns to sign-in with "Your session expired".            |
| Offline at launch               | Session kept (the app works offline). Renewal is retried later.                                    |
| Unreadable or hung storage      | Signed out with "We couldn't restore your session" after a 5 s cap. Corrupt entries are discarded. |
| Invalid credentials             | Inline error. Counts towards the attempt limiter (network errors don't).                           |
| Repeated or double submissions  | The thunk `condition` drops a second in-flight sign-in. POSTs are never retried.                   |
| Restart during sign-in          | Nothing is persisted until login succeeds, so the app opens on sign-in.                            |
| Refresh settling after sign-out | Discarded, so it can't resurrect the session.                                                      |

### Deep links

`+native-intent` records each incoming path in `deepLinkInbox` (on web, the page URL is recorded at start-up). When the phase becomes `app`, `useDeferredDeepLink` resolves the pending link through an allow-list (`resolveDeepLink`: destinations, trips, itinerary items and top-level tabs, with ids validated by `parseRouteId`) and navigates to it. The navigation waits one macrotask so the guard redirect doesn't overwrite it. While signed in, the router opens links itself.

### Testing

`bootstrap/RootNavigator.test.tsx` drives the real `RootNavigator`, guards, providers and auth screens with `renderRouter` (the signed-in area is a plain Stack, since the drawer and native tabs need native views). It covers onboarding, protected routes, login, validation, network errors, double submission, lockout, demo sign-up, restore, renewal, expiry, sign-out and deep-link replay. `testing/authFixtures.ts` provides `stubDummyJson`, `fakeJwt`, `testSession` and `InMemorySessionRepository`. In development builds, Profile › Session testing can expire the access token or invalidate the session on a device.
