import { type ViewStyle } from 'react-native';

import { type ColorScheme } from './types';

export type ShadowToken = 'none' | 'sm' | 'md' | 'lg';
export type ThemeShadows = Readonly<Record<ShadowToken, ViewStyle>>;

/**
 * Elevation uses the cross-platform `boxShadow` style (New Architecture), so
 * iOS and Android render the same soft shadow. Dark mode relies on surface
 * contrast more than shadow, so its shadows are stronger but still subtle.
 */
function createShadows(color: string, strength: number): ThemeShadows {
  const alpha = (value: number) =>
    Math.round(Math.min(1, value * strength) * 255)
      .toString(16)
      .padStart(2, '0');
  return {
    none: {},
    sm: { boxShadow: `0px 1px 2px 0px ${color}${alpha(0.06)}, 0px 1px 3px 0px ${color}${alpha(0.08)}` },
    md: { boxShadow: `0px 4px 12px -2px ${color}${alpha(0.1)}, 0px 2px 4px -2px ${color}${alpha(0.06)}` },
    lg: { boxShadow: `0px 12px 32px -4px ${color}${alpha(0.16)}, 0px 4px 8px -4px ${color}${alpha(0.08)}` },
  };
}

export function shadowsFor(scheme: ColorScheme, color: string): ThemeShadows {
  return createShadows(color, scheme === 'dark' ? 3 : 1);
}
