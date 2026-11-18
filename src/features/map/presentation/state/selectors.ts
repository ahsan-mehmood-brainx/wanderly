import { type RootState } from '@/core/store/store';

export const selectCustomMarkers = (state: RootState) => state.map.customMarkers;
export const selectMapNotice = (state: RootState) => state.map.notice;
