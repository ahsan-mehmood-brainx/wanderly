import { radii, spacing, typography } from './tokens';
import { type ColorScheme, type ThemeColors } from './types';

export interface AppTheme {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: typeof typography;
}

// Text/background pairs meet WCAG AA (≥ 4.5:1) for body text in both schemes.
const lightColors: ThemeColors = {
  background: '#F6F8F8',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F2',
  text: '#0F1B1D',
  textSecondary: '#52606A',
  border: '#D9E1E2',
  primary: '#0B7A75',
  onPrimary: '#FFFFFF',
  danger: '#B42318',
  dangerSurface: '#FEF3F2',
};

const darkColors: ThemeColors = {
  background: '#0B1416',
  surface: '#142123',
  surfaceMuted: '#1C2C2F',
  text: '#EAF2F2',
  textSecondary: '#A3B3B6',
  border: '#2A3B3E',
  primary: '#4FD1C5',
  onPrimary: '#062B28',
  danger: '#F97066',
  dangerSurface: '#3A1714',
};

export const themes: Readonly<Record<ColorScheme, AppTheme>> = {
  light: { scheme: 'light', colors: lightColors, spacing, radii, typography },
  dark: { scheme: 'dark', colors: darkColors, spacing, radii, typography },
};
