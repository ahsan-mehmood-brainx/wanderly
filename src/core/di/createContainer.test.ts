import { CircularDependencyError, createContainer, type Factories, valueFactories } from './createContainer';

interface Services {
  readonly greeting: string;
  readonly greeter: { greet(name: string): string };
}

const factories: Factories<Services> = {
  greeting: () => 'Hello',
  greeter: (c) => ({ greet: (name) => `${c.greeting}, ${name}` }),
};

describe('createContainer', () => {
  it('resolves services and their dependencies by name', () => {
    const container = createContainer(factories);
    expect(container.greeter.greet('Ada')).toBe('Hello, Ada');
  });

  it('creates each service lazily, on first access only', () => {
    const greeter = jest.fn(factories.greeter);
    const container = createContainer({ ...factories, greeter });

    expect(greeter).not.toHaveBeenCalled();
    void container.greeter;
    expect(greeter).toHaveBeenCalledTimes(1);
  });

  it('returns the same instance on every access (singleton per container)', () => {
    const container = createContainer(factories);
    expect(container.greeter).toBe(container.greeter);
  });

  it('gives each container its own instances', () => {
    expect(createContainer(factories).greeter).not.toBe(createContainer(factories).greeter);
  });

  it('lets an override reach every service that depends on it', () => {
    const container = createContainer<Services>({ ...factories, ...valueFactories<Services>({ greeting: 'Hola' }) });
    expect(container.greeter.greet('Ada')).toBe('Hola, Ada');
  });

  it('ignores undefined overrides', () => {
    const container = createContainer<Services>({ ...factories, ...valueFactories<Services>({ greeting: undefined }) });
    expect(container.greeting).toBe('Hello');
  });

  it('reports circular dependencies with the full path', () => {
    interface Cyclic {
      readonly a: number;
      readonly b: number;
    }
    const container = createContainer<Cyclic>({ a: (c) => c.b, b: (c) => c.a });

    expect(() => container.a).toThrow(CircularDependencyError);
    expect(() => container.a).toThrow('Circular dependency: a -> b -> a');
  });

  it('retries a factory that threw instead of caching the failure', () => {
    let calls = 0;
    const container = createContainer<{ readonly flaky: number }>({
      flaky: () => {
        calls += 1;
        if (calls === 1) throw new Error('first call fails');
        return calls;
      },
    });

    expect(() => container.flaky).toThrow('first call fails');
    expect(container.flaky).toBe(2);
  });

  it('is frozen so services cannot be swapped at runtime', () => {
    const container = createContainer(factories);
    expect(Object.isFrozen(container)).toBe(true);
  });
});
