import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useProfile } from '@/features/auth/presentation/hooks/useProfile';
import { routes } from '@/shared/navigation/routes';
import {
  AppAvatar,
  AppBadge,
  AppButton,
  AppCard,
  AppDivider,
  AppText,
  InlineMessage,
  ListDetailRow,
  ListGroup,
  ListNavRow,
  Screen,
} from '@/shared/ui';

import { type TravelStats } from '../../domain/travelStats';
import { useLocalProfile } from '../hooks/useLocalProfile';
import { useProfileIdentity } from '../hooks/useProfileIdentity';
import { type StatValue, useTravelStats } from '../hooks/useTravelStats';

const STATS: readonly (keyof TravelStats)[] = ['totalTrips', 'completedTrips', 'savedPlaces'];

/**
 * The signed-in traveller: the account (owned by auth, refreshed from the server)
 * with the local profile and travel stats on top.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { refreshFailed, signOutPending, confirmSignOut, simulateExpiry } = useProfile();
  const identity = useProfileIdentity();
  const { profile, status: profileStatus, retry: retryProfile } = useLocalProfile();
  const stats = useTravelStats();

  // The route is only reachable while signed in; this covers the frame in which sign-out completes.
  if (!identity) return null;
  const { user, name, imageUri } = identity;

  return (
    <Screen>
      <View style={[styles.identity, { gap: spacing.sm }]}>
        <AppAvatar name={name} imageUri={imageUri} size="xl" />
        <AppText variant="title" accessibilityRole="header" align="center">
          {name}
        </AppText>
        {profile.bio ? (
          <AppText color="textSecondary" align="center">
            {profile.bio}
          </AppText>
        ) : null}
        <AppBadge label={t('auth.demo.title')} tone="info" icon="sparkles" />
        <AppButton
          label={t('profile.editProfile')}
          variant="outline"
          size="sm"
          leftIcon="edit"
          onPress={() => router.push(routes.editProfile)}
        />
      </View>

      {refreshFailed ? <InlineMessage tone="warning" icon="warning" message={t('auth.profile.refreshFailed')} /> : null}
      {profileStatus === 'failed' ? (
        <View style={{ gap: spacing.sm }}>
          <InlineMessage tone="warning" icon="warning" message={t('profile.loadFailed')} />
          <AppButton label={t('common.tryAgain')} variant="outline" size="sm" onPress={retryProfile} />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
          {t('profile.stats.title')}
        </AppText>
        <View style={[styles.stats, { gap: spacing.sm }]}>
          {STATS.map((stat) => (
            <StatTile key={stat} id={stat} value={stats[stat]} />
          ))}
        </View>
      </View>

      <ListGroup>
        <ListDetailRow icon="at" label={t('auth.profile.username')} value={user.username} />
        <AppDivider inset="xxxl" />
        <ListDetailRow icon="mail" label={t('auth.profile.email')} value={user.email} />
        {profile.homeBase ? (
          <>
            <AppDivider inset="xxxl" />
            <ListDetailRow icon="home" label={t('profile.homeBase')} value={profile.homeBase} />
          </>
        ) : null}
      </ListGroup>

      <ListGroup>
        <ListNavRow
          icon="bookmark"
          label={t('navigation.savedPlaces')}
          onPress={() => router.navigate(routes.savedPlaces)}
        />
        <AppDivider inset="xxxl" />
        <ListNavRow icon="settings" label={t('navigation.settings')} onPress={() => router.push(routes.settings)} />
      </ListGroup>

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

/** One stat, read as a single "label: value" element by screen readers. */
function StatTile({ id, value }: { readonly id: keyof TravelStats; readonly value: StatValue }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const label = t(`profile.stats.${id}`);
  const shown =
    value === 'loading'
      ? null
      : value === 'unavailable'
        ? t('profile.stats.unavailable')
        : new Intl.NumberFormat(i18n.language).format(value);
  const accessibilityLabel =
    value === 'loading'
      ? t('profile.stats.loadingLabel', { stat: label })
      : value === 'unavailable'
        ? t('profile.stats.unavailableLabel', { stat: label })
        : t('profile.stats.valueLabel', { stat: label, count: shown ?? '' });

  return (
    <View
      testID={`profile-stat-${id}`}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: value === 'loading' }}
      style={[
        styles.stat,
        {
          padding: spacing.md,
          gap: spacing.xxs,
          borderRadius: radii.md,
          borderWidth: sizes.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {shown === null ? (
        <View style={[styles.placeholder, { borderRadius: radii.xs, backgroundColor: colors.surfaceMuted }]} />
      ) : (
        <AppText variant="title">{shown}</AppText>
      )}
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

const PLACEHOLDER_WIDTH = 32;
const PLACEHOLDER_HEIGHT = 28;

const styles = StyleSheet.create({
  identity: { alignItems: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap' },
  // Equal tiles that wrap onto a new line when long translated labels need room.
  stat: { flexGrow: 1, flexBasis: 96, minWidth: 96 },
  placeholder: { width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_HEIGHT },
});
