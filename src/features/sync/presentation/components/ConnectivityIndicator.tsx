import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { isOfflineState } from '@/core/network/ConnectivityService';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useConnectivity } from '@/shared/hooks/useConnectivity';
import { routes } from '@/shared/navigation/routes';
import { AppIcon, AppText } from '@/shared/ui';

/** How long "Back online" stays after the connection returns. */
export const BACK_ONLINE_VISIBLE_MS = 3_000;

/**
 * Header pill on every tab's first screen: "Offline" while the device is offline,
 * then "Back online" for a few seconds. Nothing while online, so it only draws
 * attention when something changed. Tapping it opens Offline and data. The change
 * is announced to screen readers once, by `useOfflineLifecycle` (there is a pill on
 * every tab, so announcing here would repeat it).
 */
export function ConnectivityIndicator() {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const { connectivity } = useDependencies();
  const { isOffline } = useConnectivity();
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    let wasOffline = connectivity.isOffline();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = connectivity.subscribe((state) => {
      const offline = isOfflineState(state);
      if (offline === wasOffline) return;
      clearTimeout(timer);
      setBackOnline(!offline);
      if (!offline) timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_VISIBLE_MS);
      wasOffline = offline;
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [connectivity]);

  if (!isOffline && !backOnline) return null;

  const tone = isOffline ? 'warning' : 'success';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isOffline ? t('offline.indicator.offlineA11y') : t('offline.indicator.backOnlineA11y')}
      onPress={() => router.push(routes.offlineData)}
      hitSlop={spacing.sm}
      testID="connectivity-indicator"
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: isOffline ? colors.warningSurface : colors.successSurface,
          borderColor: colors[tone],
          borderRadius: radii.pill,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xxs,
          gap: spacing.xxs,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <AppIcon name={isOffline ? 'offline' : 'online'} size="sm" color={tone} />
      <AppText variant="caption" color={tone}>
        {isOffline ? t('offline.indicator.offline') : t('offline.indicator.backOnline')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
