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
│  data sources: HttpClient (APIs), KeyValueStore, SqlDatabase     │
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
    database/                  SqlDatabase port, SqliteDatabase (queue, transactions), migrations, expo-sqlite driver
    cache/                     MemoryCache, PersistentCache + CacheStore (SQLite `cache_entries`) for offline copies
    sync/                      LocalChangeLog, outbox (SQLite `sync_outbox`), coalescing, retry policy, SyncGateway, SyncEngine
    di/                        createContainer, CoreDependencies, AppDependencies, DependenciesProvider
    errors/                    AppError taxonomy, error → i18n message mapping
    events/                    Subject / Observable (Observer pattern)
    http/                      HttpClient facade, axios adapter, interceptors, error normalisation,
                               auth & retry strategies, HttpClientFactory
    logging/                   Logger port, AppLogger, log transports
    network/                   ConnectivityService port + NetInfo adapter
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

`ConnectivityService` (backed by `@react-native-community/netinfo`) is observable. Only `isConnected === false` counts as offline, because `isInternetReachable` gives false negatives on some networks. The HTTP client reads the snapshot to fail fast. UI uses `useConnectivity()`, which re-renders only on change.

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

| Pattern                          | Where                                                                                                                                                       | Why it's used here                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository**                   | `PreferencesRepository` → `StoragePreferencesRepository`; future `XRepository` → `HttpXRepository`                                                          | Domain logic asks for data in domain terms and doesn't care whether it comes from AsyncStorage, an API, or a cache. Swapping the source (e.g. the offline caching of § 20) changes one class, and use cases are tested with in-memory repositories.                              |
| **Dependency Injection**         | `createContainer`, feature `di.ts` modules, thunk `extra`, `useDependencies`                                                                                | Classes receive collaborators instead of constructing them. This is what makes every layer testable without network or storage, and keeps concrete choices in one place (the composition root).                                                                                  |
| **Factory**                      | `HttpClientFactory.create(apiDefinition)`; DI factories (`Factories<T>`); `createAppContainer`, `createAppStore`, `createI18n`                              | Building an HTTP client is non-trivial (base URL, timeout, interceptors, auth, retry). A factory lets features describe _what_ they need while the factory owns _how_ it's assembled. The test factory returns fakes with no other change.                                       |
| **Strategy**                     | `RetryStrategy` (`ExponentialBackoffRetry`, `noRetry`), `AuthStrategy` (`noAuth`, `ApiKeyAuth`, `BearerTokenAuth`), `LogTransport`                          | Public travel APIs differ in how keys are sent and how retries should behave, and log destinations differ by environment. The algorithm (retry loop, interceptor pipeline, logger) stays fixed, and behaviour varies by plugging in a strategy, per API or per request.          |
| **Adapter**                      | `AxiosHttpClient` (axios → `HttpClient`), `NetInfoConnectivityService` (NetInfo → `ConnectivityService`), `AsyncStorageKeyValueStore`, DTO → entity mappers | Third-party APIs are wrapped behind interfaces the app owns. axios or NetInfo could be replaced without touching features, and API field names stay out of the domain.                                                                                                           |
| **Facade**                       | `HttpClient` (`get/post/put/patch/delete` → `Result`)                                                                                                       | Repositories see five verbs and a Result. Interceptors, auth, retries, timeouts, cancellation, validation and error mapping are hidden behind it, so network code stays short and consistent.                                                                                    |
| **Observer**                     | `Subject`/`Observable`; `ConnectivityService.subscribe`; `useConnectivity` (`useSyncExternalStore`); Redux store subscriptions                              | Connectivity changes are pushed to interested parties (UI, HTTP guard) instead of being polled. Listeners are isolated, so one throwing listener can't break the others.                                                                                                         |
| **Singleton** (container-scoped) | Every service in the app container; one container per app run                                                                                               | Services such as the logger, HTTP clients and connectivity listener must exist once (shared state, one native listener). This is done by container lifetime rather than global `getInstance()`, because global singletons are hidden dependencies that leak state between tests. |

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
| `nodeSqliteDriver`                         | expo-sqlite connection  | real SQLite (`node:sqlite`, Node 22.13+) in memory; the default test `database`  |

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
    saved/               drawer-only Stack: Saved Places (index) · collections/[collectionId]
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

`+native-intent` records each incoming path in `deepLinkInbox` (on web, the page URL is recorded at start-up). When the phase becomes `app`, `useDeferredDeepLink` resolves the pending link through an allow-list (`resolveDeepLink`: destinations, trips, itinerary days, items, add and edit forms, and top-level tabs, with ids validated by `parseRouteId` and dates by `isLocalDate`) and navigates to it. The navigation waits one macrotask so the guard redirect doesn't overwrite it. While signed in, the router opens links itself.

### Testing

`bootstrap/RootNavigator.test.tsx` drives the real `RootNavigator`, guards, providers and auth screens with `renderRouter` (the signed-in area is a plain Stack, since the drawer and native tabs need native views). It covers onboarding, protected routes, login, validation, network errors, double submission, lockout, demo sign-up, restore, renewal, expiry, sign-out and deep-link replay. `testing/authFixtures.ts` provides `stubDummyJson`, `fakeJwt`, `testSession` and `InMemorySessionRepository`. In development builds, Profile › Session testing can expire the access token or invalidate the session on a device.

## 11. Discover and destination search

Feature 1 lives in `features/discover/` and is the reference for a feature with several data sources, RTK Query and on-device history.

### Data sources and what they can't do

| Source                     | Provides                                                                                                                                                    | Does not provide                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| REST Countries v5          | Countries: names, codes, capitals, region, population, area, flags, currencies, languages, time zones, borders, calling codes, driving side, Wikipedia link | Cities (beyond capitals), attractions, photos, travel categories |
| Wikipedia                  | Descriptions, photos, title search across all articles                                                                                                      | Structured facts, a "places only" search, rankings               |
| Editorial (`editorial.ts`) | Featured, trending and popular picks, destination categories                                                                                                | Anything dynamic                                                 |

So search combines three result sets: countries and capitals matched **locally** against the cached catalogue, curated destinations, and Wikipedia title hits filtered to place-like descriptions (best-effort country inference from the description). Featured, trending and categories are editorial, because neither API ranks or classifies places.

### Layers

```
presentation  DiscoverScreen · SearchScreen · DestinationScreen
              view-model hooks · discoverApi (RTK Query) · discoverSlice (history)
domain        Country, DestinationSummary, DestinationDetails, SearchFilters, DestinationId
              SearchDestinations · GetDestinationDetails · GetCuratedCollection · GetPopularCountries
              GetRecommendations · GetFilterOptions · DiscoveryHistory (+ thin history use cases)
data          RestCountriesRepository · WikipediaPlaceContentRepository   (remote)
              CachedCountryRepository · CachedPlaceContentRepository      (in-memory TTL decorators)
              StorageDiscoveryHistoryRepository                            (KeyValueStore)
```

### RTK Query

`discoverApi` uses `fakeBaseQuery` and calls a use case in each endpoint's `queryFn` (`api.extra` is the DI container, `api.signal` is passed through). Errors are stored as `{ kind: AppErrorKind }`. RTK Query provides the per-argument cache (`keepUnusedDataFor`: search 2 min, details and feed 30 min), de-duplication, loading flags and protection against out-of-order search responses. On-device state that isn't server data (search history, recently viewed) stays in `discoverSlice`.

There are two cache levels on purpose: RTK Query caches what each screen asked for; the repository decorators cache the shared inputs (the country catalogue, Wikipedia summaries) that several use cases need, coalesce concurrent loads, and never cache failures.

### Failure handling

| Situation                                        | Behaviour                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| No API key / key rejected / demo-key sample data | `configuration` error, no request when the key is missing; never shows sample data as real                     |
| Retired API version (HTTP 200 with error body)   | Fails the envelope schema → `parse`                                                                            |
| One malformed country                            | Skipped and logged; a malformed field blanks that field only                                                   |
| 429                                              | Retried when `Retry-After` ≤ 5 s, otherwise `rateLimited` with copy asking to wait                             |
| Wikipedia search fails                           | Local results still shown, with an inline notice                                                               |
| Missing article / disambiguation page            | Other titles tried (article link from REST Countries, `X (country)`, `X, Country`), then "no description"      |
| Missing or broken image                          | Themed placeholder (category icon, or flag emoji for countries)                                                |
| One home section fails                           | That section shows an inline error with retry; others render                                                   |
| Featured/trending sources fail                   | Catalogue failure (other than `configuration`) or every summary failing is an error with retry, not bare cards |
| Description fails on a destination               | About card shows the failure with a "Try again" button that reloads the destination                            |
| "Read more" link can't be opened                 | `openExternalUrl` logs it and the card shows an inline error; never an unhandled rejection                     |

