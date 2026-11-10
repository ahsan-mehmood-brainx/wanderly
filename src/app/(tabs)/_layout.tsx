import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <NativeTabs
      tintColor={colors.primary}
      // iOS keeps its system (translucent) tab bar; Android's Material bar is themed to the brand.
      backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
      indicatorColor={colors.primaryMuted}
      rippleColor={colors.surfacePressed}
    >
      <NativeTabs.Trigger name="(explore)">
        <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} md="explore" />
        <NativeTabs.Trigger.Label>{t('tabs.explore')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
