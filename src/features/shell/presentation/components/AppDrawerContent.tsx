import { router, usePathname, type Href } from 'expo-router';
import { type DrawerContentComponentProps } from 'expo-router/drawer';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { displayName } from '@/features/auth/domain/AuthUser';
import { useSignOut } from '@/features/auth/presentation/hooks/useSignOut';
import { selectCurrentUser } from '@/features/auth/presentation/state/selectors';
import { routes } from '@/shared/navigation/routes';
import { AppAvatar, AppBadge, AppDivider, AppIcon, AppText, type AppIconName } from '@/shared/ui';

import { activeDestination, DRAWER_DESTINATIONS } from '../navigation';

/** Drawer panel: who is signed in, the main destinations, then settings and sign-out. */
export function AppDrawerContent({ navigation }: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const user = useAppSelector(selectCurrentUser);
  const { confirmSignOut } = useSignOut();
  const active = activeDestination(pathname);

  const go = (href: Href) => {
    navigation.closeDrawer();
    router.navigate(href);
  };

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.sm },
      ]}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {user ? (
          <View style={[styles.row, { gap: spacing.md, paddingTop: spacing.sm }]}>
            <AppAvatar name={displayName(user)} imageUri={user.imageUrl ?? undefined} size="lg" />
            <View style={[styles.fill, { gap: spacing.xxs }]}>
              <AppText variant="headline" numberOfLines={1}>
                {displayName(user)}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {user.email}
              </AppText>
              <AppBadge label={t('auth.demo.badge')} tone="info" size="sm" style={styles.badge} />
            </View>
          </View>
        ) : null}

        <AppDivider />

        <View accessibilityRole="menu" accessibilityLabel={t('navigation.menu')} style={{ gap: spacing.xxs }}>
          {DRAWER_DESTINATIONS.map((item) => (
            <DrawerRow
              key={item.id}
              icon={item.icon}
              label={t(`navigation.${item.id}`)}
              selected={active === item.id}
              onPress={() => go(item.href)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xxs }}>
        <AppDivider spacing="sm" />
        <DrawerRow icon="settings" label={t('navigation.settings')} onPress={() => go(routes.settings)} />
        <DrawerRow
          icon="logout"
          label={t('auth.profile.signOut')}
          tone="danger"
          onPress={() => {
            navigation.closeDrawer();
            confirmSignOut();
          }}
        />
      </View>
    </View>
  );
}

interface DrawerRowProps {
  readonly icon: AppIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
  readonly tone?: 'default' | 'danger';
}

function DrawerRow({ icon, label, onPress, selected = false, tone = 'default' }: DrawerRowProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const isAndroid = Platform.OS === 'android';
  const ink = tone === 'danger' ? 'danger' : selected ? 'primary' : 'text';

  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={isAndroid ? { color: colors.surfacePressed } : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.touchTarget,
          paddingHorizontal: spacing.md,
          gap: spacing.md,
          borderRadius: radii.pill,
          overflow: 'hidden',
          backgroundColor: selected ? colors.primaryMuted : pressed && !isAndroid ? colors.surfacePressed : undefined,
        },
      ]}
    >
      <AppIcon name={icon} size="md" color={ink} />
      <AppText variant={selected ? 'headline' : 'body'} color={ink} style={styles.fill}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { alignSelf: 'flex-start' },
});
