import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

/** A deep link straight to a destination still gets Explore underneath it, so "back" has somewhere to go. */
export const unstable_settings = { initialRouteName: 'explore' };

export default function ExploreStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="explore" options={{ ...tabRootOptions, title: t('discover.title') }} />
      <Stack.Screen name="search" options={{ title: t('search.title') }} />
      {/* The screen replaces the title with the destination's name once it has loaded. */}
      <Stack.Screen name="destinations/[destinationId]" options={{ title: t('destination.title') }} />
    </Stack>
  );
}
