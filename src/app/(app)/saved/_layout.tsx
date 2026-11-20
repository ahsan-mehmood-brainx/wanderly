import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

/** A link to a collection still gets Saved Places underneath it. */
export const unstable_settings = { initialRouteName: 'index' };

export default function SavedPlacesStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: t('navigation.savedPlaces') }} />
      <Stack.Screen name="collections/[collectionId]" options={{ title: t('savedPlaces.collection.title') }} />
    </Stack>
  );
}
