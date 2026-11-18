import { type RootState } from '@/core/store/store';

export const selectSearchHistory = (state: RootState) => state.discover.searchHistory;
export const selectRecentlyViewed = (state: RootState) => state.discover.recentlyViewed;
export const selectDiscoveryHistoryReady = (state: RootState) => state.discover.status === 'ready';
