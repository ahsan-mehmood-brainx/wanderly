import { colorSchemes } from './colors';
import { shadowsFor, type ThemeShadows } from './shadows';
import { createTypography, motion, opacity, radii, sizes, spacing, type TypographyScale } from './tokens';
import { type ColorScheme, type ThemeColors } from './types';

export interface AppTheme {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: TypographyScale;
  readonly shadows: ThemeShadows;
  readonly sizes: typeof sizes;
  readonly motion: typeof motion;
  readonly opacity: typeof opacity;
}

function createTheme(scheme: ColorScheme, rtlScript: boolean): AppTheme {
  const colors = colorSchemes[scheme];
  return {
    scheme,
    colors,
    spacing,
    radii,
    typography: createTypography({ rtlScript }),
    shadows: shadowsFor(scheme, colors.shadow),
    sizes,
    motion,
    opacity,
  };
}

export const themes: Readonly<Record<ColorScheme, AppTheme>> = {
  light: createTheme('light', false),
  dark: createTheme('dark', false),
};

/** Themes for joined right-to-left scripts (Urdu): same colors, typography without letter spacing. */
export const rtlScriptThemes: Readonly<Record<ColorScheme, AppTheme>> = {
  light: createTheme('light', true),
  dark: createTheme('dark', true),
};
