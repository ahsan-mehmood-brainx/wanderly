import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

import { ExpoLocationService } from './data/ExpoLocationService';
import { NominatimGeocodingService } from './data/NominatimGeocodingService';
import { NOMINATIM_API, OVERPASS_API } from './data/osmApis';
import { OsmPlacesRepository } from './data/OsmPlacesRepository';
import { OverpassPlacesApiService } from './data/OverpassPlacesApiService';
import { StorageCustomMarkerRepository } from './data/StorageCustomMarkerRepository';
import { type CustomMarker, type LocationSearchResult, type Place } from './domain/Place';
import { type CustomMarkerRepository, type LocationService, type PlacesRepository } from './domain/repositories';
import {
  AddCustomMarker,
  type AddCustomMarkerInput,
  type AddCustomMarkerOutcome,
  LoadCustomMarkers,
  RemoveCustomMarker,
  type RemoveCustomMarkerInput,
} from './domain/usecases/customMarkers';
import { GetNearbyPlaces, type GetNearbyPlacesInput } from './domain/usecases/GetNearbyPlaces';
import {
  CheckMapLocationPermission,
  GetCurrentLocation,
  type GetCurrentLocationInput,
  RequestMapLocationPermission,
} from './domain/usecases/locationUseCases';
import { SearchPlaces, type SearchPlacesInput } from './domain/usecases/SearchPlaces';

export interface MapDependencies {
  readonly mapLocationService: LocationService;
  readonly placesRepository: PlacesRepository;
  readonly customMarkerRepository: CustomMarkerRepository;
  readonly searchPlaces: UseCase<SearchPlacesInput, Result<readonly LocationSearchResult[], AppError>>;
  readonly getNearbyPlaces: UseCase<GetNearbyPlacesInput, Result<readonly Place[], AppError>>;
  readonly getCurrentLocation: UseCase<GetCurrentLocationInput, Result<Coordinates, AppError>>;
  readonly checkMapLocationPermission: UseCase<void, LocationPermission>;
  readonly requestMapLocationPermission: UseCase<void, LocationPermission>;
  readonly loadCustomMarkers: UseCase<void, readonly CustomMarker[]>;
  readonly addCustomMarker: UseCase<AddCustomMarkerInput, AddCustomMarkerOutcome>;
  readonly removeCustomMarker: UseCase<RemoveCustomMarkerInput, Result<readonly CustomMarker[], AppError>>;
}

export const mapFactories: Factories<MapDependencies, CoreDependencies & MapDependencies> = {
  mapLocationService: (c) => new ExpoLocationService(c.logger.child({ scope: 'mapLocation' })),
  placesRepository: (c) =>
    new OsmPlacesRepository(
      new NominatimGeocodingService(c.httpClientFactory.create(NOMINATIM_API), c.clock),
      new OverpassPlacesApiService(c.httpClientFactory.create(OVERPASS_API), c.clock),
      c.clock,
    ),
  customMarkerRepository: (c) =>
    new StorageCustomMarkerRepository(c.keyValueStore, c.logger.child({ scope: 'customMarkers' })),
  searchPlaces: (c) => new SearchPlaces(c.placesRepository),
  getNearbyPlaces: (c) => new GetNearbyPlaces(c.placesRepository),
  getCurrentLocation: (c) => new GetCurrentLocation(c.mapLocationService),
  checkMapLocationPermission: (c) => new CheckMapLocationPermission(c.mapLocationService),
  requestMapLocationPermission: (c) => new RequestMapLocationPermission(c.mapLocationService),
  loadCustomMarkers: (c) => new LoadCustomMarkers(c.customMarkerRepository),
  addCustomMarker: (c) => new AddCustomMarker(c.customMarkerRepository, c.clock, c.idGenerator),
  removeCustomMarker: (c) => new RemoveCustomMarker(c.customMarkerRepository),
};
