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

Weather appears on the destination page (`DestinationWeatherCard`, linking to `destinations/[id]/weather`) and on the trip page. Trips don't have destinations yet (feature 4), so the trip page shows the weather where the device is (`trips/[id]/weather` for the full forecast). It will switch to the trip's coordinates through the same `useWeather` hook.

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
