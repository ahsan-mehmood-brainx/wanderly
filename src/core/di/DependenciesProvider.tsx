import { createContext, useContext, type ReactNode } from 'react';

import { type AppDependencies } from './AppDependencies';

const DependenciesContext = createContext<AppDependencies | null>(null);

interface DependenciesProviderProps {
  readonly dependencies: AppDependencies;
  readonly children: ReactNode;
}

/** Makes the container available to hooks that need a service outside Redux (e.g. connectivity). */
export function DependenciesProvider({ dependencies, children }: DependenciesProviderProps) {
  return <DependenciesContext.Provider value={dependencies}>{children}</DependenciesContext.Provider>;
}

/**
 * Access injected services from a component or hook. Destructure only what you
 * need: services are created lazily on first access.
 *
 * Prefer view-model hooks and thunks over calling this directly in screens.
 */
export function useDependencies(): AppDependencies {
  const dependencies = useContext(DependenciesContext);
  if (!dependencies) throw new Error('useDependencies must be used inside <DependenciesProvider>');
  return dependencies;
}
