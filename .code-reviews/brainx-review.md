---
diff_hash: a4effe22c13bb1ccb46efa6cad5e2c96d68a14e69be1c73d986ad2a83fd00047
reviewed_at: 2026-11-12T07:25:27Z

## Summary

Feature 2, weather. A new `weather` feature in three layers. **Data:** an Open-Meteo repository (`/v1/forecast` with `timezone=auto` and `timeformat=unixtime`, a 10 s timeout and one retry, zod DTOs where every measurement falls back on its own), mappers (sorting and de-duplicating by time, clamping percentages, dropping negative speeds and amounts, ordering low ≤ high, and treating polar day and night as having no sunrise or sunset), a `StorageWeatherCache` (up to 6 forecasts in AsyncStorage, validated entry by entry), and an `ExpoDeviceLocationService` over `expo-location` (foreground only, last-known fix first, then a 15 s low-accuracy fix). **Domain:** `Coordinates` (validation, rounding to 2 decimals, 0,0 treated as missing), WMO code mapping, weather calculations (compass, local date keys, upcoming hours and days, "now" from `current` or the matching hour, range bars), `GetWeatherForecast` (a 15 min fresh window, and a saved copy up to 72 h old for transient failures), and the device-location and permission use cases. **Presentation:** an RTK Query `weatherApi`, `useWeather` and `useDeviceWeather` hooks, and summary, card and full-forecast components. It's wired into the destination page (a card), a new `destinations/[id]/weather` screen, the trip page (device weather, until trips have destinations) and a new `trips/[id]/weather` screen, with routes, deep links, three new `AppError` kinds, en/es copy, icons, an `expo-location` config plugin with the when-in-use string, docs and tests.

Fresh review. A `brainx-review.md` existed, but it was the review for 3f11f9f (discovery and search), which is committed and already finalized in the ledger by 1f7595d. None of its findings concern this diff, and a Step 4 re-review can't raise new findings, so this review replaces it. The developer asked for all changes to be staged, so `git add -A` was run first. `diff_hash` is `git diff --cached -- . ':!.code-reviews' | shasum -a 256`, the convention prior reviews in this repo used.

Stack: React (`react` in dependencies, no NestJS marker). The runtime is React Native / Expo SDK 58, so the web-only criteria in `react.md` (CSS class naming, CSS variables, `dangerouslySetInnerHTML`, React Router 404, httpOnly cookies) weren't applied. Hooks, state (RTK Query), routing, data fetching, error handling, typing, accessibility and security criteria were.

Suspicions checked and dismissed: (1) Privacy: device coordinates are rounded to about 1.1 km before they become an RTK Query key or reach Open-Meteo, the prompt is only shown after an in-app explanation and a tap, and `app.json` declares only the when-in-use permission. (2) Open-Meteo needs no key, so no secret is in the bundle. (3) Time zones: days are keyed by the forecast's offset, and times are formatted in the forecast's IANA zone with a fixed-offset fallback, so "today" and the hour labels are the destination's. (4) `api.forced` is set by RTK Query's `refetch()`, so "try again" and pull to refresh do skip the saved copy. (5) A rejected `deviceLocation` entry is refetched when the query is un-skipped after permission is granted, because RTK Query re-runs queries with no fulfilled value. (6) Deep-link ids for both weather routes go through the same validation as the parent routes.

Skimmed, not read line by line: the test files (the suite passes; fixtures were read where findings relied on them), the en/es locale additions (key parity is enforced by the compiler), the icon table, `README.md` and `docs/ARCHITECTURE.md`, and `package-lock.json` (one new dependency, `expo-location ~58.0.21`). Not verified on a device: the permission prompt, `Linking.openSettings`, and the horizontal hourly list inside the vertical scroll view.

Cross-repo: only one repository has staged changes.

