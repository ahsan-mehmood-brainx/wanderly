import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { displayName } from '@/features/auth/domain/AuthUser';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { AppAvatar, AppButton, AppErrorView, AppInput, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { type LocalProfile, PROFILE_LIMITS } from '../../domain/LocalProfile';
import { type ProfileField } from '../../domain/profileValidation';
import { useLocalProfile } from '../hooks/useLocalProfile';
import { useProfileIdentity } from '../hooks/useProfileIdentity';
import { useProfileForm } from '../hooks/useProfileForm';

const MAX_LENGTH: Readonly<Record<ProfileField, number>> = {
  displayName: PROFILE_LIMITS.displayNameMaxLength,
  homeBase: PROFILE_LIMITS.homeBaseMaxLength,
  bio: PROFILE_LIMITS.bioMaxLength,
};

/** Edits the local profile (display name, photo, home base, bio). The account itself is read-only. */
export function EditProfileScreen() {
  const identity = useProfileIdentity();
  const { profile, status, errorKind, retry } = useLocalProfile();

  // The route is only reachable while signed in; this covers the frame in which sign-out completes.
  if (!identity) return null;
  // The form copies the profile once, so it starts only when the profile is known.
  // The account's own name, not `identity.name` (which prefers the saved display name).
  if (status === 'ready') return <ProfileForm profile={profile} accountName={displayName(identity.user)} />;
  if (status === 'failed') return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  return <AppLoader fullScreen />;
}

/** The navigation that was held back while the form has unsaved edits. */
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]['data']['action'];

function ProfileForm({ profile, accountName }: { readonly profile: LocalProfile; readonly accountName: string }) {
  const { t } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();
  const navigation = useNavigation();
  const form = useProfileForm(profile, accountName);
  const { input, errors, saved } = form;
  const [pendingLeave, setPendingLeave] = useState<LeaveAction | null>(null);
  const [confirmedLeave, setConfirmedLeave] = useState<LeaveAction | null>(null);

  // Leaving with unsaved edits asks first.
  usePreventRemove(form.dirty && confirmedLeave === null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (!confirmedLeave) return;
    // The guard must be off before the held-back navigation runs again.
    const timer = setTimeout(() => navigation.dispatch(confirmedLeave), 0);
    return () => clearTimeout(timer);
  }, [confirmedLeave, navigation]);

  useEffect(() => {
    if (!saved) return;
    // One macrotask later, so the leave guard has switched off.
    const timer = setTimeout(() => router.back(), 0);
    return () => clearTimeout(timer);
  }, [saved]);

  const errorFor = (field: ProfileField): string | undefined => {
    const error = errors?.fields[field];
    if (error === 'required') return t('profile.edit.required');
    if (error === 'tooLong') return t('profile.edit.tooLong', { max: MAX_LENGTH[field] });
    return undefined;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.lg },
        ]}
      >
        <View style={[styles.photo, { gap: spacing.sm }]}>
          {form.photoSupported ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={form.photoUri ? t('profile.edit.changePhoto') : t('profile.edit.choosePhoto')}
              onPress={() => void form.pickPhoto()}
              hitSlop={spacing.sm}
            >
              <AppAvatar name={input.displayName || accountName} imageUri={form.photoUri ?? undefined} size="xl" />
            </Pressable>
          ) : (
            <AppAvatar name={input.displayName || accountName} size="xl" />
          )}
          {form.photoSupported && form.photoUri ? (
            <AppButton
              label={t('profile.edit.removePhoto')}
              variant="ghost"
              size="sm"
              leftIcon="trash"
              onPress={form.removePhoto}
            />
          ) : null}
          {form.photoPickFailed ? <InlineMessage message={t('profile.edit.photoPickFailed')} /> : null}
        </View>

        <AppText variant="callout" color="textSecondary">
          {t('profile.edit.localOnly')}
        </AppText>

        <AppInput
          label={t('profile.edit.displayName')}
          hint={t('profile.edit.displayNameHint')}
          value={input.displayName}
          onChangeText={form.setDisplayName}
          error={errorFor('displayName')}
          autoComplete="name"
          textContentType="nickname"
          returnKeyType="next"
        />
        <AppInput
          label={t('profile.homeBase')}
          placeholder={t('profile.edit.homeBasePlaceholder')}
          hint={t('profile.edit.optional')}
          value={input.homeBase}
          onChangeText={form.setHomeBase}
          error={errorFor('homeBase')}
          leftIcon="home"
          returnKeyType="next"
        />
        <AppInput
          label={t('profile.bio')}
          placeholder={t('profile.edit.bioPlaceholder')}
          hint={t('profile.edit.optional')}
          value={input.bio}
          onChangeText={form.setBio}
          error={errorFor('bio')}
          multiline
        />

        {form.failure ? <InlineMessage message={t(getErrorMessageKey(form.failure))} /> : null}

        <AppButton
          label={t('profile.edit.save')}
          fullWidth
          size="lg"
          loading={form.saving}
          onPress={() => void form.submit()}
        />
      </ScrollView>

      <ConfirmSheet
        visible={pendingLeave !== null}
        title={t('profile.edit.discardTitle')}
        message={t('profile.edit.discardMessage')}
        confirmLabel={t('profile.edit.discard')}
        cancelLabel={t('profile.edit.keepEditing')}
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          setConfirmedLeave(pendingLeave);
          setPendingLeave(null);
        }}
        testID="discard-profile-sheet"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  photo: { alignItems: 'center' },
});
