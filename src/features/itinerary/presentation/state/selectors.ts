import { createSelector } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type RootState } from '@/core/store/store';
import { type LocalDate } from '@/features/trips/domain/localDate';

import { type Activity } from '../../domain/Activity';
import { costTotals, type ItineraryProgress, progress } from '../../domain/itinerary';
import { findTimeConflicts } from '../../domain/timeConflicts';
import { activitiesSelectors, type ItineraryLoadStatus } from './itinerarySlice';

export const selectItinerarySaving = (state: RootState): boolean => state.itinerary.changeRequestId !== null;

export const selectItineraryLoadStatus = (state: RootState, tripId: string): ItineraryLoadStatus =>
  state.itinerary.loadByTrip[tripId]?.status ?? 'idle';

export const selectItineraryErrorKind = (state: RootState, tripId: string): AppErrorKind | null =>
  state.itinerary.loadByTrip[tripId]?.errorKind ?? null;

export const selectActivityById = (state: RootState, id: string): Activity | undefined =>
  activitiesSelectors.selectById(state.itinerary, id);

const selectAllActivities = (state: RootState) => activitiesSelectors.selectAll(state.itinerary);

/** The trip's activities, by date then `sortOrder`. */
export const selectTripActivities = createSelector(
  [selectAllActivities, (_: RootState, tripId: string) => tripId],
  (activities, tripId): readonly Activity[] =>
    activities
      .filter((item) => item.tripId === tripId)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortOrder - b.sortOrder)),
);

/** One day's activities in `sortOrder`. */
export const selectDayActivities = createSelector(
  [
    (state: RootState, tripId: string, _date: LocalDate) => selectTripActivities(state, tripId),
    (_: RootState, _tripId: string, date: LocalDate) => date,
  ],
  (activities, date): readonly Activity[] => activities.filter((item) => item.date === date),
);

export const selectItineraryProgress = createSelector([selectTripActivities], (activities): ItineraryProgress =>
  progress(activities),
);

export const selectItineraryCostTotals = createSelector([selectTripActivities], (activities) => costTotals(activities));

/** For each overlapping activity of the trip, the ids of those it overlaps (same day only). */
export const selectTripConflicts = createSelector([selectTripActivities], (activities) =>
  findTimeConflicts(activities),
);
