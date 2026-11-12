import { colorSchemes } from './colors';
import { shadowsFor, type ThemeShadows } from './shadows';
import { motion, opacity, radii, sizes, spacing, typography } from './tokens';
import { type ColorScheme, type ThemeColors } from './types';

export interface AppTheme {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: typeof typography;
  readonly shadows: ThemeShadows;
  readonly sizes: typeof sizes;
  readonly motion: typeof motion;
  readonly opacity: typeof opacity;
}

function createTheme(scheme: ColorScheme): AppTheme {
  const colors = colorSchemes[scheme];
  return {
    scheme,
    colors,
    spacing,
    radii,
    typography,
    shadows: shadowsFor(scheme, colors.shadow),
    sizes,
    motion,
    opacity,
  };
}

export const themes: Readonly<Record<ColorScheme, AppTheme>> = {
  light: createTheme('light'),
  dark: createTheme('dark'),
};
