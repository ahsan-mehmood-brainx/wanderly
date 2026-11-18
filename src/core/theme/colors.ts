import { type ColorScheme, type ThemeColors } from './types';

/** Raw brand palette. Only `colors.ts` should reference these; everything else uses semantic roles. */
export const palette = {
  forest: '#245C46',
  forestDeep: '#1B4836',
  forestLight: '#8CC7A3',
  sage: '#A8C3AD',
  sageDeep: '#93B29A',
  sageInk: '#163A2C',
  offWhite: '#F7F8F5',
  white: '#FFFFFF',
  ink: '#17211C',
  night: '#0F1513',
} as const;

// Every text/fill pair below meets WCAG AA (≥ 4.5:1) for body text.
const light: ThemeColors = {
  background: palette.offWhite,
  surface: palette.white,
  surfaceMuted: '#EFF2EC',
  surfacePressed: '#E6EAE3',
  overlay: 'rgba(15, 21, 19, 0.45)',

  text: palette.ink,
  textSecondary: '#55625B',
  textTertiary: '#66726C',
  textInverse: palette.white,

  border: '#E3E7E0',
  borderStrong: '#C8D0C9',

  primary: palette.forest,
  primaryPressed: palette.forestDeep,
  primaryMuted: '#E3EEE6',
  onPrimary: palette.white,
  secondary: palette.sage,
  secondaryPressed: palette.sageDeep,
  onSecondary: palette.sageInk,

  success: '#1D6B45',
  successSurface: '#E8F5EC',
  warning: '#8A4B04',
  warningSurface: '#FDF3E1',
  info: '#1F5C99',
  infoSurface: '#E8F1FB',
  danger: '#B42318',
  dangerPressed: '#912018',
  dangerSurface: '#FEF3F2',
  onDanger: palette.white,

  shadow: '#0E1F17',
};

const dark: ThemeColors = {
  background: palette.night,
  surface: '#18201C',
  surfaceMuted: '#212B26',
  surfacePressed: '#2A3530',
  overlay: 'rgba(0, 0, 0, 0.6)',

  text: '#ECF1ED',
  textSecondary: '#A3B1A9',
  textTertiary: '#8A968F',
  textInverse: palette.ink,

  border: '#2A3530',
  borderStrong: '#3B4842',

  // Forest green is too dark to read on a dark canvas, so dark mode uses a lighter tint of the brand hue.
  primary: palette.forestLight,
  primaryPressed: '#78B891',
  primaryMuted: '#1E3329',
  onPrimary: '#0C2A1D',
  secondary: palette.sage,
  secondaryPressed: palette.sageDeep,
  onSecondary: palette.sageInk,

  success: '#6FCF97',
  successSurface: '#15291F',
  warning: '#F5B54A',
  warningSurface: '#33250F',
  info: '#7CB4F0',
  infoSurface: '#142436',
  danger: '#F97066',
  dangerPressed: '#E5554B',
  dangerSurface: '#3A1714',
  onDanger: '#2B0A07',

  shadow: '#000000',
};

export const colorSchemes: Readonly<Record<ColorScheme, ThemeColors>> = { light, dark };
