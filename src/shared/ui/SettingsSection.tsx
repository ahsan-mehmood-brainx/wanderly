import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppText } from './AppText';

export interface SettingsSectionProps {
  readonly title: string;
  /** Explanation under the section. */
  readonly caption?: string;
  readonly children: ReactNode;
}

/** A titled group on settings-style screens (Settings, Offline and data): header, content, caption. */
export function SettingsSection({ title, caption, children }: SettingsSectionProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText
        variant="sectionTitle"
        color="textSecondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.xs }}
      >
        {title}
      </AppText>
      {children}
      {caption ? (
        <AppText variant="caption" color="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}
