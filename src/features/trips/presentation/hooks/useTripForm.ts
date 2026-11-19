import { getLocales } from 'expo-localization';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { DEFAULT_TRIP_CURRENCY, formatAmountInput, TRIP_CURRENCIES } from '../../domain/money';
import { type Trip, type TripDestination, type TripInput } from '../../domain/Trip';
import { type TripField, type TripValidationErrors } from '../../domain/tripValidation';
import { selectTripsSaving } from '../state/selectors';
import { createTrip, updateTrip } from '../state/tripsSlice';

function defaultCurrency(): string {
  const code = getLocales()[0]?.currencyCode;
  return code && (TRIP_CURRENCIES as readonly string[]).includes(code) ? code : DEFAULT_TRIP_CURRENCY;
}

function initialInput(trip: Trip | null): TripInput {
  if (!trip) {
    return {
      title: '',
      destination: null,
      startDate: null,
      endDate: null,
      description: '',
      coverImage: null,
      budget: '',
      currency: defaultCurrency(),
    };
  }
  return {
    title: trip.title,
    destination: { id: trip.destinationId, name: trip.destinationName },
    startDate: trip.startDate,
    endDate: trip.endDate,
    description: trip.description,
    coverImage: trip.coverImage,
    budget: formatAmountInput(trip.budget, trip.currency),
    currency: trip.currency,
  };
}

const FIELD_OF: Partial<Record<keyof TripInput, TripField>> = {
  title: 'title',
  destination: 'destination',
  startDate: 'dates',
  endDate: 'dates',
  description: 'description',
  budget: 'budget',
  currency: 'budget',
};

export type CoverNotice = 'pickFailed' | null;

/** View model for the create and edit forms. `trip` is the trip being edited, `null` when creating. */
export function useTripForm(trip: Trip | null) {
  const dispatch = useAppDispatch();
  const { pickCoverImage, tripCoverStore } = useDependencies();
  const saving = useAppSelector(selectTripsSaving);

  const [initial] = useState(() => initialInput(trip));
  const [input, setInput] = useState<TripInput>(initial);
  const [errors, setErrors] = useState<TripValidationErrors | null>(null);
  const [failure, setFailure] = useState<AppErrorKind | null>(null);
  const [coverNotice, setCoverNotice] = useState<CoverNotice>(null);
  const [savedTrip, setSavedTrip] = useState<Trip | null>(null);
  const picking = useRef(false);

  const change = useCallback(<K extends keyof TripInput>(key: K, value: TripInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    const field = FIELD_OF[key];
    if (field) {
      setErrors((current) => {
        if (!current?.fields[field]) return current;
        const { [field]: _cleared, ...fields } = current.fields;
        return { fields };
      });
    }
  }, []);

  const pickCover = useCallback(async () => {
    if (picking.current) return;
    picking.current = true;
    setCoverNotice(null);
    const picked = await pickCoverImage.execute();
    picking.current = false;
    if (!picked.ok) setCoverNotice('pickFailed');
    else if (picked.value) change('coverImage', picked.value);
  }, [change, pickCoverImage]);

  const submit = useCallback(async () => {
    setFailure(null);
    const action = trip ? await dispatch(updateTrip({ id: trip.id, input })) : await dispatch(createTrip(input));
    if (createTrip.rejected.match(action) || updateTrip.rejected.match(action)) {
      if (!action.meta.condition) setFailure('unknown');
      return;
    }
    const outcome = action.payload;
    switch (outcome.status) {
      case 'saved':
        setErrors(null);
        setSavedTrip(outcome.trip);
        break;
      case 'invalid':
        setErrors(outcome.errors);
        break;
      case 'failed':
        setFailure(outcome.errorKind);
        break;
    }
  }, [dispatch, input, trip]);

  const coverUri = useMemo(() => {
    if (!input.coverImage) return null;
    return tripCoverStore.isStoredReference(input.coverImage)
      ? tripCoverStore.displayUri(input.coverImage)
      : input.coverImage;
  }, [input.coverImage, tripCoverStore]);

  return {
    input,
    errors,
    failure,
    coverNotice,
    coverUri,
    coverSupported: tripCoverStore.supported,
    saving,
    savedTrip,
    /** Unsaved edits exist (leaving asks first). */
    dirty: savedTrip === null && JSON.stringify(input) !== JSON.stringify(initial),
    setTitle: (value: string) => change('title', value),
    setDescription: (value: string) => change('description', value),
    setBudget: (value: string) => change('budget', value),
    setCurrency: (value: string) => change('currency', value),
    setDestination: (value: TripDestination) => change('destination', value),
    setDates: (startDate: string, endDate: string) => {
      change('startDate', startDate);
      change('endDate', endDate);
    },
    removeCover: () => change('coverImage', null),
    pickCover,
    submit,
  };
}
