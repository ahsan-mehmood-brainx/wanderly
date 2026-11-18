import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { StoragePreferencesRepository } from './data/StoragePreferencesRepository';
import { type Preferences } from './domain/Preferences';
import { type PreferencesRepository } from './domain/PreferencesRepository';
import { LoadPreferences } from './domain/usecases/LoadPreferences';
import { SavePreferences } from './domain/usecases/SavePreferences';

/** Services the preferences feature contributes to the app container, typed by interface. */
export interface PreferencesDependencies {
  readonly preferencesRepository: PreferencesRepository;
  readonly loadPreferences: UseCase<void, Preferences>;
  readonly savePreferences: UseCase<Partial<Preferences>, Result<void, AppError>>;
}

/**
 * The feature's DI module: the only place it chooses its concrete classes.
 * Factories resolve collaborators from the container by name, so overriding
 * `preferencesRepository` (e.g. with a mock) also reaches the use cases.
 */
export const preferencesFactories: Factories<PreferencesDependencies, CoreDependencies & PreferencesDependencies> = {
  preferencesRepository: (c) => new StoragePreferencesRepository(c.keyValueStore, c.logger),
  loadPreferences: (c) => new LoadPreferences(c.preferencesRepository, c.logger),
  savePreferences: (c) => new SavePreferences(c.preferencesRepository, c.logger),
};
