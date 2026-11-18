import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

export default function BudgetStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: t('navigation.budget') }} />
    </Stack>
  );
}
