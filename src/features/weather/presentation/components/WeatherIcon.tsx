import { type IconSize } from '@/core/theme/tokens';
import { AppIcon } from '@/shared/ui';

import { type WeatherCondition } from '../../domain/Weather';
import { weatherIcon } from '../weatherIcons';

interface WeatherIconProps {
  readonly condition: WeatherCondition;
  readonly isDay: boolean | null;
  readonly size?: IconSize | number;
  /** Omit when the condition is also written out next to the icon (the icon is then decorative). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Native weather glyph for a condition, tinted by kind (sun, rain, cloud), with day and night variants. */
export function WeatherIcon({ condition, isDay, size = 'lg', accessibilityLabel, testID }: WeatherIconProps) {
  const { icon, color } = weatherIcon(condition, isDay);
  return <AppIcon name={icon} color={color} size={size} accessibilityLabel={accessibilityLabel} testID={testID} />;
}
