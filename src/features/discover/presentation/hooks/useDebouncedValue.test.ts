import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('only settles once the value stops changing for the delay', async () => {
    const { result, rerender } = await renderHook((props: { value: string }) => useDebouncedValue(props.value, 300), {
      initialProps: { value: 'l' },
    });
    expect(result.current).toEqual(['l', false]);

    await rerender({ value: 'li' });
    await act(async () => jest.advanceTimersByTime(200));
    await rerender({ value: 'lis' });
    await act(async () => jest.advanceTimersByTime(200));

    // 400 ms after the first keystroke, but only 200 ms after the last: still waiting.
    expect(result.current).toEqual(['l', true]);

    await act(async () => jest.advanceTimersByTime(100));
    expect(result.current).toEqual(['lis', false]);
  });
});
