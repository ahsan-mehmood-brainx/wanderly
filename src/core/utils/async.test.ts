import { sleep, TIMED_OUT, withTimeout } from './async';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the value when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns TIMED_OUT when the deadline wins', async () => {
    const pending = withTimeout(new Promise<never>(() => undefined), 100);
    await jest.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe(TIMED_OUT);
  });

  it('propagates rejections', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });
});

describe('sleep', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves true after the delay', async () => {
    const pending = sleep(200);
    await jest.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toBe(true);
  });

  it('resolves false as soon as the signal aborts, clearing its timer', async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);

    controller.abort();

    await expect(pending).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolves false immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(10_000, controller.signal)).resolves.toBe(false);
  });
});
