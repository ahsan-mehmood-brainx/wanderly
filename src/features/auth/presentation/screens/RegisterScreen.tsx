import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppInput, AppText, InlineMessage } from '@/shared/ui';
import { StateView } from '@/shared/ui/StateView';

import {
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  type RegistrationField,
  type ValidationIssue,
} from '../../domain/Credentials';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { useRegisterForm } from '../hooks/useRegisterForm';

type Translate = ReturnType<typeof useTranslation>['t'];

function validationMessage(t: Translate, field: RegistrationField, issue: ValidationIssue | undefined) {
  if (!issue) return undefined;
  switch (field) {
    case 'firstName':
      return t('auth.validation.firstNameRequired');
    case 'lastName':
      return t('auth.validation.lastNameRequired');
    case 'email':
      return issue === 'required' ? t('auth.validation.emailRequired') : t('auth.validation.emailInvalid');
    case 'username':
      if (issue === 'required') return t('auth.validation.newUsernameRequired');
      return issue === 'tooShort'
        ? t('auth.validation.usernameTooShort', { min: MIN_USERNAME_LENGTH })
        : t('auth.validation.usernameInvalid');
    case 'password':
      return issue === 'required'
        ? t('auth.validation.newPasswordRequired')
        : t('auth.validation.passwordTooShort', { min: MIN_PASSWORD_LENGTH });
  }
}

const backToSignIn = (prefillDemo: boolean) =>
  router.dismissTo(prefillDemo ? { pathname: routes.signIn, params: { prefill: 'demo' } } : routes.signIn);

export function RegisterScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { details, fieldErrors, setField, submit, registration } = useRegisterForm();
  const submitting = registration.status === 'submitting';

  if (registration.status === 'succeeded' && registration.account) {
    return (
      <AuthScreenLayout>
        <StateView
          icon="checkCircle"
          tone="neutral"
          title={t('auth.register.successTitle')}
          message={t('auth.register.successMessage', { name: registration.account.firstName })}
          actions={
            <AppButton
              label={t('auth.register.continueWithDemo')}
              rightIcon="chevronRight"
              onPress={() => backToSignIn(true)}
            />
          }
          style={styles.fill}
        />
      </AuthScreenLayout>
    );
  }

  const input = (field: RegistrationField) => ({
    value: details[field],
    onChangeText: setField(field),
    error: validationMessage(t, field, fieldErrors[field]),
  });

  return (
    <AuthScreenLayout>
      <AppText variant="title" accessibilityRole="header">
        {t('auth.register.heading')}
      </AppText>

      <InlineMessage
        tone="info"
        icon="info"
        title={t('auth.register.limitationsTitle')}
        message={t('auth.register.limitations')}
      />

      <View style={{ gap: spacing.lg }}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <AppInput
            label={t('auth.register.firstName')}
            {...input('firstName')}
            autoComplete="given-name"
            textContentType="givenName"
            containerStyle={styles.fill}
          />
          <AppInput
            label={t('auth.register.lastName')}
            {...input('lastName')}
            autoComplete="family-name"
            textContentType="familyName"
            containerStyle={styles.fill}
          />
        </View>
        <AppInput
          label={t('auth.register.email')}
          leftIcon="mail"
          {...input('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />
        <AppInput
          label={t('auth.register.username')}
          leftIcon="at"
          {...input('username')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
        />
        <AppInput
          label={t('auth.register.password')}
          leftIcon="lock"
          hint={t('auth.register.passwordHint', { min: MIN_PASSWORD_LENGTH })}
          {...input('password')}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {registration.status === 'failed' && registration.error ? (
          <InlineMessage message={t(getErrorMessageKey(registration.error))} />
        ) : null}

        <AppButton label={t('auth.register.submit')} size="lg" fullWidth loading={submitting} onPress={submit} />
      </View>

      <View style={[styles.footer, { gap: spacing.xs }]}>
        <AppText color="textSecondary">{t('auth.register.haveAccount')}</AppText>
        <AppButton label={t('auth.register.signIn')} variant="ghost" size="sm" onPress={() => backToSignIn(false)} />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
});
