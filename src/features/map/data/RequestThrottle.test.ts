import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { RequestThrottle } from './RequestThrottle';

/** Follows Jest's fake clock, so the throttle's notion of "now" moves with the timers. */
const fakeTimeClock: Clock = { now: () => Date.now() };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const task = (value: string) => jest.fn(async (): Promise<Result<string, AppError>> => ok(value));

describe('RequestThrottle', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('runs the first task straight away', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    const first = task('a');

    const result = await throttle.run(first);

    expect(result).toEqual({ ok: true, value: 'a' });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('keeps at least the minimum interval between the starts of two tasks', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    const first = task('a');
    const second = task('b');

    await throttle.run(first);
    const pending = throttle.run(second);

    await jest.advanceTimersByTimeAsync(999);
    expect(second).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(second).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toEqual({ ok: true, value: 'b' });
  });

  it('does not wait when the interval has already passed', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    await throttle.run(task('a'));
    await jest.advanceTimersByTimeAsync(5_000);
    const second = task('b');

    void throttle.run(second);
    await jest.advanceTimersByTimeAsync(0);

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('runs one task at a time, even when the interval has passed', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 2_000, clock: fakeTimeClock });
    const slow = deferred<Result<string, AppError>>();
    const first = jest.fn(() => slow.promise);
    const second = task('b');

    const firstRun = throttle.run(first);
    const secondRun = throttle.run(second);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    slow.resolve(ok('a'));
    await expect(firstRun).resolves.toEqual({ ok: true, value: 'a' });
    await jest.advanceTimersByTimeAsync(0);
    expect(second).toHaveBeenCalledTimes(1);
    await expect(secondRun).resolves.toEqual({ ok: true, value: 'b' });
  });

  it('returns cancelled, without running the task, when aborted while waiting its turn', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    await throttle.run(task('a'));
    const controller = new AbortController();
    const second = task('b');

    const pending = throttle.run(second, controller.signal);
    await jest.advanceTimersByTimeAsync(500);
    controller.abort();
    const result = await pending;

    expect(!result.ok && result.error.kind).toBe('cancelled');
    await jest.advanceTimersByTimeAsync(5_000);
    expect(second).not.toHaveBeenCalled();
  });

  it('returns cancelled for an already aborted signal', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    const controller = new AbortController();
    controller.abort();
    const first = task('a');

    const result = await throttle.run(first, controller.signal);

    expect(!result.ok && result.error.kind).toBe('cancelled');
    expect(first).not.toHaveBeenCalled();
  });

  it('does not let a cancelled task hold up the next one', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    await throttle.run(task('a'));
    const controller = new AbortController();
    const cancelled = throttle.run(task('b'), controller.signal);
    controller.abort();
    await cancelled;
    const third = task('c');

    const pending = throttle.run(third);
    await jest.advanceTimersByTimeAsync(1_000);

    expect(third).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toEqual({ ok: true, value: 'c' });
  });

  it('returns rateLimited without running tasks during a cooldown, then recovers', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    throttle.coolDown(Date.now() + 30_000);
    const during = task('a');

    const refused = await throttle.run(during);

    expect(!refused.ok && refused.error.kind).toBe('rateLimited');
    expect(during).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_000);
    const after = task('b');
    const pending = throttle.run(after);
    await jest.advanceTimersByTimeAsync(0);
    expect(after).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toEqual({ ok: true, value: 'b' });
  });
});
