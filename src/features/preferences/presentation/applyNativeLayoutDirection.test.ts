import { I18nManager, Platform } from 'react-native';

import { applyNativeLayoutDirection } from './applyNativeLayoutDirection';

describe('applyNativeLayoutDirection', () => {
  let allowRTL: jest.SpyInstance;
  let forceRTL: jest.SpyInstance;

  beforeEach(() => {
    allowRTL = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
    forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-02 allows and forces right to left for Urdu', () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);

    const result = applyNativeLayoutDirection('ur');

    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(result).toEqual({ restartRequired: true });
  });

  it.each(['en', 'es'] as const)('TC-02 turns right to left off for %s', (language) => {
    jest.replaceProperty(I18nManager, 'isRTL', false);

    const result = applyNativeLayoutDirection(language);

    expect(allowRTL).toHaveBeenCalledWith(false);
    expect(forceRTL).toHaveBeenCalledWith(false);
    expect(result).toEqual({ restartRequired: false });
  });

  it('TC-02 needs no restart when the native layout is already right to left for Urdu', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);

    expect(applyNativeLayoutDirection('ur')).toEqual({ restartRequired: false });
    expect(forceRTL).toHaveBeenCalledWith(true);
  });

  it('TC-02 needs a restart to return to left to right', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);

    expect(applyNativeLayoutDirection('en')).toEqual({ restartRequired: true });
    expect(forceRTL).toHaveBeenCalledWith(false);
  });

  it('TC-02 does nothing on web', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    jest.replaceProperty(I18nManager, 'isRTL', false);

    expect(applyNativeLayoutDirection('ur')).toEqual({ restartRequired: false });
    expect(allowRTL).not.toHaveBeenCalled();
    expect(forceRTL).not.toHaveBeenCalled();
  });
});
