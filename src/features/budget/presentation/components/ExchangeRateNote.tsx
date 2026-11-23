import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

import { type ExchangeRateInfo } from '../../domain/ExchangeRate';
import { formatRate } from '../format';

interface ExchangeRateNoteProps {
  readonly rate: ExchangeRateInfo;
  readonly from: string;
  readonly to: string;
}

/** The rate an amount was converted with and the date it is for; says when it is approximate or typed. */
export function ExchangeRateNote({ rate, from, to }: ExchangeRateNoteProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <AppText variant="callout" color="textSecondary">
        {formatRate(rate, from, to, i18n.language, t)}
      </AppText>
      {rate.source === 'fallback' ? (
        <AppText variant="caption" color="warning">
          {t('budget.rate.approximate')}
        </AppText>
      ) : null}
      {rate.source === 'manual' ? (
        <AppText variant="caption" color="textSecondary">
          {t('budget.rate.manual')}
        </AppText>
      ) : null}
    </View>
  );
}
