import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AppProviders } from '@/bootstrap/AppProviders';
import { createAppContainer } from '@/bootstrap/createAppContainer';
import { useAppFonts } from '@/core/theme/fonts';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { themes } from '@/core/theme/themes';
import { MIN_TOUCH_TARGET } from '@/core/theme/tokens';

void SplashScreen.preventAutoHideAsync();

const container = createAppContainer();

export default function RootLayout() {
  const fonts = useAppFonts();

  useEffect(() => {
    if (fonts.error) container.dependencies.logger.error('Inter failed to load; using the platform font', fonts.error);
  }, [fonts.error]);

  // The splash stays up until fonts are ready, then until preferences load (AppProviders.onReady).
  if (!fonts.done) return null;

  return (
    <AppProviders container={container} onReady={SplashScreen.hide}>
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const { scheme } = useAppTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
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
