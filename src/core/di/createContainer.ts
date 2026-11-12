/**
 * One factory per service. A factory receives the container, so it resolves its
 * own dependencies by name and never imports a concrete implementation it doesn't create.
 *
 * `TAll` lets a feature declare factories that only need part of the app's services
 * (Interface Segregation) while still type-checking when merged into the root container.
 */
export type Factories<TProvided, TAll = TProvided> = {
  readonly [K in keyof TProvided]: (container: TAll) => TProvided[K];
};

export class CircularDependencyError extends Error {
  constructor(readonly path: readonly PropertyKey[]) {
    super(`Circular dependency: ${path.map(String).join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Builds a typed dependency-injection container from a map of factories.
 *
 * - **Lazy:** a service is constructed the first time it is read, so start-up only pays for what it uses.
 * - **Singleton per container:** each factory runs at most once; later reads return the same instance.
 *   Tests build a fresh container per test, so no state leaks between them.
 * - **Safe:** cycles throw {@link CircularDependencyError} naming the path, instead of overflowing the stack.
 *
 * The result is a plain, frozen object typed as `T`, so consumers depend on an interface
 * (`AppDependencies`) and never on the container itself (no service locator).
 */
export function createContainer<T extends object>(factories: Factories<T>): T {
  const instances = new Map<keyof T, unknown>();
  const resolving: (keyof T)[] = [];
  const container = {} as T;

  for (const key of Object.keys(factories) as (keyof T)[]) {
    Object.defineProperty(container, key, {
      enumerable: true,
      get() {
        if (instances.has(key)) return instances.get(key);
        if (resolving.includes(key)) throw new CircularDependencyError([...resolving, key]);

        resolving.push(key);
        try {
          const instance = factories[key](container);
          instances.set(key, instance);
          return instance;
        } finally {
          resolving.pop();
        }
      },
    });
  }

  return Object.freeze(container);
}

/** Wraps ready-made instances as factories; used to override services (e.g. with mocks in tests). */
export function valueFactories<T>(values: Partial<T>): Partial<Factories<T>> {
  const factories: Partial<Record<keyof T, () => unknown>> = {};
  for (const key of Object.keys(values) as (keyof T)[]) {
    const value = values[key];
    if (value !== undefined) factories[key] = () => value;
  }
  return factories as Partial<Factories<T>>;
}
