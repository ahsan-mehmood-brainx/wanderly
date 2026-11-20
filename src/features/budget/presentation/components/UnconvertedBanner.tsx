import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, InlineMessage } from '@/shared/ui';

interface UnconvertedBannerProps {
  readonly count: number;
  readonly onRetry: () => void;
  readonly retrying?: boolean;
}

/** Says how many expenses are left out of the totals for lack of a rate, with a way to try again. */
export function UnconvertedBanner({ count, onRetry, retrying = false }: UnconvertedBannerProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  if (count === 0) return null;

  return (
    <View style={{ gap: spacing.sm }} testID="unconverted-banner">
      <InlineMessage
        tone="warning"
        icon="warning"
        title={t('budget.unconverted', { count })}
        message={t('budget.unconvertedMessage')}
      />
      <AppButton
        label={t('common.tryAgain')}
        variant="outline"
        size="sm"
        leftIcon="refresh"
        loading={retrying}
        onPress={onRetry}
      />
    </View>
  );
}
