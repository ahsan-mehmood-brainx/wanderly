import { act, renderHook } from '@testing-library/react-native';

import { ManualClock } from '@/testing/ManualClock';

import { useLockoutCountdown } from './useLockoutCountdown';

describe('useLockoutCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts down once a second and reaches zero when the cooldown ends', async () => {
    const clock = new ManualClock(0);
    const { result } = await renderHook(() => useLockoutCountdown(30_000, clock));
    expect(result.current).toBe(30);

    clock.advance(1000);
    await act(() => jest.advanceTimersByTimeAsync(1000));
    expect(result.current).toBe(29);

    clock.advance(29_000);
    await act(() => jest.advanceTimersByTimeAsync(1000));
    expect(result.current).toBe(0);
  });

  it('is zero without a cooldown', async () => {
    const { result } = await renderHook(() => useLockoutCountdown(null, new ManualClock()));
    expect(result.current).toBe(0);
  });
});
