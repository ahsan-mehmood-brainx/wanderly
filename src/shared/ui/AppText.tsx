import { Text, type TextProps, type TextStyle } from 'react-native';

import { useLayoutDirection } from '@/core/i18n/LayoutDirectionProvider';
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

export type TextAlign = TextStyle['textAlign'] | 'start' | 'end';

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: TextColor;
  /** `start` and `end` follow the layout direction. */
  readonly align?: TextAlign;
}

const LARGE_VARIANTS: ReadonlySet<TypographyVariant> = new Set(['display', 'largeTitle', 'title']);
const RTL_TEXT: TextStyle = { writingDirection: 'rtl' };
/**
 * Native text swaps `left`/`right` when the text node's own layout direction is
 * RTL (iOS RCTResolveTextAlignment, Android TextAttributeProps). Once `start`/`end`
 * is resolved to a physical side, the node is pinned to LTR layout so native
 * draws it on that side instead of flipping it a second time. Bidi ordering
 * still follows `writingDirection`.
 */
const PHYSICAL_ALIGN: TextStyle = { direction: 'ltr' };

/** Maps logical `start`/`end` alignment to the physical side for the layout direction. */
export function physicalTextAlign(align: TextAlign, isRTL: boolean): TextStyle['textAlign'] {
  if (align === 'start') return isRTL ? 'right' : 'left';
  if (align === 'end') return isRTL ? 'left' : 'right';
  return align;
}

const isLogicalAlign = (align: TextAlign | undefined): boolean => align === 'start' || align === 'end';

/** Themed text. Respects the user's font-size setting; large titles are capped so layouts don't break. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors, typography } = useAppTheme();
  const { isRTL } = useLayoutDirection();

  return (
    <Text
      maxFontSizeMultiplier={LARGE_VARIANTS.has(variant) ? 1.6 : undefined}
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] },
        isRTL ? RTL_TEXT : null,
        align ? { textAlign: physicalTextAlign(align, isRTL) } : null,
        isRTL && isLogicalAlign(align) ? PHYSICAL_ALIGN : null,
        style,
      ]}
    />
  );
}
