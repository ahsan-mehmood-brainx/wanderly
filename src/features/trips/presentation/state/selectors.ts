import { createSelector } from '@reduxjs/toolkit';

import { type RootState } from '@/core/store/store';

import { type LocalDate } from '../../domain/localDate';
import { type Trip, type TripStatus } from '../../domain/Trip';
import { compareTripsForStatus, withStatus } from '../../domain/tripStatus';
import { tripsSelectors } from './tripsSlice';

export type TripGroups = Readonly<Record<TripStatus, readonly Trip[]>>;

export const selectTripsLoadStatus = (state: RootState) => state.trips.status;
export const selectTripsErrorKind = (state: RootState) => state.trips.errorKind;
export const selectTripsSaving = (state: RootState) => state.trips.changeRequestId !== null;
export const selectTripCount = (state: RootState) => tripsSelectors.selectTotal(state.trips);
export const selectStoredTripById = (state: RootState, id: string) => tripsSelectors.selectById(state.trips, id);

const selectAllTrips = (state: RootState) => tripsSelectors.selectAll(state.trips);

/** Trips by status **as of `today`**, so they move between groups at midnight without a reload. */
export const selectTripGroups = createSelector(
  [selectAllTrips, (_: RootState, today: LocalDate) => today],
  (trips, today): TripGroups => {
    const groups: Record<TripStatus, Trip[]> = { ongoing: [], upcoming: [], completed: [], cancelled: [] };
    for (const trip of trips) {
      const current = withStatus(trip, today);
      groups[current.status].push(current);
    }
    for (const status of Object.keys(groups) as TripStatus[]) groups[status].sort(compareTripsForStatus(status));
    return groups;
  },
);
