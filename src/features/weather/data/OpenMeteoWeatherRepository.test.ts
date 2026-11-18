import { AxiosHttpClientFactory, ExponentialBackoffRetry } from '@/core/http';
import { httpFailure } from '@/testing/discoverFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter, type MockReply } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';
import { forecastDto, stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { FORECAST_PATH, OPEN_METEO_API } from './openMeteoApi';
import { OpenMeteoWeatherRepository } from './OpenMeteoWeatherRepository';

const LISBON = { latitude: 38.72, longitude: -9.14 };

function setup() {
  const factory = new FakeHttpClientFactory();
  const http = stubWeatherApi(factory);
  const repository = new OpenMeteoWeatherRepository(factory.create(OPEN_METEO_API), new ManualClock(WEATHER_NOW));
  return { repository, http };
}

describe('OpenMeteoWeatherRepository (fake HTTP)', () => {
  it('requests every variable in local time and unix time, and passes the signal through', async () => {
    const { repository, http } = setup();
    const controller = new AbortController();

    const result = await repository.getForecast(LISBON, controller.signal);

    if (!result.ok) throw result.error;
    expect(result.value.fetchedAt).toBe(WEATHER_NOW);
    expect(http.requests[0]?.path).toBe(FORECAST_PATH);
    expect(http.requests[0]?.signal).toBe(controller.signal);
    expect(http.requests[0]?.query).toEqual({
      latitude: 38.72,
      longitude: -9.14,
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code,is_day',
      hourly:
        'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code,is_day',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset,daylight_duration',
      timezone: 'auto',
      timeformat: 'unixtime',
      forecast_days: 7,
    });
  });

  it('propagates HTTP failures with their kind', async () => {
    const { repository, http } = setup();
    http.on('GET', FORECAST_PATH, httpFailure('badRequest', 400));

    const result = await repository.getForecast(LISBON);

    expect(!result.ok && result.error.kind).toBe('badRequest');
  });

  it('treats a response with no weather in it as unparseable', async () => {
    const { repository, http } = setup();
    http.on('GET', FORECAST_PATH, apiSuccess({ latitude: 38.7, longitude: -9.1, utc_offset_seconds: 0 }));

    const result = await repository.getForecast(LISBON);

    expect(!result.ok && result.error.kind).toBe('parse');
  });
});

describe('OpenMeteoWeatherRepository (real HTTP client)', () => {
  function realClient(...replies: MockReply[]) {
    const { adapter, requests } = createMockAxiosAdapter(...replies);
    const factory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock: new ManualClock(),
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1_000, retry: new ExponentialBackoffRetry({ maxRetries: 2, random: () => 0 }) },
      adapter,
      sleep: () => Promise.resolve(true),
    });
    return { repository: new OpenMeteoWeatherRepository(factory.create(OPEN_METEO_API), new ManualClock()), requests };
  }

  it('retries a timeout once, then reports it as a timeout', async () => {
    const { repository, requests } = realClient({ timeout: true });

    const result = await repository.getForecast(LISBON);

    expect(!result.ok && result.error.kind).toBe('timeout');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.timeout).toBe(10_000);
  });

  it('recovers when the retry succeeds', async () => {
    const { repository } = realClient({ timeout: true }, { status: 200, data: forecastDto() });

    const result = await repository.getForecast(LISBON);

    expect(result.ok).toBe(true);
  });

  it("maps the API's 400 error body to badRequest without retrying", async () => {
    const { repository, requests } = realClient({
      status: 400,
      data: { error: true, reason: 'Latitude must be in range of -90 to 90°. Given: 95.0.' },
    });

    const result = await repository.getForecast(LISBON);

    expect(!result.ok && result.error.kind).toBe('badRequest');
    expect(requests).toHaveLength(1);
  });

  it('reports a 200 with an error body as a parse error', async () => {
    const { repository } = realClient({ status: 200, data: { error: true, reason: 'Something odd' } });

    const result = await repository.getForecast(LISBON);

    expect(!result.ok && result.error.kind).toBe('parse');
  });
});
