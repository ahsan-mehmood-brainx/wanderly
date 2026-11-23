import { screen } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { LayoutDirectionProvider } from '@/core/i18n/LayoutDirectionProvider';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { layoutDirectionAt } from '@/testing/layoutDirection';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppBottomSheet } from './AppBottomSheet';
import { AppIcon } from './AppIcon';
import { AppInput } from './AppInput';
import { AppText } from './AppText';
import { DIRECTIONAL_ICONS } from './icons';
import { Screen } from './Screen';

function renderIn(language: SupportedLanguage, ui: ReactElement) {
  return renderWithProviders(<LayoutDirectionProvider language={language}>{ui}</LayoutDirectionProvider>);
}

const textStyle = (text: string): TextStyle => StyleSheet.flatten(screen.getByText(text).props.style) ?? {};

type Element = ReturnType<typeof screen.getByText>;

/** True when the element, or a wrapper around it, is flipped horizontally. */
function isMirrored(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parent) {
    const transform = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.transform;
    if (Array.isArray(transform) && transform.some((step) => 'scaleX' in step && step.scaleX === -1)) return true;
  }
  return false;
}

const icon = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

describe('right-to-left shared UI', () => {
  describe('AppText', () => {
    it('TC-03 writes right to left in Urdu', async () => {
      await renderIn('ur', <AppText>سلام</AppText>);

      expect(textStyle('سلام').writingDirection).toBe('rtl');
    });

    it('TC-03 resolves logical alignment through the direction', async () => {
      await renderIn(
        'ur',
        <>
          <AppText align="start">Start</AppText>
          <AppText align="end">End</AppText>
          <AppText align="center">Centre</AppText>
        </>,
      );

      expect(textStyle('Start').textAlign).toBe('right');
      expect(textStyle('End').textAlign).toBe('left');
      expect(textStyle('Centre').textAlign).toBe('center');
    });

    it('TC-03 keeps left-to-right text unchanged', async () => {
      await renderIn(
        'en',
        <>
          <AppText>Hello</AppText>
          <AppText align="start">Start</AppText>
          <AppText align="end">End</AppText>
        </>,
      );

      expect(textStyle('Hello').writingDirection).not.toBe('rtl');
      expect(textStyle('Hello').textAlign).toBeUndefined();
      expect(textStyle('Start').textAlign).toBe('left');
      expect(textStyle('End').textAlign).toBe('right');
    });
  });

  describe('AppIcon', () => {
    it('TC-03 treats horizontal chevrons and back arrows as directional', () => {
      expect(DIRECTIONAL_ICONS.has('chevronRight')).toBe(true);
      expect(DIRECTIONAL_ICONS.has('chevronLeft')).toBe(true);
      expect(DIRECTIONAL_ICONS.has('back')).toBe(true);
      expect(DIRECTIONAL_ICONS.has('chevronDown')).toBe(false);
      expect(DIRECTIONAL_ICONS.has('settings')).toBe(false);
    });

    it('TC-03 mirrors directional icons in Urdu', async () => {
      await renderIn(
        'ur',
        <>
          <AppIcon name="chevronRight" testID="chevron" />
          <AppIcon name="chevronDown" testID="down" />
        </>,
      );

      expect(isMirrored(icon('chevron'))).toBe(true);
      expect(isMirrored(icon('down'))).toBe(false);
    });

    it('TC-03 does not mirror icons left to right', async () => {
      await renderIn('en', <AppIcon name="chevronRight" testID="chevron" />);

      expect(isMirrored(icon('chevron'))).toBe(false);
    });
  });

  describe('AppInput', () => {
    it('TC-03 aligns typed text to the right in Urdu', async () => {
      await renderIn('ur', <AppInput label="Name" />);

      expect(screen.getByLabelText('Name')).toHaveStyle({ textAlign: 'right' });
    });

    it('TC-03 keeps the default alignment left to right', async () => {
      await renderIn('en', <AppInput label="Name" />);

      expect(StyleSheet.flatten(screen.getByLabelText('Name').props.style)?.textAlign).not.toBe('right');
    });
  });

  describe('containers', () => {
    it('TC-03 lays out Screen content right to left in Urdu', async () => {
      await renderIn(
        'ur',
        <Screen>
          <AppText>Body</AppText>
        </Screen>,
      );

      expect(layoutDirectionAt(screen.getByText('Body'))).toBe('rtl');
    });

    it('TC-03 lays out bottom sheet content right to left in Urdu', async () => {
      await renderIn(
        'ur',
        <AppBottomSheet visible onClose={jest.fn()} title="Filters">
          <AppText>Sheet body</AppText>
        </AppBottomSheet>,
      );

      expect(layoutDirectionAt(screen.getByText('Sheet body'))).toBe('rtl');
      expect(layoutDirectionAt(screen.getByRole('header', { name: 'Filters' }))).toBe('rtl');
    });

    it('TC-03 keeps Screen content left to right in English', async () => {
      await renderIn(
        'en',
        <Screen>
          <AppText>Body</AppText>
        </Screen>,
      );

      expect(layoutDirectionAt(screen.getByText('Body'))).not.toBe('rtl');
    });
  });
});
