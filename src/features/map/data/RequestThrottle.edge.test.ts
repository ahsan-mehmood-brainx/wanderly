import { type AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { RequestThrottle } from './RequestThrottle';

const fakeTimeClock: Clock = { now: () => Date.now() };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const task = (value: string) => jest.fn(async (): Promise<Result<string, AppError>> => ok(value));

describe('RequestThrottle edge cases', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('never runs the next task alongside a running one when a task queued between them is cancelled', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 0, clock: fakeTimeClock });
    const slow = deferred<Result<string, AppError>>();
    const first = jest.fn(() => slow.promise);
    const controller = new AbortController();
    const third = task('c');

    const firstRun = throttle.run(first);
    const cancelled = throttle.run(task('b'), controller.signal);
    const thirdRun = throttle.run(third);
    controller.abort();
    await cancelled;
    await jest.advanceTimersByTimeAsync(10_000);

    expect(third).not.toHaveBeenCalled();

    slow.resolve(ok('a'));
    await firstRun;
    await jest.advanceTimersByTimeAsync(0);
    expect(third).toHaveBeenCalledTimes(1);
    await expect(thirdRun).resolves.toEqual({ ok: true, value: 'c' });
  });

  it('releases the queue when a task throws, so later tasks still run', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    const failing = jest.fn(async (): Promise<Result<string, AppError>> => {
      throw new Error('boom');
    });
    const next = task('b');

    await expect(throttle.run(failing)).rejects.toThrow('boom');
    const pending = throttle.run(next);
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({ ok: true, value: 'b' });
  });

  it('refuses tasks already queued when a 429 cooldown starts while they wait', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    const queued = task('b');
    const first = jest.fn(async (): Promise<Result<string, AppError>> => {
      throttle.coolDown(Date.now() + 30_000);
      return err({ kind: 'rateLimited' } as AppError);
    });

    const firstRun = throttle.run(first);
    const queuedRun = throttle.run(queued);
    await firstRun;
    await jest.advanceTimersByTimeAsync(5_000);

    const result = await queuedRun;
    expect(!result.ok && result.error.kind).toBe('rateLimited');
    expect(queued).not.toHaveBeenCalled();
  });

  it('keeps the longer cooldown when a shorter one is requested later', async () => {
    const throttle = new RequestThrottle({ minIntervalMs: 1_000, clock: fakeTimeClock });
    throttle.coolDown(Date.now() + 30_000);
    throttle.coolDown(Date.now() + 1_000);
    await jest.advanceTimersByTimeAsync(5_000);
    const during = task('a');

    const result = await throttle.run(during);

    expect(!result.ok && result.error.kind).toBe('rateLimited');
    expect(during).not.toHaveBeenCalled();
  });
});
