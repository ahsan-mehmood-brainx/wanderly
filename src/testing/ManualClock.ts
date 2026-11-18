import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

/** Clock that only moves when told to. */
export class ManualClock implements Clock {
  constructor(private current = 0) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

/** Predictable ids: `test-1`, `test-2`, ... */
export function sequentialIds(prefix = 'test'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
