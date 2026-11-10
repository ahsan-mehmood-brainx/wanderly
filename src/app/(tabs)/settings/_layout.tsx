import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SettingsStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="design-system" options={{ title: t('settings.developer.designSystem') }} />
    </Stack>
  );
}
