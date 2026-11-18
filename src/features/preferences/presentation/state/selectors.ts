import { type RootState } from '@/core/store/store';

export const selectPreferences = (state: RootState) => state.preferences.values;
export const selectPreferencesReady = (state: RootState) => state.preferences.status === 'ready';
export const selectPreferencesSaveError = (state: RootState) => state.preferences.saveError;
