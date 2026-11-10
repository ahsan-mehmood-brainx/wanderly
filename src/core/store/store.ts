import { combineReducers, configureStore } from '@reduxjs/toolkit';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { preferencesReducer } from '@/features/preferences/presentation/state/preferencesSlice';

const rootReducer = combineReducers({
  preferences: preferencesReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function createAppStore(dependencies: AppDependencies, preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: dependencies } }),
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
