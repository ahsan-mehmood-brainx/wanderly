import { type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AppProviders } from '@/bootstrap/AppProviders';
import { createAppContainer } from '@/bootstrap/createAppContainer';
import { RootNavigator } from '@/bootstrap/RootNavigator';
import { useAppFonts } from '@/core/theme/fonts';
import { themes } from '@/core/theme/themes';
import { MIN_TOUCH_TARGET } from '@/core/theme/tokens';
import { deepLinkInbox } from '@/shared/navigation/deepLinks';

void SplashScreen.preventAutoHideAsync();

const container = createAppContainer();

// Native links reach the inbox through `+native-intent`, which doesn't run on web; there, the page URL is the link.
if (Platform.OS === 'web' && typeof window !== 'undefined') deepLinkInbox.record(window.location.pathname);

export default function RootLayout() {
  const fonts = useAppFonts();

  useEffect(() => {
    if (fonts.error) container.dependencies.logger.error('Inter failed to load; using the platform font', fonts.error);
  }, [fonts.error]);

  // The splash stays up until fonts are ready, then until preferences load (AppProviders.onReady).
  // The in-app launch screen (`splash` route) then continues it while the session is restored.
  if (!fonts.done) return null;

  return (
    <AppProviders container={container} onReady={SplashScreen.hide}>
      <RootNavigator />
    </AppProviders>
  );
}

/**
 * Last-resort fallback for render errors anywhere in the app. Rendered outside
 * the providers, so it reads the theme and translations directly.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, typography, spacing, radii } = themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { t } = container.i18n;

  useEffect(() => {
    container.dependencies.logger.error('Unhandled render error', error);
    SplashScreen.hide();
  }, [error]);

  return (
    <View style={[styles.fallback, { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md }]}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]}>
        {t('errors.unexpectedTitle')}
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
        {t('errors.unexpectedMessage')}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            borderRadius: radii.pill,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[typography.headline, { color: colors.onPrimary }]}>{t('common.tryAgain')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
});
