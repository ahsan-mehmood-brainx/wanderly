import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

/** A deep link to a trip or itinerary item still gets the trips list underneath it. */
export const unstable_settings = { initialRouteName: 'index' };

export default function TripsStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: t('navigation.trips') }} />
      <Stack.Screen name="[tripId]/index" options={{ title: t('trips.tripTitle') }} />
      <Stack.Screen name="[tripId]/itinerary/[itemId]" options={{ title: t('trips.itineraryTitle') }} />
    </Stack>
  );
}
