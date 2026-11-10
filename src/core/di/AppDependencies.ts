import { type PreferencesDependencies } from '@/features/preferences/di';

import { type CoreDependencies } from './CoreDependencies';

/**
 * Every service the app depends on, typed by interface: core infrastructure plus
 * what each feature module contributes. Built once by the container at the
 * composition root (`src/bootstrap/createAppContainer.ts`) and injected into
 * Redux thunks via `extraArgument` and into components via `useDependencies()`,
 * so feature code never instantiates services.
 *
 * Adding a feature: define `<Feature>Dependencies` + factories in `features/<name>/di.ts`,
 * intersect the interface here and spread the factories in `createAppContainer`.
 */
export type AppDependencies = CoreDependencies & PreferencesDependencies;
