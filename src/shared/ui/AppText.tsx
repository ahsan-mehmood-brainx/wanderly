import { Text, type TextProps, type TextStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type TypographyVariant } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';

export type TextColor = Extract<
  keyof ThemeColors,
  | 'text'
  | 'textSecondary'
  | 'textTertiary'
  | 'textInverse'
  | 'primary'
  | 'onPrimary'
  | 'onSecondary'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'onDanger'
>;

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: TextColor;
  readonly align?: TextStyle['textAlign'];
}

const LARGE_VARIANTS: ReadonlySet<TypographyVariant> = new Set(['display', 'largeTitle', 'title']);

/** Themed text. Respects the user's font-size setting; large titles are capped so layouts don't break. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors, typography } = useAppTheme();

  return (
    <Text
      maxFontSizeMultiplier={LARGE_VARIANTS.has(variant) ? 1.6 : undefined}
      {...rest}
      style={[typography[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
