# Wanderly

A smart travel companion for iOS and Android: discover destinations, explore nearby places, check weather, plan trips and itineraries, track expenses, save favourite places, and keep it all available offline.

Built with Expo SDK 58, Expo Router, TypeScript (strict), and Redux Toolkit. There is no custom backend: data comes from public APIs and on-device storage.

## Getting started

```bash
npm install
npx expo start          # press i / a to open iOS / Android
```

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and component tests (Jest + React Native Testing Library) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`expo lint`) |
| `npx expo-doctor` | Dependency and config health check |

Run `typecheck`, `lint`, and `test` before opening a PR.

Install new packages with `npx expo install <pkg>` so you get SDK-compatible versions. Libraries with native code that Expo Go doesn't include need a development build (`npx expo run:ios|android` or `eas build --profile development`).

## Architecture

The code is organised by feature. Each feature is split into **domain**, **data**, and **presentation** layers. Dependencies point inward: presentation → domain ← data. Domain code has no React or storage imports.

```
src/
  app/                    Expo Router routes only (thin; each file renders a feature screen)
  bootstrap/              Composition root, providers, and app start-up (preferences gate, splash)
  core/                   Cross-cutting infrastructure with no feature knowledge
    di/                   AppDependencies: interfaces of every injectable service
    errors/  result.ts    AppError taxonomy and Result<T, E> for layer boundaries
    i18n/                 i18next setup, supported languages, typed locale files
    logging/              Logger port (console today; crash reporting later)
    storage/              KeyValueStore port + AsyncStorage adapter
    store/                Redux store factory and typed hooks/thunk creator
    theme/                Design tokens, light/dark palettes, ThemeProvider
  features/<feature>/
    domain/               Entities, pure business rules, repository interfaces
    data/                 Repository implementations (storage, APIs) + response validation
    presentation/         Redux state, view-model hooks, screens
  shared/ui/              Reusable, themed, accessible UI components
  testing/                Test doubles and render helpers
```

### Key decisions

- **Navigation: Expo Router.** In SDK 58, Expo Router includes React Navigation internally, so `@react-navigation/*` is not installed separately. Tabs use `expo-router/native-tabs` (native tab bars on iOS and Android). Each tab has its own Stack for native headers and nested screens.
- **Dependency injection.** `bootstrap/createAppContainer.ts` is the only place concrete classes are created. Services reach Redux thunks through `extraArgument` (`createAppAsyncThunk` gives typed access to `extra`). Tests pass in fakes through `createTestDependencies()`.
- **Errors.** Repositories return `Result<T, AppError>` and don't throw. Each layer maps low-level failures to an `AppErrorKind` so screens can show the right state.
- **Validation.** Data read from storage (and, later, from API responses) is parsed with Zod. Each field falls back on its own, so one bad value doesn't wipe the rest.
- **State.** Redux Toolkit holds app state. RTK Query will be added with the first network feature, for server data and caching.
- **i18n.** Translation keys are type-checked. Every locale must match the shape of `en.ts`, so a missing or extra key is a compile error. To add a language, add a locale file, add it to `SUPPORTED_LANGUAGES`, and add it to `supportedLocales` in `app.json`.
- **Theming.** Use `useAppTheme()` for colours, spacing, and typography, and don't hard-code colours. The user's theme choice is also applied to native UI through `Appearance.setColorScheme`.
- **Start-up.** The native splash screen stays visible until saved preferences are loaded, so the first frame already uses the correct theme and language.

### Adding a feature

1. Domain: entities, pure functions, and a repository interface under `features/<name>/domain`.
2. Data: an implementation under `features/<name>/data` that validates everything it reads.
3. Register the interface in `AppDependencies` and wire the implementation in `createAppContainer`.
4. Presentation: a slice and thunks (or an RTK Query API), a view-model hook, and a screen. Then add a thin route file under `src/app/`.
5. Handle loading, empty, error, and offline states. Add strings to every locale.
6. Tests: unit tests for domain logic and repositories, and component tests for user-visible behaviour.

## Feature status

| # | Feature | Status |
| --- | --- | --- |
| 0 | Foundation: architecture, DI, store, i18n (en/es), theming, test setup, Settings (theme and language) | Done |
| 1 | Destination discovery and search | Planned |
| 2 | Weather | Planned |
| 3 | Nearby places and map | Planned |
| 4 | Trips and itineraries | Planned |
| 5 | Expense tracking | Planned |
| 6 | Favourites | Planned |
| 7 | Offline support | Planned |
| 8 | Observability (Sentry), E2E (Maestro), EAS Build/Update | Planned |

## Third-party data and attribution

No external APIs are used yet. When a feature adds one, list it here with its licence, attribution requirement, and rate limits, and show the attribution in the app.
