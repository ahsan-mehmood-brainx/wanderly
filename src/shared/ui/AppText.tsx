import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type TypographyVariant } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';

type TextColor = Extract<keyof ThemeColors, 'text' | 'textSecondary' | 'primary' | 'danger' | 'onPrimary'>;

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: TextColor;
}

/** Themed text. Respects the user's font-size setting; large titles are capped so layouts don't break. */
export function AppText({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const { colors, typography } = useAppTheme();
  const isLarge = variant === 'largeTitle' || variant === 'title';

  return (
    <Text
      maxFontSizeMultiplier={isLarge ? 1.6 : undefined}
      {...rest}
      style={[typography[variant], { color: colors[color] }, style]}
    />
  );
}
