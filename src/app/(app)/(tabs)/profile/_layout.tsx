import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

export default function ProfileStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: t('auth.profile.title') }} />
      <Stack.Screen name="settings" options={{ headerLargeTitle: true, title: t('settings.title') }} />
      <Stack.Screen name="design-system" options={{ title: t('settings.developer.designSystem') }} />
    </Stack>
  );
}
