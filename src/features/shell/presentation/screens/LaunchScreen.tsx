import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppLoader } from '@/shared/ui';

const SPLASH_IMAGE = require('../../../../../assets/splash-icon.png') as number;

/** Same width as the native splash (`imageWidth` in app.json), so the hand-off is seamless. */
const SPLASH_IMAGE_WIDTH = 200;
/** Restores usually finish in a few frames; only show progress when one is actually slow (e.g. renewing a token). */
const PROGRESS_DELAY_MS = 600;

/**
 * Shown while the stored session is restored. It continues the native splash
 * (same image, size and position on the theme background) rather than flashing
 * a different screen, and adds progress only when restore takes noticeably long.
 */
export function LaunchScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowProgress(true), PROGRESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]} testID="launch-screen">
      <Image
        source={SPLASH_IMAGE}
        contentFit="contain"
        style={{ width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH }}
        accessible={false}
      />
      {showProgress ? (
        <AppLoader
          size="small"
          label={t('launch.restoring')}
          style={[styles.progress, { bottom: insets.bottom + spacing.xxxl }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', left: 0, right: 0 },
});
