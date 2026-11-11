import { createSlice } from '@reduxjs/toolkit';

import { createAppAsyncThunk } from '@/core/store/hooks';

import { type DestinationDetails, type RecentDestination, toRecentDestination } from '../../domain/Destination';

/** On-device discovery history. Server data (countries, places, details) lives in `discoverApi`. */
export interface DiscoverState {
  readonly status: 'idle' | 'loading' | 'ready';
  /** Most recent first. */
  readonly searchHistory: readonly string[];
  /** Most recent first. */
  readonly recentlyViewed: readonly RecentDestination[];
}

const initialState: DiscoverState = { status: 'idle', searchHistory: [], recentlyViewed: [] };

export const loadDiscoveryHistory = createAppAsyncThunk(
  'discover/loadHistory',
  (_: void, { extra }) => extra.loadDiscoveryHistory.execute(),
  { condition: (_, { getState }) => getState().discover.status === 'idle' },
);

export const rememberSearch = createAppAsyncThunk('discover/rememberSearch', (query: string, { extra }) =>
  extra.rememberSearch.execute(query),
);

export const forgetSearch = createAppAsyncThunk('discover/forgetSearch', (query: string, { extra }) =>
  extra.forgetSearch.execute(query),
);

export const clearSearchHistory = createAppAsyncThunk('discover/clearSearchHistory', (_: void, { extra }) =>
  extra.clearSearchHistory.execute(),
);

export const recordDestinationView = createAppAsyncThunk(
  'discover/recordView',
  (details: DestinationDetails, { extra }) =>
    extra.recordDestinationView.execute(toRecentDestination(details, extra.clock.now())),
);

export const clearRecentlyViewed = createAppAsyncThunk('discover/clearRecentlyViewed', (_: void, { extra }) =>
  extra.clearRecentlyViewed.execute(),
);

const discoverSlice = createSlice({
  name: 'discover',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadDiscoveryHistory.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadDiscoveryHistory.fulfilled, (state, { payload }) => {
        state.status = 'ready';
        state.searchHistory = [...payload.searchHistory];
        state.recentlyViewed = [...payload.recentlyViewed];
      })
      // Loading never fails by contract (unreadable history is empty); this only covers an unexpected throw.
      .addCase(loadDiscoveryHistory.rejected, (state) => {
        state.status = 'ready';
      })
      .addCase(rememberSearch.fulfilled, (state, { payload }) => {
        state.searchHistory = [...payload];
      })
      .addCase(forgetSearch.fulfilled, (state, { payload }) => {
        state.searchHistory = [...payload];
      })
      .addCase(clearSearchHistory.fulfilled, (state, { payload }) => {
        state.searchHistory = [...payload];
      })
      .addCase(recordDestinationView.fulfilled, (state, { payload }) => {
        state.recentlyViewed = [...payload];
      })
      .addCase(clearRecentlyViewed.fulfilled, (state, { payload }) => {
        state.recentlyViewed = [...payload];
      });
  },
});

export const discoverReducer = discoverSlice.reducer;