Re-review (2026-11-12T07:25:27Z): the staged diff changed since the review above. All four findings were re-evaluated against the changed lines and are fixed (details per finding). The changes also add `src/features/weather/presentation/hooks/useNow.ts` and `src/features/discover/presentation/destinationWeatherState.ts`, give `DestinationWeatherCard` `onRetryDetails` / `refreshingDetails` props, add a `now` field to the ready `WeatherState` (the views now use it instead of calling `clock.now()` themselves), add tests to `DestinationWeatherScreen.test.tsx`, `StorageWeatherCache.test.ts` and `TripScreen.test.tsx`, and update the weather edge-case table in `docs/ARCHITECTURE.md`. Per the re-review rules, no new findings were raised. Each new regression test was checked to fail with its fix temporarily reverted (3 failures). Verification: `npm run check` (tsc, expo lint, prettier --check, jest) is clean, with 67 suites / 645 tests passing.

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **src/features/weather/presentation/hooks/useWeather.ts:77** — The summary is derived from `clock.now()` inside a `useMemo` whose dependencies never change with time, and nothing refetches while a screen stays mounted. The destination page and the trip page are stack screens that stay mounted when the app goes to the background or the user switches tabs. If someone opens Lisbon in the evening and comes back the next morning, "Now", the highlighted hour, "Today", H/L and the 7-day list still describe the previous evening, and `ageMs` (used by "Updated …") is frozen too. RTK Query keeps the subscribed entry indefinitely (`keepUnusedDataFor` only applies after unsubscribe, and there's no `refetchOnFocus` or `setupListeners`), so the forecast isn't downloaded again either. The components call `clock.now()` themselves for labels, so the "Now" label and the frozen `summary.hours` can disagree in the same render. The app already handles this for the greeting (`useDayPeriod` recomputes on `AppState` 'active'). *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. New `useNow(clock)` (`presentation/hooks/useNow.ts`) keeps the time in state, ticking every 60 s and on `AppState` 'active', with the interval and listener cleaned up on unmount. `useWeather` derives the summary from it (line 96) and puts the same instant on the ready state as `now`, which `WeatherSummaryContent` and `WeatherForecastView` now use instead of their own `clock.now()`, so labels and the summary can't disagree. A second `AppState` listener (lines 72–78) refetches on return to the foreground when the forecast is at least `DEFAULT_WEATHER_CACHE_POLICY.freshForMs` old. It only runs on foreground, so a failing service isn't polled. `DestinationWeatherScreen.test.tsx` adds 'moves on to the new day, and asks for a new forecast, when the app returns after a night': the clock advances 24 h, the foreground triggers a second request (offline, so the saved copy is shown), "Updated 1 day ago" appears, and the 13th becomes "Today". The test fails with the tick disabled.
- **src/features/discover/domain/Destination.ts:600** — `destinationWeatherPlace` maps a *failed* Wikipedia summary (`description.status === 'failed'`, e.g. offline or a 503) to `coordinates: null`, the same as an article that really has no coordinates. `useWeather(null)` then reports `locationUnavailable`, which is in `PERMANENT_KINDS`, so there's no retry. The weather card on a city's page says "We don't know exactly where this place is, so we can't show its weather." even though the problem is the network. On the full forecast screen (`DestinationWeatherScreen`, e.g. from a deep link) the user sees "Weather unavailable" with no way to recover, and `destinationDetails` keeps that failed description cached for 30 minutes after unmount, so going back and forth doesn't help. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `DestinationWeatherPlace` gains `coordinatesError` (line 164), set from `description.errorKind` when the summary failed (line 186) and `null` otherwise. The new `destinationWeatherState` (`discover/presentation/destinationWeatherState.ts`) turns that into an error state whose retry refetches the destination details, or a loading state while they refetch. A real "no coordinates" place still gets the permanent message. Both `DestinationWeatherCard` (new `onRetryDetails` / `refreshingDetails` props, wired from `useDestinationDetails` in `DestinationScreen`) and `DestinationWeatherScreen` (`destination.refetch` / `isFetching`) use it. `DestinationWeatherScreen.test.tsx` adds "offers a retry when a place's position couldn't be loaded, and shows its weather after": the Kyoto summary returns 503, the service error with a retry is shown (not the no-coordinates copy), and after the retry the forecast loads for the rounded coordinates. The test fails with the helper bypassed.

### Low (2)
- **src/features/weather/data/StorageWeatherCache.ts:76** — `save` is an unserialised read-modify-write of the whole list. Two forecasts for different coordinates that download at the same time (e.g. the destination card and the trip's device weather both refetching when the device reconnects, through `useWeather`'s reconnect effect) both read the same list, and the second `setItem` drops the first forecast. The only effect is a lost offline copy, so the next offline launch for that place shows an error instead of saved weather. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `save` (line 83) now chains each write onto `this.writes`, and the read-modify-write runs inside the queued `write` (line 89). `write` never rejects (storage errors are caught and logged), so a failed save can't stall later ones. `StorageWeatherCache.test.ts` adds 'keeps both forecasts when two places are saved at the same time' (fails without the queue) and 'keeps saving after a save fails'.
- **src/features/weather/presentation/components/DeviceWeather.tsx:113** — The full-screen `DeviceWeatherView` drops two things the card handles: the `requesting` state (its "Use my location" action has no loading state, so a second tap while the system prompt is coming up calls `requestForegroundPermissionsAsync` again), and the `openSettings` result (`onAction={() => void state.openSettings()}` ignores `false`, so if Settings can't be opened the button just does nothing, while the card shows `weather.device.openSettingsFailed`). *(error-handling)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `useDeviceWeather.request` now returns early while a request is in flight, using a ref (`useDeviceWeather.ts:66`) rather than state so two taps in the same frame are caught too. Both views benefit. `DeviceWeatherView`'s blocked state keeps the `openSettings` result and appends `weather.device.openSettingsFailed` to the message when it's `false` (`DeviceWeather.tsx:109`, 132–133). `TripScreen.test.tsx` adds a `TripWeatherScreen` block: 'asks the system only once when "Use my location" is tapped again while the prompt is coming up' (two taps while the prompt is pending, so one `requestPermission` call) and 'says so when Settings cannot be opened'.

## Reviewed files
- README.md
- app.json
- docs/ARCHITECTURE.md
- package-lock.json
- package.json
- src/app/(app)/(tabs)/(explore)/_layout.tsx
- src/app/(app)/(tabs)/(explore)/destinations/[destinationId]/weather.tsx
- src/app/(app)/(tabs)/trips/[tripId]/weather.tsx
- src/app/(app)/(tabs)/trips/_layout.tsx
- src/bootstrap/createAppContainer.ts
- src/core/di/AppDependencies.ts
- src/core/errors/AppError.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/store/store.ts
- src/features/discover/domain/Destination.ts
- src/features/discover/presentation/components/DestinationWeatherCard.tsx
- src/features/discover/presentation/destinationWeatherState.ts
- src/features/discover/presentation/screens/DestinationScreen.test.tsx
- src/features/discover/presentation/screens/DestinationScreen.tsx
- src/features/discover/presentation/screens/DestinationWeatherScreen.test.tsx
- src/features/discover/presentation/screens/DestinationWeatherScreen.tsx
- src/features/trips/presentation/screens/TripScreen.test.tsx
- src/features/trips/presentation/screens/TripScreen.tsx
- src/features/trips/presentation/screens/TripWeatherScreen.tsx
- src/features/weather/data/ExpoDeviceLocationService.test.ts
- src/features/weather/data/ExpoDeviceLocationService.ts
- src/features/weather/data/OpenMeteoWeatherRepository.test.ts
- src/features/weather/data/OpenMeteoWeatherRepository.ts
- src/features/weather/data/StorageWeatherCache.test.ts
- src/features/weather/data/StorageWeatherCache.ts
- src/features/weather/data/dto/openMeteoDtos.ts
- src/features/weather/data/openMeteoApi.ts
- src/features/weather/data/openMeteoMappers.test.ts
- src/features/weather/data/openMeteoMappers.ts
- src/features/weather/di.ts
- src/features/weather/domain/Coordinates.test.ts
- src/features/weather/domain/Coordinates.ts
- src/features/weather/domain/Weather.ts
- src/features/weather/domain/repositories.ts
- src/features/weather/domain/usecases/GetWeatherForecast.test.ts
- src/features/weather/domain/usecases/GetWeatherForecast.ts
- src/features/weather/domain/usecases/deviceLocation.test.ts
- src/features/weather/domain/usecases/deviceLocation.ts
- src/features/weather/domain/weatherCalculations.test.ts
- src/features/weather/domain/weatherCalculations.ts
- src/features/weather/domain/weatherCodes.test.ts
- src/features/weather/domain/weatherCodes.ts
- src/features/weather/presentation/components/CurrentConditions.tsx
- src/features/weather/presentation/components/DailyForecastList.tsx
- src/features/weather/presentation/components/DeviceWeather.tsx
- src/features/weather/presentation/components/HourlyForecastStrip.tsx
- src/features/weather/presentation/components/SavedForecastNotice.tsx
- src/features/weather/presentation/components/WeatherDetailsGrid.tsx
- src/features/weather/presentation/components/WeatherForecastView.tsx
- src/features/weather/presentation/components/WeatherIcon.tsx
- src/features/weather/presentation/components/WeatherSection.tsx
- src/features/weather/presentation/components/WeatherSummaryCard.tsx
- src/features/weather/presentation/format.test.ts
- src/features/weather/presentation/format.ts
- src/features/weather/presentation/hooks/useDeviceWeather.ts
- src/features/weather/presentation/hooks/useNow.ts
- src/features/weather/presentation/hooks/useWeather.ts
- src/features/weather/presentation/state/weatherApi.test.ts
- src/features/weather/presentation/state/weatherApi.ts
- src/features/weather/presentation/units.ts
- src/features/weather/presentation/weatherIcons.ts
- src/shared/navigation/deepLinks.test.ts
- src/shared/navigation/deepLinks.ts
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/FakeDeviceLocationService.ts
- src/testing/createTestStore.ts
- src/testing/testDependencies.ts
- src/testing/weatherFixtures.ts
