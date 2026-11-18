import { AppError } from '@/core/errors/AppError';
import { type HttpClient } from '@/core/http';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type Coordinates } from '../domain/Coordinates';
import { type WeatherRepository } from '../domain/repositories';
import { type WeatherForecast } from '../domain/Weather';
import { forecastDtoSchema } from './dto/openMeteoDtos';
import { FORECAST_PATH, forecastQuery } from './openMeteoApi';
import { toWeatherForecast } from './openMeteoMappers';

/**
 * Forecasts from Open-Meteo. The HTTP client handles timeouts, retries,
 * cancellation, offline detection and error mapping (a 400 with
 * `{ error: true, reason }` becomes `badRequest`); this class builds the request
 * and turns the validated response into a forecast.
 */
export class OpenMeteoWeatherRepository implements WeatherRepository {
  constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
  ) {}

  async getForecast(location: Coordinates, signal?: AbortSignal): Promise<Result<WeatherForecast, AppError>> {
    const response = await this.http.get(FORECAST_PATH, {
      query: forecastQuery(location),
      schema: forecastDtoSchema,
      signal,
    });
    if (!response.ok) return err(response.error);

    const forecast = toWeatherForecast(response.value.data, location, this.clock.now());
    // Valid JSON with no weather in it (every block missing or malformed) is as useless as a broken response.
    if (!forecast.current && forecast.hourly.length === 0 && forecast.daily.length === 0) {
      return err(new AppError('parse', 'The forecast contained no weather data'));
    }
    return ok(forecast);
  }
}
