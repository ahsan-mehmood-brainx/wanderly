import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ExploreStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: t('explore.title') }} />
    </Stack>
  );
}
