import { type ReactNode } from 'react';

import { AppCard, AppText } from '@/shared/ui';

interface WeatherSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly testID?: string;
}

/** Outlined card with a small caps heading, matching the destination screen's sections. */
export function WeatherSection({ title, children, testID }: WeatherSectionProps) {
  return (
    <AppCard variant="outlined" padding="lg" testID={testID}>
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </AppCard>
  );
}
