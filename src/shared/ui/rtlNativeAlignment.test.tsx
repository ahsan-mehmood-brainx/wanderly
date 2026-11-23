import { screen } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { I18nManager, Platform, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { LayoutDirectionProvider } from '@/core/i18n/LayoutDirectionProvider';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppIcon } from './AppIcon';
import { AppInput } from './AppInput';
import { AppText } from './AppText';

function renderIn(language: SupportedLanguage, ui: ReactElement) {
  return renderWithProviders(<LayoutDirectionProvider language={language}>{ui}</LayoutDirectionProvider>);
}

const ownStyle = (element: { props: { style?: unknown } }): TextStyle =>
  StyleSheet.flatten(element.props.style as StyleProp<TextStyle>) ?? {};

type Element = ReturnType<typeof screen.getByText>;

function isMirrored(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parent) {
    const transform = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.transform;
    if (Array.isArray(transform) && transform.some((step) => 'scaleX' in step && step.scaleX === -1)) return true;
  }
  return false;
}

const icon = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

describe('RTL alignment survives native left/right resolution', () => {
  // Native text treats left/right as logical when the node's own layout is RTL,
  // so a resolved physical side must sit on a node laid out LTR.
  it('pins aligned Urdu text to LTR layout so the physical side is not flipped again', async () => {
    await renderIn(
      'ur',
      <>
        <AppText align="start">Start</AppText>
        <AppText align="end">End</AppText>
      </>,
    );

    expect(ownStyle(screen.getByText('Start'))).toMatchObject({ textAlign: 'right', direction: 'ltr' });
    expect(ownStyle(screen.getByText('End'))).toMatchObject({ textAlign: 'left', direction: 'ltr' });
    expect(ownStyle(screen.getByText('Start')).writingDirection).toBe('rtl');
  });

  it('leaves unaligned and physically aligned Urdu text in the inherited direction', async () => {
    await renderIn(
      'ur',
      <>
        <AppText>Body</AppText>
        <AppText align="right">Right</AppText>
        <AppText align="center">Centre</AppText>
      </>,
    );

    expect(ownStyle(screen.getByText('Body')).direction).toBeUndefined();
    expect(ownStyle(screen.getByText('Right')).direction).toBeUndefined();
    expect(ownStyle(screen.getByText('Centre')).direction).toBeUndefined();
  });

  it('does not set a direction on aligned English text', async () => {
    await renderIn('en', <AppText align="start">Start</AppText>);

    expect(ownStyle(screen.getByText('Start')).direction).toBeUndefined();
  });

  it('pins the Urdu input to LTR layout so right alignment stays physical', async () => {
    await renderIn('ur', <AppInput label="Name" />);

    expect(ownStyle(screen.getByLabelText('Name'))).toMatchObject({ textAlign: 'right', direction: 'ltr' });
  });

  it('does not set a direction on the English input', async () => {
    await renderIn('en', <AppInput label="Name" />);

    expect(ownStyle(screen.getByLabelText('Name')).direction).toBeUndefined();
  });
});

describe('AppIcon self-mirroring symbols on iOS', () => {
  // On Fabric the native view's direction follows the JS layout direction, so a
  // self-mirroring SF Symbol is flipped natively whatever I18nManager says.
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  it('does not mirror a self-mirroring symbol in JS once native layout is RTL', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    await renderIn('ur', <AppIcon name="restore" testID="restore" />);

    expect(isMirrored(icon('restore'))).toBe(false);
  });

  it('does not mirror a self-mirroring symbol in JS before the restart either', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    await renderIn('ur', <AppIcon name="restore" testID="restore" />);

    expect(isMirrored(icon('restore'))).toBe(false);
  });

  it('leaves a self-mirroring symbol alone in English while native layout is still RTL', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    await renderIn('en', <AppIcon name="restore" testID="restore" />);

    expect(isMirrored(icon('restore'))).toBe(false);
  });

  it('keeps mirroring direction-explicit symbols in Urdu', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    await renderIn('ur', <AppIcon name="chevronRight" testID="chevron" />);

    expect(isMirrored(icon('chevron'))).toBe(true);
  });

  it('keeps the JS mirror on Android, where the icon does not flip itself', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.replaceProperty(I18nManager, 'isRTL', false);
    await renderIn('ur', <AppIcon name="restore" testID="restore" />);

    expect(isMirrored(icon('restore'))).toBe(true);
  });
});
