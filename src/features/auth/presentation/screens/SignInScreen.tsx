import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes, type SignInRouteParams } from '@/shared/navigation/routes';
import { AppButton, AppInput, AppText, InlineMessage } from '@/shared/ui';

import { type ValidationIssue } from '../../domain/Credentials';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { BrandMark } from '../components/BrandMark';
import { DemoAccountCard } from '../components/DemoAccountCard';
import { useSignInForm } from '../hooks/useSignInForm';
import { type SessionNotice } from '../state/authSlice';

const NOTICE_TONE = { sessionExpired: 'warning', restoreFailed: 'warning', signedOut: 'success' } as const;
const NOTICE_ICON = { sessionExpired: 'timer', restoreFailed: 'warning', signedOut: 'checkCircle' } as const;

export function SignInScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const form = useSignInForm();
  const passwordRef = useRef<TextInputInstance>(null);
  const { prefill } = useLocalSearchParams<SignInRouteParams>();
  const { fillDemoAccount } = form;

  // Arriving from the demo sign-up: fill the demo account once, then drop the param.
  useEffect(() => {
    if (prefill !== 'demo') return;
    fillDemoAccount();
    router.setParams({ prefill: undefined });
  }, [prefill, fillDemoAccount]);

  const fieldError = (issue: ValidationIssue | undefined, message: string) => (issue ? message : undefined);

  return (
    <AuthScreenLayout headerless>
      <View style={{ gap: spacing.md }}>
        <BrandMark />
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('auth.signIn.title')}
        </AppText>
        <AppText color="textSecondary">{t('auth.signIn.subtitle')}</AppText>
      </View>

      {form.notice ? <SessionNoticeBanner notice={form.notice} onDismiss={form.dismissNotice} /> : null}
      {form.offline ? <InlineMessage tone="info" icon="offline" message={t('auth.signIn.offline')} /> : null}

      <View style={{ gap: spacing.lg }}>
        <AppInput
          label={t('auth.signIn.username')}
          leftIcon="person"
          value={form.credentials.username}
          onChangeText={form.setUsername}
          error={fieldError(form.fieldErrors.username, t('auth.validation.usernameRequired'))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="sign-in-username"
        />
        <AppInput
          ref={passwordRef}
          label={t('auth.signIn.password')}
          leftIcon="lock"
          value={form.credentials.password}
          onChangeText={form.setPassword}
          error={fieldError(form.fieldErrors.password, t('auth.validation.passwordRequired'))}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={form.submit}
          testID="sign-in-password"
        />

        {form.lockoutSeconds > 0 ? (
          <InlineMessage
            tone="warning"
            icon="timer"
            message={t('auth.signIn.lockedOut', { count: form.lockoutSeconds })}
          />
        ) : form.error ? (
          <InlineMessage
            message={t(getErrorMessageKey(form.error))}
            dismissLabel={t('common.dismiss')}
            onDismiss={form.dismissError}
          />
        ) : null}

        <AppButton
          label={t('auth.signIn.submit')}
          size="lg"
          fullWidth
          loading={form.pending}
          disabled={form.lockoutSeconds > 0}
          onPress={form.submit}
        />
      </View>

      <DemoAccountCard onUse={form.fillDemoAccount} />

      <View style={[styles.footer, { gap: spacing.xs }]}>
        <AppText color="textSecondary">{t('auth.signIn.noAccount')}</AppText>
        <AppButton
          label={t('auth.signIn.createAccount')}
          variant="ghost"
          size="sm"
          onPress={() => router.push(routes.register)}
        />
      </View>
    </AuthScreenLayout>
  );
}

function SessionNoticeBanner({ notice, onDismiss }: { notice: SessionNotice; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <InlineMessage
      tone={NOTICE_TONE[notice]}
      icon={NOTICE_ICON[notice]}
      message={t(`auth.notice.${notice}`)}
      dismissLabel={t('common.dismiss')}
      onDismiss={onDismiss}
      testID="session-notice"
    />
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
});
