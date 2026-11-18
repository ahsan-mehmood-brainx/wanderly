import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { ExpoDeviceLocationService } from './data/ExpoDeviceLocationService';
import { OPEN_METEO_API } from './data/openMeteoApi';
import { OpenMeteoWeatherRepository } from './data/OpenMeteoWeatherRepository';
import { StorageWeatherCache } from './data/StorageWeatherCache';
import { type Coordinates } from './domain/Coordinates';
import {
  type DeviceLocationService,
  type LocationPermission,
  type WeatherCache,
  type WeatherRepository,
} from './domain/repositories';
import {
  GetDeviceLocation,
  type GetDeviceLocationInput,
  GetLocationPermission,
  RequestLocationPermission,
} from './domain/usecases/deviceLocation';
import { GetWeatherForecast, type GetWeatherForecastInput } from './domain/usecases/GetWeatherForecast';
import { type WeatherReport } from './domain/Weather';

export interface WeatherDependencies {
  readonly weatherRepository: WeatherRepository;
  readonly weatherCache: WeatherCache;
  readonly deviceLocationService: DeviceLocationService;
  readonly getWeatherForecast: UseCase<GetWeatherForecastInput, Result<WeatherReport, AppError>>;
  readonly getDeviceLocation: UseCase<GetDeviceLocationInput, Result<Coordinates, AppError>>;
  readonly getLocationPermission: UseCase<void, LocationPermission>;
  readonly requestLocationPermission: UseCase<void, LocationPermission>;
}

export const weatherFactories: Factories<WeatherDependencies, CoreDependencies & WeatherDependencies> = {
  weatherRepository: (c) => new OpenMeteoWeatherRepository(c.httpClientFactory.create(OPEN_METEO_API), c.clock),
  weatherCache: (c) => new StorageWeatherCache(c.keyValueStore, c.logger.child({ scope: 'weatherCache' })),
  deviceLocationService: (c) => new ExpoDeviceLocationService(c.logger.child({ scope: 'location' })),
  getWeatherForecast: (c) =>
    new GetWeatherForecast(c.weatherRepository, c.weatherCache, c.clock, c.logger.child({ scope: 'weather' })),
  getDeviceLocation: (c) => new GetDeviceLocation(c.deviceLocationService),
  getLocationPermission: (c) => new GetLocationPermission(c.deviceLocationService),
  requestLocationPermission: (c) => new RequestLocationPermission(c.deviceLocationService),
};
