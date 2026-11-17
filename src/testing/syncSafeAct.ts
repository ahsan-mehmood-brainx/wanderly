import { act as reactAct } from 'react';

/** RNTL's internal `act` module. Its functions read `act` from this object at call time. */
interface RntlActModule {
  act: (callback: () => unknown) => PromiseLike<unknown>;
  getIsReactActEnvironment: () => boolean | undefined;
  setReactActEnvironment: (value: boolean | undefined) => void;
}

const INSTALLED = Symbol.for('wanderly.syncSafeAct');

/**
 * RNTL's internal act module (not public API). Written for, and checked against,
 * @testing-library/react-native 14.1.x. On an RNTL upgrade, check this path and
 * the {@link RntlActModule} shape, and whether the patch is still needed at all.
 */
const RNTL_ACT_MODULE = '@testing-library/react-native/dist/act';
const WRITTEN_FOR = '@testing-library/react-native 14.1.x';

function patchError(problem: string): Error {
  return new Error(
    `installSyncSafeAct (src/testing/syncSafeAct.ts, installed by jest.afterEnv.ts): ${problem}. ` +
      `The patch was written for ${WRITTEN_FOR}; after an RNTL upgrade, update it to the new internals, ` +
      'or remove it if unawaited fireEvent/unmount calls no longer overlap act() scopes.',
  );
}

function loadRntlActModule(): RntlActModule {
  let actModule: Partial<RntlActModule> | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- RNTL internals, patched in place
    actModule = require(RNTL_ACT_MODULE) as Partial<RntlActModule>;
  } catch (cause) {
    throw patchError(`could not load '${RNTL_ACT_MODULE}' (${String(cause)})`);
  }
  if (
    typeof actModule?.act !== 'function' ||
    typeof actModule.getIsReactActEnvironment !== 'function' ||
    typeof actModule.setReactActEnvironment !== 'function'
  ) {
    throw patchError(`'${RNTL_ACT_MODULE}' no longer exports act, getIsReactActEnvironment and setReactActEnvironment`);
  }
  return actModule as RntlActModule;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';

/**
 * React Native Testing Library 14 runs every `act()` asynchronously, including the
 * ones behind `fireEvent`, `unmount` and `rerender`. A call that isn't awaited (the
 * RNTL 13 style, e.g. two quick taps, or `screen.unmount()` before rendering again)
 * then overlaps the next `act()`, React restores its act depth out of order, and no
 * later `act()` in the test file ever flushes: every following render silently does
 * nothing.
 *
 * This runs synchronous callbacks in React's synchronous `act()`, as RNTL 13 did, so
 * the scope closes before the call returns. Awaiting the call still waits for the
 * follow-up work React schedules. Async callbacks keep React's async `act()`.
 *
 * It is installed for every suite (jest.afterEnv.ts) because the tests that need it
 * are protected and can't be changed to await. Only synchronous callbacks behave
 * differently, and they behave as in RNTL 13. Fails loudly, with a pointer here, if
 * RNTL's internals change.
 */
export function installSyncSafeAct(): void {
  const actModule = loadRntlActModule();
  if (INSTALLED in actModule.act) return;

  const act = (callback: () => unknown): PromiseLike<unknown> => {
    const previous = actModule.getIsReactActEnvironment();
    actModule.setReactActEnvironment(true);
    let returnedThenable = false;
    let scope: PromiseLike<unknown>;
    try {
      scope = reactAct(() => {
        const result = callback();
        returnedThenable = isThenable(result);
        return result;
      }) as PromiseLike<unknown>;
    } catch (error) {
      actModule.setReactActEnvironment(previous);
      throw error;
    }

    if (!returnedThenable) {
      actModule.setReactActEnvironment(previous);
      // Lazy: React's follow-up flush runs only when the call is awaited.
      return { then: (onFulfilled, onRejected) => scope.then(onFulfilled, onRejected) };
    }

    // Subscribe now so the async scope always closes, awaited or not.
    return new Promise((resolve, reject) => {
      scope.then(
        (value) => {
          actModule.setReactActEnvironment(previous);
          resolve(value);
        },
        (error: unknown) => {
          actModule.setReactActEnvironment(previous);
          reject(error);
        },
      );
    });
  };

  actModule.act = Object.assign(act, { [INSTALLED]: true });
}
