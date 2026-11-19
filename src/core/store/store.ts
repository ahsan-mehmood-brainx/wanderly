import { combineReducers, configureStore } from '@reduxjs/toolkit';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { authReducer } from '@/features/auth/presentation/state/authSlice';
import { discoverApi } from '@/features/discover/presentation/state/discoverApi';
import { discoverReducer } from '@/features/discover/presentation/state/discoverSlice';
import { itineraryReducer } from '@/features/itinerary/presentation/state/itinerarySlice';
import { mapApi } from '@/features/map/presentation/state/mapApi';
import { mapReducer } from '@/features/map/presentation/state/mapSlice';
import { onboardingReducer } from '@/features/onboarding/presentation/state/onboardingSlice';
import { preferencesReducer } from '@/features/preferences/presentation/state/preferencesSlice';
import { tripsReducer } from '@/features/trips/presentation/state/tripsSlice';
import { weatherApi } from '@/features/weather/presentation/state/weatherApi';

const rootReducer = combineReducers({
  preferences: preferencesReducer,
  onboarding: onboardingReducer,
  auth: authReducer,
  discover: discoverReducer,
  [discoverApi.reducerPath]: discoverApi.reducer,
  [weatherApi.reducerPath]: weatherApi.reducer,
  map: mapReducer,
  [mapApi.reducerPath]: mapApi.reducer,
  trips: tripsReducer,
  itinerary: itineraryReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function createAppStore(dependencies: AppDependencies, preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      // RTK Query endpoints receive the container as `extra` too, so `queryFn`s call use cases.
      getDefaultMiddleware({ thunk: { extraArgument: dependencies } }).concat(
        discoverApi.middleware,
        weatherApi.middleware,
        mapApi.middleware,
      ),
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
