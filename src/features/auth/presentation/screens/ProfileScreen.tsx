import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppCard,
  AppDivider,
  AppIcon,
  AppText,
  InlineMessage,
  Screen,
  type AppIconName,
} from '@/shared/ui';

import { displayName } from '../../domain/AuthUser';
import { useProfile } from '../hooks/useProfile';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { user, refreshFailed, signOutPending, confirmSignOut, simulateExpiry } = useProfile();

  // The route is only reachable while signed in; this covers the frame in which sign-out completes.
  if (!user) return null;
  const name = displayName(user);

  return (
    <Screen>
      <View style={[styles.identity, { gap: spacing.sm }]}>
        <AppAvatar name={name} imageUri={user.imageUrl ?? undefined} size="xl" />
        <AppText variant="title" accessibilityRole="header" align="center">
          {name}
        </AppText>
        <AppBadge label={t('auth.demo.title')} tone="info" icon="sparkles" />
      </View>

      {refreshFailed ? <InlineMessage tone="warning" icon="warning" message={t('auth.profile.refreshFailed')} /> : null}

      <Group>
        <DetailRow icon="at" label={t('auth.profile.username')} value={user.username} />
        <AppDivider inset="xxxl" />
        <DetailRow icon="mail" label={t('auth.profile.email')} value={user.email} />
      </Group>

      <Group>
        <NavRow
          icon="bookmark"
          label={t('navigation.savedPlaces')}
          onPress={() => router.navigate(routes.savedPlaces)}
        />
        <AppDivider inset="xxxl" />
        <NavRow icon="settings" label={t('navigation.settings')} onPress={() => router.push(routes.settings)} />
      </Group>

      <AppButton
        label={t('auth.profile.signOut')}
        variant="outline"
        leftIcon="logout"
        fullWidth
        loading={signOutPending}
        onPress={confirmSignOut}
      />

      {simulateExpiry ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
            {t('auth.profile.developer.title')}
          </AppText>
          <AppCard variant="filled" padding="lg">
            <AppButton
              label={t('auth.profile.developer.expireAccessToken')}
              variant="outline"
              size="sm"
              leftIcon="timer"
              onPress={() => simulateExpiry('accessToken')}
            />
            <AppText variant="caption" color="textSecondary">
              {t('auth.profile.developer.expireAccessTokenHint')}
            </AppText>
            <AppButton
              label={t('auth.profile.developer.invalidateSession')}
              variant="outline"
              size="sm"
              leftIcon="warning"
              onPress={() => simulateExpiry('session')}
            />
            <AppText variant="caption" color="textSecondary">
              {t('auth.profile.developer.invalidateSessionHint')}
            </AppText>
          </AppCard>
        </View>
      ) : null}
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: AppIconName; label: string; value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View accessible style={[styles.row, { padding: spacing.lg, gap: spacing.md }]}>
      <AppIcon name={icon} size="md" color="textSecondary" />
      <View style={styles.fill}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText selectable>{value}</AppText>
      </View>
    </View>
  );
}

/** Grouped list surface (iOS inset-grouped style), matching `AppCard`'s outlined variant. */
function Group({ children }: { children: ReactNode }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
        },
      ]}
    >
      {children}
    </View>
  );
}

function NavRow({ icon, label, onPress }: { icon: AppIconName; label: string; onPress: () => void }) {
  const { colors, spacing, sizes } = useAppTheme();
  const isAndroid = Platform.OS === 'android';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={isAndroid ? { color: colors.surfacePressed } : undefined}
      style={({ pressed }) => [
        styles.row,
        { minHeight: sizes.touchTarget, padding: spacing.lg, gap: spacing.md },
        pressed && !isAndroid ? { backgroundColor: colors.surfacePressed } : null,
      ]}
    >
      <AppIcon name={icon} size="md" color="primary" />
      <AppText style={styles.fill}>{label}</AppText>
      <AppIcon name="chevronRight" size="sm" color="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  group: { overflow: 'hidden' },
});
