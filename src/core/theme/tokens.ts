import { StyleSheet, type TextStyle } from 'react-native';

/** 4pt spacing scale. Use these keys for padding, margins and gaps; avoid ad-hoc numbers. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radii = {
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;

/** Minimum touch target recommended by Apple HIG (44pt) and Material (48dp). */
export const MIN_TOUCH_TARGET = 48;

/** Font family registered by `useAppFonts`; faces are selected with `fontWeight`. */
export const FONT_FAMILY = 'Inter';

const font = (fontWeight: NonNullable<TextStyle['fontWeight']>): TextStyle => ({ fontFamily: FONT_FAMILY, fontWeight });

/**
 * Type scale. Sizes follow iOS Dynamic Type defaults so the app feels native,
 * and line heights stay on the 4pt grid.
 */
export const typography = {
  display: { ...font('700'), fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  largeTitle: { ...font('700'), fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title: { ...font('700'), fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  subtitle: { ...font('600'), fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  headline: { ...font('600'), fontSize: 16, lineHeight: 22 },
  body: { ...font('400'), fontSize: 16, lineHeight: 24 },
  callout: { ...font('400'), fontSize: 15, lineHeight: 20 },
  label: { ...font('500'), fontSize: 14, lineHeight: 20 },
  caption: { ...font('400'), fontSize: 13, lineHeight: 18 },
  sectionTitle: { ...font('600'), fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Fixed component dimensions shared across the design system. */
export const sizes = {
  touchTarget: MIN_TOUCH_TARGET,
  hairline: StyleSheet.hairlineWidth,
  border: 1,
  focusBorder: 2,
  button: { sm: 36, md: 48, lg: 56 },
  input: 52,
  header: 56,
  icon: { xs: 14, sm: 16, md: 20, lg: 24, xl: 32, xxl: 48 },
  avatar: { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 },
  badge: { sm: 20, md: 24 },
  sheetHandle: { width: 36, height: 5 },
  /** Comfortable reading width for content on tablets. */
  maxContentWidth: 640,
} as const;

export type IconSize = keyof typeof sizes.icon;
export type AvatarSize = keyof typeof sizes.avatar;

export const motion = {
  duration: { fast: 150, normal: 250, slow: 350 },
} as const;

export const opacity = {
  pressed: 0.7,
  disabled: 0.4,
} as const;
