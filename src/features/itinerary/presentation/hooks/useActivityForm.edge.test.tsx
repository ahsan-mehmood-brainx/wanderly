import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { createTestStore } from '@/testing/createTestStore';
import { activity, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Activity } from '../../domain/Activity';
import { loadItinerary } from '../state/itinerarySlice';
import { useActivityForm } from './useActivityForm';

const DAY = '2027-07-01';
const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '12:00', endTime: '13:00', sortOrder: 1 });

async function renderForm(editing: Activity | null, presetDate: string | null = DAY) {
  const storage = await seededItineraryDatabase([ITINERARY_TRIP], [museum, lunch]);
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(TRIPS_NOW),
  });
  const store = createTestStore(dependencies);
  await store.dispatch(loadItinerary('trip-1'));
  const wrapper = ({ children }: { children: ReactNode }) => <ReduxProvider store={store}>{children}</ReduxProvider>;
  const rendered = await renderHook(() => useActivityForm(ITINERARY_TRIP, editing, presetDate), { wrapper });
  return { ...rendered, store };
}

type Form = Awaited<ReturnType<typeof renderForm>>['result'];

async function fill(result: Form, steps: (form: Form['current']) => void) {
  await act(async () => {
    steps(result.current);
  });
}

async function submit(result: Form) {
  await act(async () => {
    await result.current.submit();
  });
}

describe('useActivityForm edge cases', () => {
  it("clears the end time's range error once the start time changes", async () => {
    const { result } = await renderForm(null);
    await fill(result, (form) => {
      form.setTitle('Walk');
      form.setCategory('other');
      form.setStartTime('15:00');
      form.setEndTime('14:00');
    });
    await submit(result);
    expect(result.current.errors?.fields.endTime).toBe('invalidRange');

    await fill(result, (form) => form.setStartTime('13:30'));

    expect(result.current.errors?.fields.endTime).toBeUndefined();
  });

  it("clears the end time's missing-start error once a start time is set", async () => {
    const { result } = await renderForm(null);
    await fill(result, (form) => {
      form.setTitle('Walk');
      form.setCategory('other');
      form.setEndTime('14:00');
    });
    await submit(result);
    expect(result.current.errors?.fields.endTime).toBe('endWithoutStart');

    await fill(result, (form) => form.setStartTime('13:00'));

    expect(result.current.errors?.fields.endTime).toBeUndefined();
  });

  it("clears the cost's decimals error once the currency changes", async () => {
    const { result } = await renderForm(null);
    await fill(result, (form) => {
      form.setTitle('Sushi');
      form.setCategory('food');
      form.setCurrency('JPY');
      form.setEstimatedCost('1500.50');
    });
    await submit(result);
    expect(result.current.errors?.fields.cost).toBe('tooManyDecimals');

    await fill(result, (form) => form.setCurrency('USD'));

    expect(result.current.errors?.fields.cost).toBeUndefined();
  });

  it('keeps unrelated field errors when the start time changes', async () => {
    const { result } = await renderForm(null);
    await fill(result, (form) => form.setStartTime('10:00'));
    await submit(result);
    expect(result.current.errors?.fields).toMatchObject({ title: 'required', category: 'required' });

    await fill(result, (form) => form.setStartTime('11:00'));

    expect(result.current.errors?.fields).toMatchObject({ title: 'required', category: 'required' });
  });

  it('never warns that an activity being edited overlaps itself, but warns about its neighbours', async () => {
    const { result } = await renderForm(museum, null);
    expect(result.current.overlaps).toEqual([]);

    await fill(result, (form) => form.setEndTime('12:30'));

    expect(result.current.overlaps.map(({ id }) => id)).toEqual(['lunch']);
  });

  it('warns about an overlap only on the chosen day', async () => {
    const { result } = await renderForm(null, null);
    await fill(result, (form) => {
      form.setStartTime('10:00');
      form.setEndTime('12:30');
    });
    expect(result.current.overlaps).toEqual([]);

    await fill(result, (form) => form.setDate(DAY));

    expect(result.current.overlaps.map(({ id }) => id)).toEqual(['museum', 'lunch']);
  });

  it('is not dirty when an edit is changed and then changed back', async () => {
    const { result } = await renderForm(museum, null);
    expect(result.current.dirty).toBe(false);

    await fill(result, (form) => form.setTitle('Museum!'));
    expect(result.current.dirty).toBe(true);

    await fill(result, (form) => form.setTitle('Museum'));
    expect(result.current.dirty).toBe(false);
  });
});
