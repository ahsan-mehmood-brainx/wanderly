import { type installSyncSafeAct } from './syncSafeAct';

const RNTL_ACT_MODULE = '@testing-library/react-native/dist/act';

interface SyncSafeActModule {
  readonly installSyncSafeAct: typeof installSyncSafeAct;
}

/** Loads a fresh copy of the patch against a stand-in for RNTL's internal act module. */
function installAgainst(actModule: () => unknown): () => void {
  return () =>
    jest.isolateModules(() => {
      jest.doMock(RNTL_ACT_MODULE, actModule);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module under the mock above
      (require('./syncSafeAct') as SyncSafeActModule).installSyncSafeAct();
    });
}

describe('installSyncSafeAct', () => {
  afterEach(() => jest.dontMock(RNTL_ACT_MODULE));

  it('fails with a pointer to the patch when RNTL no longer exposes the act internals', () => {
    const install = installAgainst(() => ({ act: () => Promise.resolve() }));

    expect(install).toThrow(
      /syncSafeAct\.ts.*no longer exports act, getIsReactActEnvironment and setReactActEnvironment/,
    );
    expect(install).toThrow(/@testing-library\/react-native 14\.1\.x/);
  });

  it('fails with a pointer to the patch when the module cannot be loaded', () => {
    const install = installAgainst(() => {
      throw new Error("Cannot find module './act'");
    });

    expect(install).toThrow(/syncSafeAct\.ts.*could not load '@testing-library\/react-native\/dist\/act'/);
  });
});
