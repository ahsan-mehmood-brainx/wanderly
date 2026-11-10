import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { themes, type AppTheme } from './themes';
import { FONT_FAMILY } from './tokens';
import { type ColorScheme } from './types';

const ThemeContext = createContext<AppTheme | null>(null);

function toNavigationTheme(theme: AppTheme): Theme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    fonts: {
      regular: { ...base.fonts.regular, fontFamily: FONT_FAMILY },
      medium: { ...base.fonts.medium, fontFamily: FONT_FAMILY },
      bold: { ...base.fonts.bold, fontFamily: FONT_FAMILY },
      heavy: { ...base.fonts.heavy, fontFamily: FONT_FAMILY },
    },
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };
}

interface ThemeProviderProps {
  readonly scheme: ColorScheme;
  readonly children: ReactNode;
}

/** Provides app design tokens and keeps navigation chrome (headers, tab bar) in the same scheme. */
export function ThemeProvider({ scheme, children }: ThemeProviderProps) {
  const theme = themes[scheme];
  const navigationTheme = useMemo(() => toNavigationTheme(theme), [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useAppTheme must be used within a ThemeProvider');
  return theme;
}
