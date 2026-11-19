import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';
import { routes } from '@/shared/navigation/routes';
import { AppIconButton } from '@/shared/ui';

/** A deep link to a trip or itinerary item still gets the trips list underneath it. */
export const unstable_settings = { initialRouteName: 'index' };

function NewTripButton() {
  const { t } = useTranslation();
  return (
    <AppIconButton icon="add" accessibilityLabel={t('trips.planTrip')} onPress={() => router.push(routes.newTrip)} />
  );
}

export default function TripsStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{ ...tabRootOptions, title: t('navigation.trips'), headerRight: () => <NewTripButton /> }}
      />
      <Stack.Screen name="new" options={{ title: t('trips.newTrip') }} />
      <Stack.Screen name="upcoming" options={{ title: t('trips.upcomingTitle') }} />
      <Stack.Screen name="completed" options={{ title: t('trips.completedTitle') }} />
      <Stack.Screen name="[tripId]/index" options={{ title: t('trips.tripTitle') }} />
      <Stack.Screen name="[tripId]/edit" options={{ title: t('trips.editTrip') }} />
      <Stack.Screen name="[tripId]/weather" options={{ title: t('weather.title') }} />
      <Stack.Screen name="[tripId]/itinerary/index" options={{ title: t('itinerary.title') }} />
      <Stack.Screen name="[tripId]/itinerary/day/[date]" options={{ title: t('itinerary.dayTitle') }} />
      <Stack.Screen name="[tripId]/itinerary/new" options={{ title: t('itinerary.newActivity') }} />
      <Stack.Screen name="[tripId]/itinerary/[itemId]" options={{ title: t('itinerary.activityTitle') }} />
      <Stack.Screen name="[tripId]/itinerary/[itemId]/edit" options={{ title: t('itinerary.editActivity') }} />
    </Stack>
  );
}
