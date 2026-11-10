# Wanderly

A smart travel companion for iOS and Android: discover destinations, explore nearby places, check weather, plan trips and itineraries, track expenses, save favourite places, and keep it all available offline.

Built with Expo SDK 58, Expo Router, TypeScript (strict), and Redux Toolkit. There is no custom backend: data comes from public APIs and on-device storage.

## Getting started

```bash
npm install
npx expo start          # press i / a to open iOS / Android
```

| Command             | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `npm test`          | Unit and component tests (Jest + React Native Testing Library) |
| `npm run typecheck` | `tsc --noEmit`                                                 |
| `npm run lint`      | ESLint (`expo lint`), including Prettier formatting            |
| `npm run format`    | Format everything with Prettier (`format:check` to verify)     |
| `npm run check`     | Typecheck, lint, format check, and tests in one go             |
| `npx expo-doctor`   | Dependency and config health check                             |

Run `typecheck`, `lint`, and `test` before opening a PR.

Install new packages with `npx expo install <pkg>` so you get SDK-compatible versions. Libraries with native code that Expo Go doesn't include need a development build (`npx expo run:ios|android` or `eas build --profile development`).

## Architecture

Clean Architecture, organised by feature. Each feature has **domain** (entities, repository interfaces, use cases), **data** (repository implementations, DTOs, API/storage sources), and **presentation** (state, hooks, screens) layers. Dependencies point inward: presentation → domain ← data. ESLint enforces the boundaries.

**Full reference: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. It covers layers, DI, the networking stack, every design pattern and why it is used, SOLID, and testing.

```
src/
  app/            Expo Router routes only (thin; each file renders a feature screen)
  bootstrap/      Composition root (container, store, i18n), providers, start-up gate
  core/           Infrastructure with no feature knowledge:
                  di · http · network · logging · errors · events · storage · store · theme · i18n · config · utils
  features/<f>/   domain/ (incl. usecases/) · data/ · presentation/ · di.ts (the feature's DI module)
  shared/         Design-system components (`@/shared/ui`) and cross-feature hooks
  testing/        Test doubles, render helpers, executable examples
```

### Key decisions

- **Navigation: Expo Router.** In SDK 58, Expo Router includes React Navigation internally, so `@react-navigation/*` is not installed separately. Tabs use `expo-router/native-tabs` (native tab bars on iOS and Android). Each tab has its own Stack for native headers and nested screens.
- **Dependency injection.** A typed, lazy container (`core/di/createContainer.ts`). Each feature contributes factories from its `di.ts`, and `bootstrap/createAppContainer.ts` merges them. Services are container-scoped singletons. Thunks get them through `extra`, hooks through `useDependencies()`, and tests swap them with `createTestDependencies({ ...overrides })`.
- **Use cases.** Business rules live in domain use cases (`UseCase<I, O>`). Redux thunks are thin adapters that call them.
- **Networking.** `HttpClient` is a facade over axios, with interceptors (offline guard, language, auth), timeouts, cancellation (`AbortSignal`), retries with backoff, and zod validation. Every call returns `Result<ApiResponse<T>, ApiError>` and never throws. Clients are created per API by `HttpClientFactory`. Only `src/core/http` imports axios.
- **Errors.** Repositories and the HTTP client return `Result<T, AppError>`. One taxonomy (`AppErrorKind`: `offline`, `timeout`, `notFound`, `server`, `parse`, …) runs from the transport to the UI, and `<AppErrorView errorKind={…} />` shows translated copy for each kind.
- **Validation.** Data read from storage and API responses is parsed with Zod. For stored data, each field falls back on its own, so one bad value doesn't wipe the rest.
- **Connectivity and logging.** `ConnectivityService` (expo-network) is observable (`useConnectivity()`). `Logger` has levels, scoped child loggers, secret redaction and pluggable transports (console in every build, `warn`+ in release; Sentry later).
- **State.** Redux Toolkit holds app state. RTK Query may be added for server caching. If so, its `baseQuery` should wrap `HttpClient` so error handling stays in one place.
- **i18n.** Translation keys are type-checked. Every locale must match the shape of `en.ts`, so a missing or extra key is a compile error. To add a language, add a locale file, add it to `SUPPORTED_LANGUAGES`, and add it to `supportedLocales` in `app.json`.
- **Theming.** Use `useAppTheme()` for colours, spacing, and typography, and don't hard-code colours. The user's theme choice is also applied to native UI through `Appearance.setColorScheme`.

### Design system

- **Tokens** live in `src/core/theme`. `colors.ts` holds the raw brand palette (forest `#245C46`, sage `#A8C3AD`, off-white `#F7F8F5`) mapped to semantic roles for light and dark. Every text/fill pair meets WCAG AA. Components use roles such as `primary`, `textSecondary`, and `dangerSurface`, never hex values.
- **Typography** is Inter, registered as one family with weights 400–700. Styles pick a face with `fontWeight`, the same way as system fonts. Fonts load at runtime (this works in Expo Go) while the splash screen is still showing. If loading fails, the app falls back to the platform font.
- **Shadows** use the cross-platform `boxShadow` style, so iOS and Android look the same.
- **Icons** come from `expo-symbols`: SF Symbols on iOS and Material Symbols on Android. Use `<AppIcon name="…" />` with a name from `shared/ui/icons.ts`, and add new icons there. Both platform names are type-checked.
- **Components:** `AppText`, `AppButton`, `AppIconButton`, `AppInput`, `AppCard`, `AppHeader`, `AppIcon`, `AppLoader`, `AppErrorView`, `AppEmptyView`, `AppBottomSheet`, `AppDivider`, `AppAvatar`, `AppBadge`. Each one is typed, themed, and accessible (roles, labels, states, 48pt touch targets), and uses native press feedback (ripple on Android, pressed tint on iOS).
- **Showcase:** in development builds, open Settings and tap Developer › Design system to see every token and component in the current theme.
- **Start-up.** The native splash screen stays visible until saved preferences are loaded, so the first frame already uses the correct theme and language.

### Adding a feature

Follow the checklist in [docs/ARCHITECTURE.md § 9](docs/ARCHITECTURE.md#9-adding-a-network-backed-feature). `src/testing/examples/networkFeature.example.test.ts` is a complete, tested walkthrough. Remember loading, empty, error and offline states, strings in every locale, and tests for each layer.

## Feature status

| #   | Feature                                                                                               | Status  |
| --- | ----------------------------------------------------------------------------------------------------- | ------- |
| 0   | Foundation: architecture, DI, store, i18n (en/es), theming, test setup, Settings (theme and language) | Done    |
| 0.1 | Design system: brand tokens, Inter, shared components, Prettier                                       | Done    |
| 0.2 | Architecture: DI container, use cases, HTTP layer (axios), error model, logging, connectivity         | Done    |
| 1   | Destination discovery and search                                                                      | Planned |
| 2   | Weather                                                                                               | Planned |
| 3   | Nearby places and map                                                                                 | Planned |
| 4   | Trips and itineraries                                                                                 | Planned |
| 5   | Expense tracking                                                                                      | Planned |
| 6   | Favourites                                                                                            | Planned |
| 7   | Offline support                                                                                       | Planned |
| 8   | Observability (Sentry), E2E (Maestro), EAS Build/Update                                               | Planned |

## Third-party data and attribution

No external APIs are used yet. When a feature adds one, list it here with its licence, attribution requirement, and rate limits, and show the attribution in the app.
