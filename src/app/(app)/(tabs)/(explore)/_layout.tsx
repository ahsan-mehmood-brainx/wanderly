import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

/** A deep link straight to a destination still gets Explore underneath it, so "back" has somewhere to go. */
export const unstable_settings = { initialRouteName: 'explore' };

export default function ExploreStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="explore" options={{ ...tabRootOptions, title: t('explore.title') }} />
      <Stack.Screen name="destinations/[destinationId]" options={{ title: t('destinations.title') }} />
    </Stack>
  );
}
