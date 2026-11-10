import { type Logger } from '@/core/logging/Logger';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';

/**
 * Every service the app depends on, typed by interface. Constructed once at the
 * composition root (`src/bootstrap/createAppContainer.ts`) and injected into
 * Redux thunks via `extraArgument`, so feature code never instantiates services.
 */
export interface AppDependencies {
  readonly logger: Logger;
  readonly preferencesRepository: PreferencesRepository;
}
