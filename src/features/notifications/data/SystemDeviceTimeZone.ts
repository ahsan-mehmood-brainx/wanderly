import { parseLocalTime, type LocalTime } from '@/features/itinerary/domain/localTime';
import { localDateAt, parseLocalDate, type LocalDate } from '@/features/trips/domain/localDate';

import { type DeviceTimeZone } from '../domain/repositories';

/** The JS runtime's current zone, read on every call so a zone change is picked up. */
export class SystemDeviceTimeZone implements DeviceTimeZone {
  /** `NaN` for a date or time that doesn't parse, so the caller can skip it. */
  toEpochMs(date: LocalDate, time: LocalTime): number {
    const day = parseLocalDate(date);
    const clock = parseLocalTime(time);
    if (!day || !clock) return Number.NaN;
    return new Date(day.year, day.month - 1, day.day, clock.hour, clock.minute).getTime();
  }

  localDateAt(epochMs: number): LocalDate {
    return localDateAt(epochMs);
  }
}
