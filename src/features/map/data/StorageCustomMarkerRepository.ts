import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import { checkCoordinates } from '../domain/geo';
import { type CustomMarker, MAX_CUSTOM_MARKERS } from '../domain/Place';
import { type CustomMarkerRepository } from '../domain/repositories';

export const CUSTOM_MARKERS_KEY = 'map.customMarkers.v1';

const customMarkerSchema = z.object({
  id: z.string().min(1),
  coordinates: z
    .object({ latitude: z.number(), longitude: z.number() })
    .refine((coordinates) => checkCoordinates(coordinates).ok),
  createdAt: z.number().catch(0),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Pins in plain device storage, parsed entry by entry so one corrupt pin doesn't lose the rest. */
export class StorageCustomMarkerRepository implements CustomMarkerRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<readonly CustomMarker[]> {
    let raw: string | null;
    try {
      raw = await this.store.getItem(CUSTOM_MARKERS_KEY);
    } catch (cause) {
      this.logger.warn('Could not read saved map pins; starting empty', { cause });
      return [];
    }
    const stored = raw === null ? undefined : parseJson(raw);
    if (!Array.isArray(stored)) return [];

    const markers: CustomMarker[] = [];
    for (const entry of stored) {
      const parsed = customMarkerSchema.safeParse(entry);
      if (parsed.success) markers.push(parsed.data);
    }
    if (markers.length < stored.length) {
      this.logger.warn('Dropped unreadable saved map pins', { dropped: stored.length - markers.length });
    }
    return markers.slice(0, MAX_CUSTOM_MARKERS);
  }

  async save(markers: readonly CustomMarker[]): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(CUSTOM_MARKERS_KEY, JSON.stringify(markers));
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to save map pins', { cause }));
    }
  }
}
