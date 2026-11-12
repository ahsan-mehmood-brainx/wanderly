import { z } from 'zod';

import { type Logger } from '@/core/logging/Logger';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import { type Coordinates, coordinatesKey } from '../domain/Coordinates';
import { type WeatherCache } from '../domain/repositories';
import { WEATHER_CONDITIONS, type WeatherForecast } from '../domain/Weather';

export const WEATHER_CACHE_KEY = 'weather.forecasts.v1';

/** A forecast is ~20 KB of JSON; a handful covers a trip's destinations and the current position. */
export const MAX_SAVED_FORECASTS = 6;

const value = z.number().nullable().catch(null);

const conditionsSchema = z.object({
  time: z.number(),
  condition: z.enum(WEATHER_CONDITIONS).catch('unknown'),
  isDay: z.boolean().nullable().catch(null),
  temperatureC: value,
  feelsLikeC: value,
  humidityPercent: value,
  windSpeedKmh: value,
  windDirectionDeg: value,
  precipitationProbability: value,
});

const dailySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.number(),
  condition: z.enum(WEATHER_CONDITIONS).catch('unknown'),
  maxTemperatureC: value,
  minTemperatureC: value,
  precipitationProbability: value,
  precipitationMm: value,
  uvIndexMax: value,
  windSpeedMaxKmh: value,
  sunrise: value,
  sunset: value,
  daylight: z.enum(['normal', 'polarDay', 'polarNight']).nullable().catch(null),
});

/** Saved forecasts are validated like any other input: a corrupt or outdated entry is a cache miss, not a crash. */
const forecastSchema = z.object({
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  timeZone: z.object({
    id: z.string().nullable().catch(null),
    abbreviation: z.string().nullable().catch(null),
    utcOffsetSeconds: z.number(),
  }),
  current: conditionsSchema.nullable().catch(null),
  hourly: z.array(conditionsSchema),
  daily: z.array(dailySchema),
  fetchedAt: z.number(),
}) satisfies z.ZodType<WeatherForecast>;

/** Most recently saved first. */
const entriesSchema = z.array(z.unknown());

/** Recent forecasts in plain device storage (weather isn't sensitive), most recent first. */
export class StorageWeatherCache implements WeatherCache {
  /**
   * Saves rewrite the whole list, so they run one after another: two forecasts
   * downloaded at once (e.g. a destination and the device's position, both
   * refreshed on reconnect) would otherwise each overwrite the other's entry.
   */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async load(location: Coordinates): Promise<WeatherForecast | null> {
    const key = coordinatesKey(location);
    for (const entry of await this.readAll()) {
      if (coordinatesKey(entry.location) === key) return entry;
    }
    return null;
  }

  save(forecast: WeatherForecast): Promise<void> {
    // `write` never rejects, so one failed save can't stall the ones queued after it.
    this.writes = this.writes.then(() => this.write(forecast));
    return this.writes;
  }

  private async write(forecast: WeatherForecast): Promise<void> {
    const key = coordinatesKey(forecast.location);
    const others = (await this.readAll()).filter((entry) => coordinatesKey(entry.location) !== key);
    const entries = [forecast, ...others].slice(0, MAX_SAVED_FORECASTS);
    try {
      await this.store.setItem(WEATHER_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      this.logger.warn('Could not save the forecast', { error });
    }
  }

  private async readAll(): Promise<WeatherForecast[]> {
    let raw: string | null;
    try {
      raw = await this.store.getItem(WEATHER_CACHE_KEY);
    } catch (error) {
      this.logger.warn('Could not read saved forecasts', { error });
      return [];
    }
    if (!raw) return [];

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return [];
    }
    const list = entriesSchema.safeParse(json);
    if (!list.success) return [];
    // Entry by entry, so one corrupt forecast doesn't discard the others.
    return list.data.flatMap((entry) => {
      const parsed = forecastSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  }
}
