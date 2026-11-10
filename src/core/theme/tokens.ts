import { type TextStyle } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum touch target recommended by Apple HIG (44pt) and Material (48dp). */
export const MIN_TOUCH_TARGET = 48;

export const typography = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  sectionTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