### Testing

`testing/discoverFixtures.ts` provides a fixture world in the v5 wire format, `stubDiscoverApis` (scripts both APIs on a `FakeHttpClientFactory`) and stateful repository fakes. Stores for tests come from `createTestStore` (used by `renderWithProviders`); `jest.afterEnv.ts` resets them after each test so RTK Query's cache-expiry timers don't keep Jest running.

## 12. Weather

`features/weather/` provides forecasts from [Open-Meteo](https://open-meteo.com/en/docs) for any position, plus the device's position (expo-location). It follows the Discover layout (§ 11): use cases behind RTK Query, with caching split between memory and device.

### Layers

```
presentation  WeatherForecastView (full screen) · WeatherSummaryCard · DeviceWeatherCard / DeviceWeatherView
              useWeather(coordinates) · useDeviceWeather() · weatherApi (RTK Query) · format.ts · units.ts
domain        Coordinates (validate, round) · WeatherForecast / WeatherReport · weatherCodes (WMO → condition)
              weatherCalculations (now, next 24 h, days, daylight, range bars, units, time zones)
              GetWeatherForecast (cache policy) · GetDeviceLocation · Get/RequestLocationPermission
data          OpenMeteoWeatherRepository (HttpClient + zod DTOs + mappers) · StorageWeatherCache (KeyValueStore)
              ExpoDeviceLocationService (expo-location adapter, injectable for tests)
```

Weather appears on the destination page (`DestinationWeatherCard`, linking to `destinations/[id]/weather`) and on the trip page. Trips store a destination's id and name but not its coordinates, so the trip page still shows the weather where the device is (`trips/[id]/weather` for the full forecast). It can switch to the destination through the same `useWeather` hook once coordinates are available.

### Requests and time zones

One request per position: `current`, `hourly` and `daily` variables, with `timezone=auto` and `timeformat=unixtime`. Every time is an instant, and the response's IANA zone and offset become `ForecastTimeZone`. The UI formats times in the destination's zone (`formatInZone`: the IANA zone when the engine knows it, otherwise the fixed offset). "Today" is the date at the destination (`localDateKey`), and a note shows the zone when it differs from the device's. Units stay metric on the wire. The UI converts to °F/mph from the device region (`expo-localization`), so one cached forecast serves every unit.

### Caching

| Level                         | What                                      | Lifetime                                                             |
| ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| RTK Query (`weatherApi`)      | Report per rounded position               | 15 min after the last subscriber; de-duplicates card + screen        |
| `GetWeatherForecast` + device | Last 6 forecasts (`weather.forecasts.v1`) | Used without a request for 15 min; as an offline fallback up to 72 h |

Coordinates are rounded to 2 decimals (~1 km, finer than the weather models' resolution) before they become cache keys or leave the device. `refetch()` (pull to refresh, "try again") sets RTK Query's `forced`, which skips the fresh saved copy. When a saved copy is shown because the network failed, `WeatherReport.fallbackReason` says why, the UI shows its age, and `useWeather` refetches when connectivity returns. "Now" is taken from the forecast hour when `current` is older than an hour, so an old saved forecast doesn't show stale conditions as current. The summary is re-derived once a minute and on return to the foreground, so a screen left open overnight shows the new day. `StorageWeatherCache` serialises its saves, so forecasts downloaded at the same time don't overwrite each other.

### Edge cases

| Situation                                             | Behaviour                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Out-of-range, non-finite, or 0,0 coordinates          | `invalidLocation`; no request                                                                      |
| Destination without coordinates                       | `locationUnavailable`; "we don't know exactly where this place is", no retry                       |
| Place whose Wikipedia summary failed to load          | That error, with a retry that refetches the destination (not the "no coordinates" message)         |
| Screen left open for hours / app back from background | "Now", "Today" and the age move on; stale forecast, retryable error or stale position re-read      |
| Country                                               | Forecast for REST Countries' reference point, labelled "centre of …"                               |
| Location permission not asked / denied / blocked      | Explanation first, then the prompt on tap; blocked shows "Open Settings"; re-checked on foreground |
| Location services off, no fix in 15 s                 | `locationUnavailable` with retry; a last-known fix under 10 min old is used instantly              |
| Timeout / 5xx / 429                                   | One retry (10 s per attempt); then the saved forecast (marked) or an error with retry              |
| 400 `{ error, reason }` / 200 with an error body      | `badRequest` / `parse`; never hidden behind saved data (`badRequest`)                              |
| Missing or malformed values                           | That value is `null` and shown as "—" / "not available"; arrays stay aligned with `time`           |
| Polar day / night (sunrise = sunset = midnight)       | Classified by `daylight_duration`; "Sun up all day" / "No sunrise today"                           |
| Unknown WMO code                                      | `unknown` condition with a neutral icon, never a guess                                             |

Back from the background (or with the screen left open for hours), "Now", "Today" and the forecast age move on through `useNow`. A forecast older than 15 min is downloaded again, and a retryable error (server, timeout, offline…) is retried. The device position is re-read when the last read failed or is over 2 min old, measured from when it was read (`DevicePosition.readAt`), not from when the screen mounted. If the traveller has moved, the stale forecast for the old place is still downloaded once before the new place's forecast replaces it.

### Testing

`testing/weatherFixtures.ts` builds Open-Meteo responses in the wire format around `WEATHER_NOW` for any offset, and `stubWeatherApi` scripts them. `FakeDeviceLocationService` is the default `deviceLocationService` in `createTestDependencies` (permission starts `undetermined`). Mapping and calculations are unit tested, including a captured Svalbard polar-night response. The use case's cache policy is tested with an in-memory cache, the repository with both `FakeHttpClient` and the real client over `createMockAxiosAdapter` (timeouts, retries, error bodies), and the screens through `renderWithProviders`.

## 13. Explore map and nearby places

`features/map/` is the `/map` screen in the Explore stack (Map button next to search on Discover, deep link `wanderly://map`). The base map is the platform's own (Apple Maps on iOS, Google Maps on Android) through react-native-maps. OpenStreetMap is the data source for places (Overpass) and search (Nominatim), credited on the map with "© OpenStreetMap contributors".

### Layers

```
presentation  ExploreMapScreen (+ .web.tsx: "Map available in the mobile app") · MapCanvas (the only react-native-maps import)
              PlaceSheet · CategoryChips · useExploreMap() · useMapLocation() · mapApi (RTK Query) · mapSlice (pins)
              mapAvailability (Android without a Google Maps key never mounts MapView) · format.ts (m/km or ft/mi)
domain        Place · LocationSearchResult · CustomMarker · geo (checkCoordinates, roundTo, haversine, pin label)
              filterPlaces · buildDirectionsUrls · SearchPlaces · GetNearbyPlaces · GetCurrentLocation
              Check/RequestMapLocationPermission · Load/Add/RemoveCustomMarker
data          ExpoLocationService (LocationService) · NominatimGeocodingService (GeocodingService)
              OverpassPlacesApiService (PlacesApiService) · OsmPlacesRepository (PlacesRepository, core/cache MemoryCache)
              RequestThrottle · overpassQuery (query + category table) · mappers · StorageCustomMarkerRepository
```

The map has its own `LocationService` instead of reusing weather's adapter: it needs street-level accuracy (`Accuracy.Balanced`, last-known fix under 2 min / 100 m, full precision) and reports location services being off as its own kind, `locationServicesDisabled`.

### Request policy

Both services are run by volunteers, so the data layer enforces their usage policies in one place:

- Every request sends `User-Agent: Wanderly/1.0 (com.wanderly.app)`.
- Nominatim: only on submit (no autocomplete), a trimmed query of 2 to 200 characters, `limit=5`, at least 1 s between requests.
- Overpass: one GET `/interpreter?data=` per centre, covering all six categories (`out center 40` each, named elements within 1.5 km). Requests run one at a time, at least 2 s apart. Category chips filter on the device, so toggling them never sends a request.
- Known limitation: Overpass applies `out center 40` in element id order, not by distance. In a dense area (e.g. central Paris, with hundreds of restaurants within 1.5 km) a category's 40 places are spread across the whole circle, and the ones right next to the user can be missing. The app sorts what it gets by distance, so the list is "nearest of the loaded places", not the true nearest. Fixing this needs a smaller radius or a second, wider query, which the one-request-per-centre policy above rules out for now.
- No HTTP-level retry (`retry: noRetry` on both APIs): a retry would run inside one throttle slot, skipping the spacing and answering a 429 before the cooldown starts. Try again and the back-online reload go through the throttle.
- A 429 starts a cooldown (`Retry-After`, else 30 s). Until it ends that service answers `rateLimited` without a request.
- The centre is rounded to 3 decimals (~110 m) before it leaves the device. It is the cache key too. `GetNearbyPlaces` then measures each place's distance again from the exact position, so distances and order are not off by the rounding.

| Level                 | What                               | Lifetime                                    |
| --------------------- | ---------------------------------- | ------------------------------------------- |
| `OsmPlacesRepository` | Places per rounded centre          | 10 min, 30 entries; failures are not cached |
| `OsmPlacesRepository` | Search hits per language + query   | 30 min, 30 entries                          |
| RTK Query (`mapApi`)  | Position / places / search results | 2 / 10 / 5 min after the screen goes away   |

### Edge cases

| Situation                                       | Behaviour                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Permission not asked / denied / blocked         | Explanation first, prompt on tap (a double tap asks once); blocked shows "Open Settings"             |
| Back from Settings                              | Permission re-checked on foreground; a failed position is read again                                 |
| Back in the foreground, or "My location"        | A position older than 2 min is read again; the camera and nearby places follow the new one           |
| Position known before the map is ready          | The camera move waits for `onMapReady` (Android's Google map drops earlier moves)                    |
| Location services off                           | `locationServicesDisabled`: "Location services are off" with Try again; no places request            |
| No fix in 15 s, native error, NaN / 0,0 / range | `locationUnavailable`: "We couldn't find your location" with Try again; no places request            |
| Invalid centre                                  | `invalidLocation` from `GetNearbyPlaces`; no request                                                 |
| No places / every chip off / no type matches    | "No places found nearby" / "Select at least one category" / "No places of the selected types nearby" |
| Offline, network, timeout, 429, 5xx, remark     | The `errors.kind.*` message with Try again; places already shown stay; reload when back online       |
| Pins                                            | Long press adds one (max 50), saved under `map.customMarkers.v1`; corrupt entries dropped singly     |
| Directions                                      | Apple Maps (iOS) or `geo:` (Android), then Google Maps on the web; "Couldn't open a maps app"        |
| Android without a Google Maps key (not Expo Go) | MapView is never mounted (the SDK would crash): "Map couldn't load"                                  |
| `onMapReady` not within 15 s                    | "Map couldn't load" with Try again, which remounts the map                                           |
| Web                                             | "Map available in the mobile app"; the Discover Map button is hidden                                 |

### Testing

`testing/mapFixtures.ts` holds Overpass and Nominatim responses in the wire format and `stubOverpass` / `stubNominatim`. `FakeLocationService` is the default `mapLocationService` in `createTestDependencies` (permission starts `undetermined`). `jest.setup.ts` mocks react-native-maps with plain Views that keep their props, so tests fire `longPress`, `mapReady` and marker presses directly. The throttle and services are tested with fake timers; the screen through `renderWithProviders` with a `ManualClock`, so tests move past the request spacing explicitly.

`jest.afterEnv.ts` installs `testing/syncSafeAct.ts`: React Native Testing Library 14 runs every `act()` asynchronously, so a `fireEvent` or `unmount` that isn't awaited overlaps the next `act()` and React stops flushing for the rest of the file. Synchronous callbacks now use React's synchronous `act()` (the RNTL 13 behaviour). It also clears recorded mock calls after each test, because preset mocks such as `Linking.openURL` are reused by `jest.spyOn` and Jest 30's `restoreAllMocks` keeps their calls.

## 14. Trip management

`features/trips/` is the traveller's own data: create, edit, cancel, restore and delete trips, all on the device in SQLite and kept separately for each signed-in account. No operation uses the network or a backend.

### Layers

```
presentation  TripsScreen (My Trips) · TripListScreen (Upcoming, Completed) · TripScreen (details) · Create/EditTripScreen
              DateRangeSheet · DestinationSheet · CurrencySheet · ConfirmSheet · useTrips · useTrip · useTripForm · useToday
              tripsSlice (mirror of the table, one change at a time) · selectors (status as of today)
domain        Trip / StoredTrip / TripInput · localDate · tripStatus · tripValidation · money
              TripRepository · TripOwnerProvider · TripCoverStore · ImagePickerService
              GetTrips · GetTrip · CreateTrip · UpdateTrip · DeleteTrip · SetTripCancelled · SetTripCover · PickCoverImage
data          LocalTripRepository (SqlDatabase) · SessionTripOwnerProvider · tripMigrations
              FileSystemTripCoverStore · ExpoImagePickerService
core          SqlDatabase · SqliteDatabase · migrate · expoSqliteDriver
```

### Database

`core/database` owns one app database, `wanderly.db`. `SqliteDatabase` opens it on the first statement, runs every statement and transaction one at a time, and does not cache a failed open. Migrations are forward-only, numbered 1, 2, 3… across the whole app (`bootstrap/databaseMigrations.ts`) and tracked in `PRAGMA user_version`. Each runs in a transaction with its version bump. A database from a newer app version is refused and left untouched. To change the schema, append a migration; never edit a shipped one.

### Rules

| Topic        | Rule                                                                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates        | `YYYY-MM-DD` calendar dates, so a trip doesn't move when the time zone changes. Both the first and last day belong to the trip.                                                                                                                                  |
| Status       | Not stored. `cancelled` if `cancelledAt` is set; otherwise `upcoming` before the start, `ongoing` through the last day, then `completed`. Re-derived for today in selectors, so trips move at midnight.                                                          |
| Overlaps     | Trips that aren't cancelled can't overlap: `a.start < b.end && b.start < a.end`. One trip may start the day another ends. Saving or restoring into taken dates is refused and names the other trip.                                                              |
| Budget       | Required, positive, at most 10,000,000 in major units and the currency's decimals. Stored as integer minor units. Thousands separators are rejected, not guessed.                                                                                                |
| Required     | Title (max 80), destination, both dates (end not before start, max 366 days), budget, currency. Description and cover are optional.                                                                                                                              |
| Destination  | Discover search when online. Offline: recently viewed and curated places, or any typed name (`custom:` id, which has no destination page).                                                                                                                       |
| Cover photo  | Copied to `documents/trip-covers` when the trip is saved. The database keeps the relative path, because the absolute one changes on iOS updates. Not offered on web.                                                                                             |
| Unsaved form | Leaving with changes asks first.                                                                                                                                                                                                                                 |
| Set as cover | `SetTripCover` (a gallery photo's Set as cover) copies the image in through `TripCoverStore`, saves only the cover, and deletes the old cover file after the save. It skips form validation and the overlap check, and waits for other trip saves (`notSaving`). |

### Accounts

Each row has an `owner_id`, the signed-in user's id, and every repository method takes the owner and filters on it. Another account's trip behaves as if it didn't exist, and overlaps are only checked within one account. Use cases read the owner once from `TripOwnerProvider` (backed by `SessionManager`) and return `unauthorized` when nobody is signed in.

Signing out keeps the rows, so the traveller gets their trips back on signing in again. `tripsSlice` drops its copy on sign-out, session expiry and sign-in, and ignores results from requests started before that. The separation is enforced by the app; the database file itself isn't encrypted.

### Web

expo-sqlite on web needs `.wasm` support and `SharedArrayBuffer`. `metro.config.js` provides both in development. A production web host must send `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin`; without them trips show the storage error.

### Testing

`createTestDependencies` gives each container its own in-memory SQLite, so repositories, migrations, constraints and rollbacks run against real SQL. `testing/tripFixtures.ts` has `storedTrip`, `tripInput`, `seededTripDatabase`, `FakeTripOwnerProvider` (signed in as `TRIP_OWNER` by default), `FakeTripCoverStore`, `FakeImagePickerService` and `TRIPS_NOW` (midday UTC, so the date is the same in nearly every zone). `tripFlows.test.tsx` drives the real routes with `renderRouter`.

## 15. Itinerary

`features/itinerary/` is a day-by-day plan for each trip: activities with a category, optional times, place, notes and estimated cost, which can be reordered by drag and drop and ticked off. Like trips, everything lives in SQLite on the device, per account, and works offline. The only network call is the optional place search in the form.

### Layers

```
presentation  ItineraryOverviewScreen · DailyItineraryScreen · NewActivityScreen / EditActivityScreen · ActivityDetailsScreen
              ReorderableActivityList (Gesture Handler + Reanimated) · ActivityRow · CategoryPicker · TimeSheet
              TripDaySheet · LocationSheet · ProgressSummary · ItineraryEntryCard (on TripScreen) · reorder · format
              useItinerary · useItineraryDay · useActivity · useActivityForm
              itinerarySlice (mirror per trip, one change at a time) · selectors (day, progress, costs, conflicts)
domain        Activity / ActivityInput / ActivityDraft · localTime · timeConflicts · itinerary · activityValidation
              ActivityRepository · GetItinerary · GetActivity · CreateActivity · UpdateActivity · DeleteActivity
              SetActivityCompleted · ReorderActivities
data          LocalActivityRepository (SqlDatabase) · itineraryMigrations (version 2)
```

It reuses the trips domain (`LocalDate`, `money`, `TripRepository`, `TripOwnerProvider`), the map's `checkCoordinates`, `searchPlaces`, location use cases and `buildDirectionsUrls`, and the trips `ConfirmSheet`, `PickerField` and `CurrencySheet`.

### Database

Migration 2 creates `activities`: `owner_id`, `trip_id REFERENCES trips(id) ON DELETE CASCADE`, `date` (`YYYY-MM-DD`), `start_time`/`end_time` (`HH:mm`, nullable), `latitude`/`longitude` (both or neither), `estimated_cost_minor` (integer minor units, nullable), `currency`, `sort_order` and `is_completed`, with `CHECK`s that mirror validation (title not empty, known category, end after start, cost not negative, three-letter currency). `idx_activities_owner_trip_date` covers the list query and `idx_activities_trip` the cascade. `SqliteDatabase` turns foreign keys on for each connection; a repository test proves that deleting a trip deletes its activities.

Positions are 0..n-1 per day. Insert, update (including a move to another day), delete and reorder renumber the affected days inside one transaction, so a failed write never leaves a day half renumbered. `reorder` refuses with `notFound`, changing nothing, unless the ids are exactly that day's activities.

### Rules

| Topic        | Rule                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Times        | Optional `HH:mm` wall-clock times at the destination, with no time zone, so nothing moves when the device's zone changes. An end time needs a start time and must be later the same day.      |
| Day          | Must be one of the trip's days. The form only offers trip days.                                                                                                                               |
| Duration     | End minus start, only when both are set. Shown as `1 h 30 min`.                                                                                                                               |
| Conflicts    | Two timed activities on the same day overlap when `a.start < b.end && b.start < a.end`; back-to-back ones don't. Overlaps are saved, but flagged on the timeline, overview, details and form. |
| Duplicates   | Refused: same trip and day, same title (trimmed, any case) and same start time (two untimed ones count as the same). The error names the existing activity.                                   |
| Order        | `sortOrder` is the display order. A new activity, or one whose day or start time changes, goes after the last one starting at or before it; untimed ones go last. Dragging sets any order.    |
| Cost         | Optional, positive, at most 1,000,000 in major units and the currency's decimals; defaults to the trip's currency. Totals are per currency, never converted. A free activity leaves it empty. |
| Location     | Free-text address (offline), current position (GPS works offline), or place search (online only). Coordinates go through `checkCoordinates`.                                                  |
| Limits       | Title 80, description and notes 2000, address 200 characters; 50 activities per day, which keeps the fixed-height drag list practical.                                                        |
| Unsaved form | Leaving with changes asks first.                                                                                                                                                              |

### Edge cases

| Case                          | Behaviour                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trip dates edited             | Activities now outside the trip are kept and listed under "Outside trip dates" on the overview. They can be opened, completed and deleted; saving an edit requires a trip day.   |
| Trip deleted                  | SQLite cascades; `itinerarySlice` drops the trip's activities on `deleteTrip.fulfilled`. Itinerary screens show "Trip not found", and a create for a deleted trip is `notFound`. |
| Activity deleted or not owned | Details and edit show "Activity not found" with a way back to the itinerary. Another account's activity behaves as missing.                                                      |
| Reorder save fails            | The day returns to the previous order and shows the storage error.                                                                                                               |
| Double tap on save            | The thunk `condition` allows one change at a time, so it saves once.                                                                                                             |
| Offline                       | Everything works; only "Search places" is disabled, with "Search needs a connection".                                                                                            |
| Sign-out, expiry, sign-in     | `itinerarySlice` resets and ignores results from requests started before.                                                                                                        |

### Drag and drop

`ReorderableActivityList` renders rows of a fixed height (`ACTIVITY_ROW_HEIGHT`). Each row's handle has a `Gesture.Pan().activateAfterLongPress(250)`; Reanimated shared values move the dragged row and shift the others on the UI thread, and the drop calls `onReorder(from, to)` once. The pure helpers `dropIndexFor` and `moveItem` in `presentation/reorder.ts` do the arithmetic. Every row also has "Move up" and "Move down" accessibility actions that call the same `onReorder`, so screen reader users can reorder too. The list has its own `GestureHandlerRootView`, and the daily screen stops scrolling while a drag is active. The screen shows the new order at once and puts the old one back if saving fails.

### Testing

`testing/itineraryFixtures.ts` has `activity`, `activityInput`, `ITINERARY_TRIP` and `seededItineraryDatabase` (trips and activities in real in-memory SQLite). Domain functions, the repository (cascade, rollback, owner separation, corrupt rows, `CHECK`s), use cases and the slice have unit tests. `ReorderableActivityList.test.tsx` drives the drag with Gesture Handler's `fireGestureHandler`, and `itineraryFlows.test.tsx` covers the screens with `renderRouter`. `jest.setup.ts` loads Gesture Handler's Jest setup and mocks Worklets and Reanimated; Reanimated uses `testing/reanimatedMock.ts`, because the library's own mock imports its real entry point, which throws under jest-expo's native platform.

## 16. Favorites and saved places

`features/favorites/` lets a traveller save destinations, countries and map places (attractions, restaurants, landmarks), and sort them into collections. Like trips, everything lives in SQLite on the device, per account, and works offline. The Saved Places drawer entry (`/saved`) shows it.

### Layers

```
presentation  FavoritesScreen (/saved) · CollectionDetailsScreen (/saved/collections/[collectionId])
              SavedPlaceRow · CollectionCard · CollectionNameSheet · CollectionPickerSheet · SavedPlaceActionsSheet
              FavoriteButton (DestinationScreen header, map PlaceSheet) · format
              useFavorites · useFavoritesLoad · useFavoriteToggle · useCollection
              favoritesSlice (mirror of SQLite, one change at a time) · selectors (by target, filtered, counts, collection)
domain        Favorite / FavoriteTarget · favoriteTargetFromDestination · favoriteTargetFromPlace · Collection
              collectionValidation · favoriteSearch · FavoritesRepository · GetFavorites · SaveFavorite · RemoveFavorite
              CreateCollection · RenameCollection · DeleteCollection · SetFavoriteCollections · RemoveFromCollection
data          LocalFavoritesRepository (SqlDatabase) · favoritesMigrations (version 3)
```

It reuses the trips `TripOwnerProvider` and `ConfirmSheet`, discover's `normalizeText`/`normalizeQuery`, `DestinationImage` and `Section`, and the map's `buildDirectionsUrls`.

### Database

Migration 3 creates three tables, all keyed by `owner_id`:

- `favorites`: a snapshot of what was saved (name, subtitle, image URL, flag, coordinates, address, `saved_at`), so the list renders offline. `UNIQUE (owner_id, target_id)` keeps one row per saved destination or place, and `CHECK`s mirror the domain (known category, name not empty, both coordinates or neither).
- `collections`: `PRIMARY KEY (owner_id, id)`, so every account has the four default collections under the same fixed ids. A `CHECK` requires a name for custom collections and a `default_key` for default ones.
- `collection_items`: `PRIMARY KEY (owner_id, collection_id, favorite_id)`, so a place is in a collection at most once. It cascades from `collections (owner_id, id)` and from `favorites (id)`: deleting either side deletes the memberships, never the other side.

Inserting a favorite uses `ON CONFLICT (owner_id, target_id) DO NOTHING` and then reads the stored row, so two saves of the same target (a double tap, two screens) return the same favorite. `setMemberships` checks the favorite and every collection inside one transaction and changes nothing (`notFound`) if one is missing.

### Rules

| Topic               | Rule                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity            | A target is the destination route id (`country-pt`, a curated slug, `place-…`) or the map place id (`osm:node/…`). The same place reached by two ids counts twice.                               |
| Categories          | Countries → `country`; cities and places → `destination`; attractions, museums and parks → `attraction`; restaurants → `restaurant`; landmarks → `landmark`. Hotels can't be saved.              |
| Default collections | Want to Visit, Must Visit, Favorite Restaurants and Favorite Attractions, created with `INSERT OR IGNORE` on the first load and named from i18n. They can't be renamed or deleted (`forbidden`). |
| Custom collections  | Name trimmed, 1 to 40 characters, unique among the account's custom collections ignoring case. At most 50 per account.                                                                           |
| Membership          | Many to many. Saving a place adds it to no collection; the picker sets exactly the ticked ones. Removing a place from a collection keeps it saved.                                               |
| Search and filter   | Name, subtitle and address, ignoring case and accents, combined with a category chip. Newest first.                                                                                              |
| Removing            | Unsaving from a detail screen is immediate. Removing from Saved Places, and deleting a collection, ask first through `ConfirmSheet`.                                                             |

### Edge cases

| Case                      | Behaviour                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Double tap on Save        | The thunk `condition` allows one change at a time, and the database keeps one row per target.                                     |
| Collection deleted        | Its memberships go with it; its places stay saved. A link to it shows "Collection not found".                                     |
| Storage failure on load   | `AppErrorView` with `errorKind: 'storage'` and Try again.                                                                         |
| Corrupt row               | Skipped with a warning, together with memberships that point at it.                                                               |
| Offline                   | Everything works. Opening a saved destination needs a connection, as the destination screen always has.                           |
| Sign-out, expiry, sign-in | `favoritesSlice` resets and ignores results from requests started before. Rows stay in SQLite for when the account signs back in. |

### Testing

`testing/favoritesFixtures.ts` has `favoriteTarget`, `favorite`, `restaurantFavorite`, `customCollection` and `seededFavoritesDatabase` (real in-memory SQLite). Domain functions, the repository (constraints, duplicates, cascades, owner separation, corrupt rows, upgrade from version 2, persistence across connections), use cases and the slice have unit tests. `favoritesFlows.test.tsx` covers the screens with `renderRouter`, and `saveFromDetails.test.tsx` covers Save on the destination screen and the map sheet.

## 17. Budget and expenses

`features/budget/` tracks a trip's spending against its budget. The trip's own `budget` and `currency` (integer minor units in `trips`) are the budget and the base currency, so there is no second budget table: the Budget sheet saves them through the trips `updateTrip` thunk. Expenses live in SQLite per account and every operation works offline. The Budget tab (`/budget`) shows the ongoing trip, then the next upcoming one, then the most recently ended one (cancelled trips last), with a switcher; `TripScreen` links to each trip's budget through `BudgetEntryCard`.

### Layers

```
presentation  BudgetScreen (/budget) · BudgetOverviewScreen (/budget/[tripId]) · ExpenseHistoryScreen (…/expenses)
              ExpenseFormScreen (…/expenses/new, …/[expenseId]/edit) · ExpenseDetailsScreen (…/[expenseId])
              SpendingBreakdownScreen (…/breakdown) · BudgetSummaryCard · SpendingProgressBar
              CategoryBreakdownChart · DailySpendingChart (plain Views, no chart library) · ExpenseRow
              ExpenseCategoryPicker · PaymentMethodPicker · ExchangeRateNote · UnconvertedBanner
              BudgetSheet · TripSwitcherSheet · ExpenseDateSheet · BudgetEntryCard · format
              useTripBudget · useBudgetTrip · useExpense · useExpenseForm
              budgetSlice (mirror of SQLite, one change at a time) · selectors (summary, default trip)
domain        Expense · ExchangeRateInfo · expenseValidation · budgetCalculations (convertMinor, summarizeBudget)
              ExpenseRepository · ExchangeRateRepository · ExpenseConverter
              GetTripBudget · GetExpense · CreateExpense · UpdateExpense · DeleteExpense · PreviewExchangeRate
data          LocalExpenseRepository · LocalExchangeRateCache (SqlDatabase) · budgetMigrations (version 4)
              FrankfurterExchangeRateRepository (HttpClient) · CachedExchangeRateRepository (decorator)
```

### Money

Every amount is an integer in its currency's minor units (`currencyFractionDigits`). Totals add integers only. Rates are decimal strings (`'1.0805'`) and `convertMinor` converts with BigInt, rounding half up, so no floating-point value ever reaches a total. `summarizeBudget` counts an expense only when it has a base amount in the trip's current currency; the rest are reported as `unconvertedCount` and never mixed into the totals. Percent spent is in basis points and `null` for a zero budget; category shares use the largest remainder so they add up to 100.

### Database

Migration 4 creates `expenses` (owner-scoped, cascading from `trips`, `CHECK`s for a positive amount, known category, payment method and rate source, and base amount, rate, rate date and rate source all set or all `NULL`) and `exchange_rates` (`PRIMARY KEY (base, quote, requested_date)`, shared by every account because rates are public data; `requested_date` is a date or `latest`). Conversion updates for many expenses run in one transaction.

### Exchange rates

Frankfurter (`https://api.frankfurter.dev/v1`, no key): `/{date}?base=FROM&symbols=TO` for past dates, `/latest` for today and later, `/currencies` for the supported list. The rate date stored and shown is the one the API returns (the previous working day on weekends and holidays).

| Step          | Rule                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same currency | Rate `1`, source `identity`, no request.                                                                                                                                                                                                                       |
| Cache         | A historical rate is kept for good once it is for the date itself or the date is 2+ days back (published in every timezone); otherwise it, like `latest`, is reused for 6 hours. The currency list is kept 7 days in `KeyValueStore` (`budget.currencies.v1`). |
| API           | On a miss, the answer is saved with its date. Failures are never cached.                                                                                                                                                                                       |
| Fallback      | If the API fails (offline, timeout, 5xx, 429, missing date), the nearest earlier cached rate for the pair is used, source `fallback`, shown as approximate with its own date.                                                                                  |
| Manual        | With no rate at all, the form offers a rate field; a typed rate is used only then (source `manual`). It must be above 0 and at most 1,000,000, so a converted amount always stays exact.                                                                       |
| Unconverted   | Otherwise the expense is saved with no base amount, shown as "Not converted yet" and left out of the totals. The next load of a screen with totals (or Try again on the banner) converts it.                                                                   |

Every screen first reads what is stored through `loadTripExpenses` (`GetTripExpenses`), which never calls the API. Only screens that show totals (overview, breakdown, the trip's budget card) then convert in the background through `retryConversions` (`GetTripBudget`), while what was read stays on screen (`loadByTrip[tripId].converted`). One conversion runs per trip at a time: `retryConversions` is skipped while a load or conversion is in flight (`requestId`), so screens showing the same trip and repeated Try again taps share it. An expense saved or deleted during a conversion discards that result and clears `requestId`, and `useTripBudget` starts a new one.

A load also replaces approximate conversions: a `fallback` rate, or, once the expense's date has passed, an API rate dated before it (the latest rate used ahead of the date). Only the stored rate decides this, never `updatedAt`, so editing a title doesn't freeze an approximate rate. A weekend expense is re-checked from the rate cache and nothing is written when the rate is the same.

### Edge cases

| Case                                                         | Behaviour                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero budget                                                  | Not allowed by the trip form (`budget_minor > 0`); the calculations still handle it (no percentage, remaining is minus the spending).        |
| Negative or zero amount, too many decimals, unknown currency | Field errors from `validateExpenseInput`; nothing is saved. Currencies are the trip form's list plus KWD.                                    |
| Exchange API unavailable or missing historical rate          | The expense still saves (fallback, manual or unconverted).                                                                                   |
| Base currency changed                                        | The trip's budget reloads; every expense whose base currency differs is converted again and saved in one transaction, or marked unconverted. |
| Double tap on Save                                           | The thunk `condition` allows one change at a time.                                                                                           |
| Deleted trip or expense, another account's expense           | "Trip not found" or "Expense not found".                                                                                                     |
| Sign-out, expiry, sign-in                                    | `budgetSlice` resets and ignores results from requests started before.                                                                       |

### Testing

`testing/budgetFixtures.ts` has `expense`, `euroExpense`, `unconvertedExpense`, `expenseInput`, `BUDGET_TRIP`, `seededBudgetDatabase` (real in-memory SQLite) and `stubFrankfurter`. The calculations, validation, repositories, rate cache, Frankfurter client (fake and real HTTP client), use cases and slice have unit tests; `budgetFlows.test.tsx` covers the screens with `renderRouter`. The financial calculations need human review before production, as for any generated code.

## 18. Profile, settings and localization

`features/preferences/` owns what the traveller sets once for the whole app (theme, language, default currency, notification choices) and the Settings, Privacy and About screens. `features/profile/` owns the local profile (display name, photo, home base, bio) and the travel stats. Authentication stays in `features/auth/`. The account details (email, username, account photo) are read-only here, and Sign out reuses `useSignOut`.

### Layers

```
presentation  SettingsScreen · PrivacyScreen · AboutScreen · CurrencyPreferenceSheet · SettingSwitchRow
              usePreferenceSettings · useLocationPermissionSetting · applyNativeLayoutDirection
              ProfileScreen · EditProfileScreen · useLocalProfile · useProfileIdentity · useTravelStats · useProfileForm
              preferencesSlice (+ layoutRestartRequired) · profileSlice (one save at a time, reset on account change)
domain        Preferences (theme, language, currency, notifications) · resolvePreferences (resolveCurrency)
              LocalProfile · profileValidation · travelStats · LocalProfileRepository · ProfilePhotoStore
              GetLocalProfile · SaveLocalProfile · PickProfilePhoto
data          StoragePreferencesRepository (preferences.v1) · StorageLocalProfileRepository (profile.local.v1.<ownerId>)
              FileSystemProfilePhotoStore (profile-photos/) · UnsupportedProfilePhotoStore (web)
```

### Preferences

`preferences.v1` keeps its key. `currency` (`'system'` or a `TRIP_CURRENCIES` code) and `notifications` (`tripReminders` and `budgetAlerts`, both off by default) were added with a zod `.catch` on each field. Preferences stored before this feature load with the new defaults, and one corrupt field never discards the others. The currency preference only sets the preselected currency on the New Trip form (`useTripForm`, through `resolveCurrency`). `'system'` uses the device region's currency when trips offer it, otherwise USD. Existing trips and budgets are never converted. Wanderly doesn't send notifications yet, so the switches only save a choice, and Settings says so.

The Location section shows the OS permission (`checkMapLocationPermission`). It offers Allow while the permission can still be requested and Open Settings once it is granted (to revoke it) or blocked, and it checks the permission again whenever the app returns to the foreground.

### Local profile

Each account's profile is one JSON document in `KeyValueStore`, the same approach as preferences and custom markers, so no SQLite migration is needed. The owner comes from the trips `TripOwnerProvider`, and with nobody signed in the use cases return `unauthorized`. The display name is trimmed and must be 1–60 characters, or `null` to follow the account name. The form starts with the account name, and if no display name was saved and the name is left unchanged, it saves `null`, so a later change to the account name still shows. The home base can be at most 80 characters and the bio at most 160. Lengths count characters (code points), not bytes. A picked photo is a temporary file. It is copied to `documents/profile-photos/` only when the profile is saved, and the copy is deleted if the save fails. The replaced photo is deleted only after a successful save, and an unchanged photo is kept as stored. Both photo stores build on `core/storage/DocumentImageStore`. The picker asks for a square crop (`pickImage({ aspect: [1, 1] })`), while trip covers keep the 16:9 default. `useProfileIdentity` shows the local name and photo in place of the account's on Profile and in the drawer. If the local profile can't load, Profile falls back to the account name and photo, says so, and offers Try again.

Stats: Total trips counts every trip except cancelled ones, Completed trips counts trips whose status is `completed` as of today, and Saved places counts every favorite. Each source loads independently. A stat shows a placeholder while its source loads and `—` if the load failed.

### Right-to-left layout (Urdu)

Direction is handled in two parts:

1. **Content flips immediately.** `PreferencesGate` wraps the app in `LayoutDirectionProvider` and a root view with a Yoga `direction`. `Screen` and `AppBottomSheet` set `direction` again, because native screen containers and `Modal` don't reliably inherit it. `AppText` adds `writingDirection: 'rtl'` and maps logical `align="start"`/`"end"` to the physical side. `AppInput` aligns text to the right, and `AppIcon` mirrors the icons in `DIRECTIONAL_ICONS` (chevrons, back, sign-out, undo). On iOS the SF Symbols in `IOS_SELF_MIRRORING_ICONS` flip themselves: on Fabric a view's semantic direction follows its Yoga layout direction (the JS `direction`), so AppIcon never mirrors them there. This still needs a check on a device between switching language and restarting. The drawer opens from the right.
2. **Native chrome changes after a restart.** `applyNativeLayoutDirection` calls `I18nManager.allowRTL`/`forceRTL`. React Native reads these flags at launch, and they control stack headers, tab order and the back gesture. The app has no `expo-updates`, so it can't reload itself. When `I18nManager.isRTL` doesn't match the language, Settings notes that headers, tabs and the back gesture will match the language the next time the app starts. The wording doesn't assume the traveller switched language, since an RTL device with English selected also starts mismatched. `allowRTL(false)` also keeps English and Spanish left to right on a device set to an RTL locale. `app.json` sets `supportsRTL` for expo-localization, which takes effect only in a new native build.

Urdu typography comes from `createTypography({ rtlScript: true })`. It drops letter spacing (which breaks the joins between letters) and case transforms, and raises line heights by about 1.35×, rounded to the 4pt grid, so Nastaliq glyphs don't clip. Inter has no Arabic-script glyphs, so Urdu text falls back to the system font. Hermes may format numbers and dates for `ur` with Latin digits; that is acceptable.

### Edge cases

| Case                                      | Behaviour                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A preference can't be saved               | The change still applies for this session, and Settings shows the dismissible save error.        |
| The profile can't be saved                | A storage error appears under the form, and the typed text stays.                                |
| Leaving Edit profile with unsaved changes | A sheet asks whether to keep editing or discard.                                                 |
| Another account on the same device        | It sees its own (empty) profile. `profileSlice` resets on sign-out, expiry and sign-in.          |
| Web                                       | No photo picker (`UnsupportedProfilePhotoStore`), and `applyNativeLayoutDirection` does nothing. |
| Switching to or from Urdu                 | Content flips at once. The restart notice shows until the native direction matches.              |

### Testing

`testing/profileFixtures.ts` provides `localProfile`, `localProfileInput` and `FakeProfilePhotoStore`. `testing/layoutDirection.ts` finds the `direction` that applies to an element. Unless `initialLanguage` is given, `renderWithProviders` starts i18n in the device language, as the app does. `locales.test.ts` checks that `es` and `ur` have every English key and placeholder. The Urdu translations are machine-written and need review by a native speaker before release.

## 19. Photos

`features/photos/` lets the traveller attach photos to a trip or to one of its itinerary activities, from an in-app camera (expo-camera) or the photo library (expo-image-picker, up to 10 at once). Every image is checked, resized and re-encoded (expo-image-manipulator), copied into app storage and referenced from SQLite. Nothing is uploaded and no backend is involved. `TripScreen` links to the trip gallery through `PhotosEntryCard`, and `ActivityDetailsScreen` shows the activity's latest photos in `ActivityPhotosSection`.

### Layers

```
presentation  PhotoGalleryScreen (/trips/[tripId]/photos and …/itinerary/[itemId]/photos) · CameraScreen (…/photos/camera)
              PhotoPreviewScreen (…/photos/preview) · PhotoViewerScreen (…/photos/[photoId], optional ?activityId)
              CameraCanvas (the only expo-camera import) · PhotoGrid · PhotoTile · AddPhotoMenu · MediaPermissionView
              PhotosEntryCard · ActivityPhotosSection · PhotosStateView · format
              useMediaPermission · usePhotoGallery (useTripPhotos, useActivityPhotos, usePhoto) · useAddPhotos
              photosSlice (metadata mirror, one change at a time, pending selection) · selectors
domain        Photo · PickedImage · imageValidation (validatePickedImage, fitWithin, parseExifDateTime, limits)
              PhotoRepository · PhotoFileStore · ImageProcessor · MediaPermissionService · PhotoLibraryPicker
              GetTripPhotos · GetActivityPhotos · AttachPhotos · DeletePhoto · PrunePhotoFiles
              GetMediaPermission · RequestMediaPermission · PickLibraryImages
data          LocalPhotoRepository (SqlDatabase) · photosMigrations (version 5)
              FileSystemPhotoStore (trip-photos/) · UnsupportedPhotoStore (web) · ExpoImageProcessor
              ExpoMediaPermissionService · ExpoPhotoLibraryPicker
```

### Database and files

Migration 5 creates `photos`: owner-scoped, `trip_id` cascading from `trips`, `activity_id` (`NULL` for a photo of the trip itself) cascading from `activities`, a unique relative `reference`, positive `width`/`height`/`file_size`, `mime_type = 'image/jpeg'` and `source IN ('camera', 'library')`. Inserts check that the trip, and the activity within that trip, belong to the same account. Rows hold metadata only; the images are files in `documents/trip-photos/`, written through `core/storage/DocumentImageStore` like trip covers and profile photos, so references stay relative and can't point outside the folder. Rows with corrupt metadata are skipped with a warning.

| Step     | Rule                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate | JPEG, PNG, WebP, HEIC or HEIF by MIME type, or by the jpg/jpeg/png/webp/heic/heif extension when the type is missing. At most 50 MB and positive whole-pixel dimensions. Each rejected image is named in Preview.          |
| Limits   | 10 images per library selection, 200 photos per trip (the rest are rejected as `limitReached`).                                                                                                                            |
| Process  | One image at a time: resized to a 2048 px longest edge (never enlarged) and saved as JPEG at quality 0.8, then copied into `trip-photos/` and the temporary output deleted. `taken_at` comes from EXIF `DateTimeOriginal`. |
| Save     | Every row of one attach is inserted in one transaction. If processing, copying or the insert fails, every copied file is removed and nothing is saved.                                                                     |
| Delete   | The row first, then the file (best effort). A trip or activity delete cascades the rows; `PrunePhotoFiles` (once per session) deletes files no row of any account references once they are over an hour old.               |
| Missing  | A row whose file is gone or whose reference is invalid shows "Photo unavailable" in the grid and viewer, and can still be deleted.                                                                                         |
| Redux    | `photosSlice` keeps metadata and relative references only. Picked or captured images wait in `pending` as temporary URIs until Attach; they aren't put in route params, so a link can't inject a file URI.                 |

### Permissions

| State          | Camera                                                 | Library                                       |
| -------------- | ------------------------------------------------------ | --------------------------------------------- |
| `undetermined` | Explanation with Allow; the OS is asked only on Allow. | Same.                                         |
| `denied`       | Explanation with Allow again (the OS can still ask).   | Same.                                         |
| `blocked`      | "Access is turned off" with Open Settings.             | Same.                                         |
| `limited`      | —                                                      | iOS selected-photos access counts as allowed. |

`useMediaPermission` reads the permission again when the app returns to the foreground and sends one request however often Allow is tapped. The camera screen gates itself, so a direct link can't open the camera without permission, and `PickLibraryImages` refuses to open the picker without access. The Add photo choices show in place rather than in a modal sheet, because on iOS the system picker can't be presented while a modal is still dismissing.

### Edge cases

| Case                                        | Behaviour                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Double tap on Attach                        | The thunk `condition` allows one change at a time, and Preview ignores a second tap.                          |
| Shutter tapped while the camera starts      | The picture is taken as soon as the camera is ready.                                                          |
| Camera fails to start or no camera          | "Camera isn't available" with Back.                                                                           |
| Preview opened without a selection          | "Nothing to preview" with Back.                                                                               |
| Delete fails                                | The confirm sheet closes, the storage error shows and the photo stays.                                        |
| Set as cover, then delete the gallery photo | The cover is a separate copy in `trip-covers/`, so it stays.                                                  |
| Deleted trip or activity, another account's | "Trip not found", "Activity not found" or "Photo not found".                                                  |
| Web                                         | `UnsupportedPhotoStore`: the galleries say photos are available in the mobile app and offer no Add or camera. |
| Sign-out, expiry, sign-in                   | `photosSlice` resets and ignores results from requests started before.                                        |

`app.json` configures the expo-camera plugin (camera usage text, no microphone, no barcode scanner) and gives expo-image-picker the same camera text, so the two plugins agree on `NSCameraUsageDescription`. Both packages need a new development build; Expo Go builds without them crash on the camera screen.

### Testing

`testing/photoFixtures.ts` has `photo`, `pickedImage`, `PHOTOS_TRIP`, `PHOTO_ACTIVITY`, `seededPhotoDatabase` (real in-memory SQLite), `FakePhotoFileStore` (`missing`, `failImportAt`), `FakeImageProcessor`, `FakeMediaPermissionService` and `FakePhotoLibraryPicker`. `jest.setup.ts` replaces expo-camera's `CameraView` with a View whose ref exposes `mockCamera.takePictureAsync`. Validation, use cases, repository, file store, permission mapping, picker, slice and `useMediaPermission` have unit tests; `photoFlows.test.tsx` drives the routes with `renderRouter`. The native camera, picker and file handling need on-device testing before release.

## 20. Offline-first

Wanderly is local-first: the traveller's own data lives in SQLite on the device and never needs the network, and public data (destinations, countries, weather, rates) is fetched from public APIs, kept on the device, and refreshed when it is out of date and the device is online. **There is no backend, so nothing synchronises between devices.** The pending-change outbox and sync engine below are a tested abstraction ready for a future cloud backend; today they only track what has changed, and the app says so.

### Four kinds of data

| Kind                         | Where                                                                                                                                                        | Examples                                                     | Offline behaviour                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Remote API data**          | Remote repositories over `HttpClient` (`RestCountriesRepository`, `WikipediaPlaceContentRepository`, Open-Meteo, Frankfurter, OSM)                           | Country facts, descriptions, forecasts, rates, nearby places | Fails fast with `offline` (interceptor), never thrown                                  |
| **Cached data**              | `core/cache`: `MemoryCache` (per session) and `PersistentCache` over `cache_entries` (SQLite), plus feature caches (`StorageWeatherCache`, `exchange_rates`) | Destinations viewed, the country catalogue, forecasts        | Shown as a saved copy, labelled with its age; prunable and clearable at any time       |
| **Local persistent data**    | Feature tables in `wanderly.db` (trips, activities, expenses, favorites, collections, photos)                                                                | Everything the traveller creates                             | Every operation works offline; the source of truth                                     |
| **Pending local operations** | `core/sync`: `sync_outbox` (SQLite), written by repositories in the same transaction                                                                         | "trip-1 changed", "expense-3 deleted"                        | Tracked; would be pushed by `SyncEngine` through a `SyncGateway` once a backend exists |

Screens never see which source answered: they call use cases, use cases call repository interfaces, and the composition root decides what sits behind them (Repository + Decorator).

### Connectivity

`NetInfoConnectivityService` adapts `@react-native-community/netinfo` (bundled in Expo Go, no config plugin) to the `ConnectivityService` port. It only re-emits real changes and ignores an initial reading older than a live event. As before, only `isConnected === false` counts as offline (§ 4). NetInfo uses the platform's own reachability on iOS and Android; the app doesn't rely on `isInternetReachable`.

| Consumer                                       | Reacts to                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| HTTP `offlineGuard`                            | Fails requests with `offline` before they leave                                                                 |
| `ConnectivityIndicator`                        | Header pill on every tab root: "Offline", then "Back online" for 3 s; opens Offline and data                    |
| `connectRtkQueryToConnectivity`                | Dispatches RTK Query's `onOnline`/`onOffline` (and `onFocus`/`onFocusLost` from `AppState`) on real transitions |
| `PersistentCache`                              | Ends `Retry-After` waits when the device comes back online                                                      |
| `SyncEngine`                                   | Syncs when the device comes back online                                                                         |
| `useWeather`, `useExploreMap`, `useTripBudget` | Refetch the forecast, reload places, convert expenses saved offline                                             |

`useOfflineLifecycle` (mounted by the signed-in layout) wires RTK Query and starts the sync engine; signing out unmounts it.

### Destination information offline

```
Memory (MemoryCache: TTL, coalescing)  →  Persistent (PersistentCache over SQLite)  →  Remote (HTTP)
CachedCountryRepository                   PersistentCountryRepository                  RestCountriesRepository
CachedPlaceContentRepository              PersistentPlaceContentRepository             WikipediaPlaceContentRepository
```

`PersistentCache.get(key, load)`:

1. A stored copy younger than `freshForMs` is returned without a request.
2. Otherwise `load()` runs; a success is stored and returned.
3. If it fails with `offline`, `network`, `timeout`, `rateLimited` or `server`, a stored copy younger than `maxStaleMs` is returned with `refreshError`, and the entity carries `savedAt`.
4. `notFound` deletes the stored copy.

| Data                                         | Fresh for    | Shown up to | Kept |
| -------------------------------------------- | ------------ | ----------- | ---- |
| Country catalogue and country details        | 1 day        | 30 days     | 300  |
| Wikipedia summaries (including "no article") | 3 days       | 30 days     | 400  |
| Title search                                 | never stored |             |      |

A saved copy shown for a failed refresh is not kept by the memory cache (`shouldCache`), so the next attempt after reconnecting really refreshes. `GetDestinationDetails` sets `DestinationDetails.savedAt` to the oldest saved part, and `SavedCopyNotice` says "You're offline. Showing information saved 2 days ago." (or "We couldn't refresh…" when online). `discoverApi` has `refetchOnReconnect`, so a destination, search or home section on screen refetches when the connection returns: fresh data comes from the caches without a request, saved copies and failures are refreshed.

Stored data is untrusted: each record is validated with a zod schema (`countryCodec`, `catalogueCodec`, `summaryCodec`; one malformed country is dropped, not the catalogue), carries a format `version` (another version is discarded), and is ignored if its timestamp is in the future. If the store itself fails (database unavailable, failed migration), the cache logs and works network-only; it never fails a load the network could answer. Records are pruned by age and count every 25 writes. Settings › Offline and data shows how much is saved and can clear it (`ClearSavedData`); the traveller's own tables are untouched.

### Pending operations (transactional outbox)

Repositories take a `LocalChangeLog` and record each change **inside the transaction that makes it**: `LocalTripRepository` (create, edit, cancel, delete), `LocalActivityRepository` (create, edit, complete, reorder, delete, and every neighbour whose position moved), `LocalExpenseRepository` (create, edit, delete; not conversions, which every device derives), `LocalFavoritesRepository` (favorites, custom collections, memberships as favorite updates; default collections exist on every device). If the outbox row can't be written the whole write rolls back, so the outbox never misses or invents a change. Photos are files and are out of scope.

Only _which_ entity changed is recorded (state-based sync). `coalesce` keeps one operation per entity:

| Pending      | + create / update      | + delete                         |
| ------------ | ---------------------- | -------------------------------- |
| none         | upsert (new if create) | delete                           |
| upsert (new) | upsert (still new)     | removed: the remote never saw it |
| upsert       | upsert                 | delete                           |
| delete       | upsert (not new)       | delete                           |

A new upsert that is being pushed is not removed by a delete; the delete follows it.

| Concern                     | How                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idempotency                 | Every version of a change gets a new `idempotencyKey` (`trip:trip-1:<id>`); every retry of that version reuses it. A backend applies a key once. A change made during a push keeps its newer key; the push's acknowledgement then only clears `isNew`. |
| Retry policy                | `ExponentialSyncRetryPolicy`: 5 s, 10 s, 20 s… capped at 30 min, ±20 % jitter, at least `Retry-After`; 8 attempts; only `network`, `timeout`, `rateLimited`, `server`, `storage` are retried. Others are `failed` at once.                             |
| Duplicate triggers          | `SyncEngine.sync()` is single-flight: a trigger during a run schedules one more run, never a parallel one. `claim` (`pending` → `inFlight`) is conditional, so an operation can't be pushed twice.                                                     |
| Connection lost mid-request | An `offline`/`cancelled` result returns the operation to `pending` without counting an attempt and pauses until NetInfo reports online (or 30 s, for networks that look online but aren't).                                                            |
| App restart                 | Operations left `inFlight` are reset to `pending` at start and re-sent with the same key.                                                                                                                                                              |
| Gone entities               | An upsert whose entity no longer exists (deleted, or cascaded with its trip) is dropped; the delete is pushed instead.                                                                                                                                 |
| Failed operations           | Kept with their last error until "Try again" (`retryFailed`); never dropped silently.                                                                                                                                                                  |
| Accounts                    | Rows are per owner; the engine only handles the signed-in owner and stops mid-run if that changes.                                                                                                                                                     |

In this build `syncGateway` is `LocalOnlySyncGateway`: the engine counts pending changes (phase `localOnly`) and never pushes. Offline and data says "Wanderly doesn't have cloud accounts yet, so your data isn't copied to your other devices or backed up by Wanderly." A backend replaces one factory in `features/sync/di.ts`; `syncEntitySources` already reads each entity type's current state for a push.

### Conflict resolution (for a future backend)

Not implemented, because there is nothing to conflict with. The intended strategy:

1. **Server is the arbiter, versions detect conflicts.** Each entity gets a server `version`. A push sends the version it was based on; the server applies it only if it still matches, and answers `409` otherwise. The gateway maps `409` to a non-retryable error, so the operation is marked `failed`, not retried blindly.
2. **Resolve per entity type, by field where it is safe.**
   - Trips, activities: field-level last-writer-wins using `updatedAt`, except deletes, which win over edits (a deleted trip stays deleted). Activity order (`sortOrder`) is taken from the most recent reorder of that day as a whole, so a day is never half of each.
   - Expenses: amounts and currencies are never merged silently; a conflicting edit keeps both versions and asks the traveller. Conversions are recomputed after any merge.
   - Favorites: a set; saving is idempotent by `targetId`, memberships merge as a union unless one side removed a membership after the other added it.
3. **Pull after push.** After pushing, the client pulls changes since its last cursor and applies them in one transaction per entity type, without recording them in the outbox.
4. **Tombstones.** Deletes are kept server-side long enough for every device to pull them.

### Edge cases

| Case                             | Behaviour                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connection lost during a request | HTTP: `network`/`timeout` with retry where idempotent (§ 4); the destination falls back to its saved copy. Sync: the operation goes back to `pending`, uncounted.                                                                                                                                |
| App restarted while offline      | Trips, itineraries, expenses and favorites load from SQLite; destinations viewed before load from `cache_entries` with a saved-copy notice; the session is kept (§ 10).                                                                                                                          |
| Stale cached information         | Fresh windows per data type; a saved copy is labelled with its age and never shown after 30 days; refetched on reconnect.                                                                                                                                                                        |
| Duplicate retry operations       | One outbox row per entity, single-flight engine, conditional claim, idempotency keys.                                                                                                                                                                                                            |
| Database migration failure       | Each migration and its version commit together; a failure leaves the last good version and is retried on the next statement (§ 14). Meanwhile repositories return `storage` (screens show it with Try again), the device cache works network-only, and Offline and data shows the storage error. |
| API rate limits                  | `429` is `rateLimited`; the HTTP layer retries short `Retry-After`s; `PersistentCache` honours longer ones without requests (showing the saved copy) until they pass or the device reconnects; the country catalogue is fetched at most daily.                                                   |
| Failed refresh                   | The saved copy stays on screen with its age; Try again, a reconnect or the next visit refreshes; failures are never cached.                                                                                                                                                                      |
| Expense created offline          | Saved unconverted (§ 17); `useTripBudget` converts it when the device comes back online.                                                                                                                                                                                                         |

### Testing

`testing/offlineFixtures.ts` provides `createOfflineStorage` (real SQLite with every migration, the outbox and cache store; pass an `engine` to simulate a restart) and `FakeSyncGateway` (scripted results, records pushes and keys). Covered: the NetInfo adapter; `PersistentCache` (fresh, stale, fallback per error kind, max age, `notFound`, `Retry-After`, corrupt and old-format records, store failure, restart, pruning); the discover decorators (restart offline, memory not keeping saved copies, offline search, cached "no article"); `coalesce`, the SQLite outbox (coalescing, keys, rollback, claim, acknowledge during a push, reschedule, failed and retry, restart recovery, owners); the retry policy; the engine (local-only, push, offline wait, connection lost mid-request, captive-portal pause, backoff timer, failed and retry, single flight, restart re-send, gone entities, missing sources, signed out, unreadable database, debounce); repositories recording in the same transaction (including rollback when the outbox write fails); migrations 6 and 7 (upgrade, failure and retry); RTK Query reconnect; the indicator, Offline and data, the destination saved-copy notice after a restart offline, and conversion on reconnect.
