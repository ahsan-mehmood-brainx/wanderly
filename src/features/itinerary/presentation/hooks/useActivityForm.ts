import { useCallback, useMemo, useState } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { formatAmountInput } from '@/features/trips/domain/money';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type Activity, type ActivityCategory, type ActivityInput } from '../../domain/Activity';
import { type ActivityField, type ActivityValidationErrors } from '../../domain/activityValidation';
import { type LocalTime } from '../../domain/localTime';
import { findTimeConflicts } from '../../domain/timeConflicts';
import { createActivity, updateActivity } from '../state/itinerarySlice';
import { selectDayActivities, selectItinerarySaving } from '../state/selectors';

function initialInput(trip: StoredTrip, activity: Activity | null, presetDate: LocalDate | null): ActivityInput {
  if (!activity) {
    return {
      title: '',
      description: '',
      category: null,
      date: presetDate,
      startTime: null,
      endTime: null,
      latitude: null,
      longitude: null,
      address: '',
      estimatedCost: '',
      currency: trip.currency,
      notes: '',
    };
  }
  return {
    title: activity.title,
    description: activity.description,
    category: activity.category,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    latitude: activity.latitude,
    longitude: activity.longitude,
    address: activity.address,
    estimatedCost: activity.estimatedCost === null ? '' : formatAmountInput(activity.estimatedCost, activity.currency),
    currency: activity.currency,
    notes: activity.notes,
  };
}

/**
 * The form fields whose errors a change clears: its own, and those judged against it
 * (the end time against the start time, the cost against the currency's decimals).
 */
const FIELDS_OF: Record<keyof ActivityInput, readonly ActivityField[]> = {
  title: ['title'],
  description: ['description'],
  category: ['category'],
  date: ['date'],
  startTime: ['startTime', 'endTime'],
  endTime: ['endTime'],
  latitude: ['location'],
  longitude: ['location'],
  address: ['address'],
  estimatedCost: ['cost'],
  currency: ['currency', 'cost'],
  notes: ['notes'],
};

/** Fields whose change can resolve a duplicate, so the title's `duplicate` error goes too. */
const DUPLICATE_KEYS: ReadonlySet<keyof ActivityInput> = new Set(['title', 'date', 'startTime']);

/** Never a stored id (those are generated and non-empty), so it can stand for a new activity. */
const DRAFT_ID = '';

/**
 * View model for the add and edit forms. `activity` is the one being edited,
 * `null` when adding; `presetDate` is the day an add was started from.
 */
export function useActivityForm(trip: StoredTrip, activity: Activity | null, presetDate: LocalDate | null) {
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectItinerarySaving);

  const [initial] = useState(() => initialInput(trip, activity, presetDate));
  const [input, setInput] = useState<ActivityInput>(initial);
  const [errors, setErrors] = useState<ActivityValidationErrors | null>(null);
  const [failure, setFailure] = useState<AppErrorKind | null>(null);
  const [savedActivity, setSavedActivity] = useState<Activity | null>(null);

  const sameDay = useAppSelector((state) => selectDayActivities(state, trip.id, input.date ?? ''));
  const excludeId = activity?.id ?? DRAFT_ID;

  /** Activities on the chosen day that the entered times overlap (saving is still allowed). */
  const overlaps = useMemo(() => {
    const { date, startTime, endTime } = input;
    if (date === null || startTime === null || endTime === null) return [];
    const others = sameDay.filter((item) => item.id !== excludeId);
    const ids = findTimeConflicts([...others, { id: DRAFT_ID, date, startTime, endTime }]).get(DRAFT_ID) ?? [];
    return others.filter((item) => ids.includes(item.id));
  }, [input, sameDay, excludeId]);

  const change = useCallback(<K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current) return current;
      const cleared = FIELDS_OF[key];
      const clearsDuplicate = DUPLICATE_KEYS.has(key) && current.fields.title === 'duplicate';
      if (!cleared.some((field) => current.fields[field]) && !clearsDuplicate) return current;
      const fields = { ...current.fields };
      for (const field of cleared) delete fields[field];
      if (clearsDuplicate) delete fields.title;
      return { fields };
    });
  }, []);

  const submit = useCallback(async () => {
    setFailure(null);
    const action = activity
      ? await dispatch(updateActivity({ id: activity.id, input }))
      : await dispatch(createActivity({ tripId: trip.id, input }));
    if (createActivity.rejected.match(action) || updateActivity.rejected.match(action)) {
      if (!action.meta.condition) setFailure('unknown');
      return;
    }
    const outcome = action.payload;
    switch (outcome.status) {
      case 'saved':
        setErrors(null);
        setSavedActivity(outcome.activity);
        break;
      case 'invalid':
        setErrors(outcome.errors);
        break;
      case 'failed':
        setFailure(outcome.errorKind);
        break;
    }
  }, [activity, dispatch, input, trip.id]);

  return {
    input,
    errors,
    failure,
    saving,
    savedActivity,
    overlaps,
    /** Unsaved edits exist (leaving asks first). */
    dirty: savedActivity === null && JSON.stringify(input) !== JSON.stringify(initial),
    setTitle: (value: string) => change('title', value),
    setDescription: (value: string) => change('description', value),
    setCategory: (value: ActivityCategory) => change('category', value),
    setDate: (value: LocalDate) => change('date', value),
    setStartTime: (value: LocalTime | null) => change('startTime', value),
    setEndTime: (value: LocalTime | null) => change('endTime', value),
    setAddress: (value: string) => change('address', value),
    setLocation: (value: Coordinates | null) => {
      change('latitude', value?.latitude ?? null);
      change('longitude', value?.longitude ?? null);
    },
    setEstimatedCost: (value: string) => change('estimatedCost', value),
    setCurrency: (value: string) => change('currency', value),
    setNotes: (value: string) => change('notes', value),
    submit,
  };
}
