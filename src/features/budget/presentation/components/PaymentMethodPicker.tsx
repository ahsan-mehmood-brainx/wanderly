import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppChip, AppText } from '@/shared/ui';

import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/Expense';
import { PAYMENT_METHOD_ICONS } from '../format';

interface PaymentMethodPickerProps {
  readonly value: PaymentMethod | null;
  readonly onChange: (method: PaymentMethod) => void;
  readonly error?: string;
}

/** How the expense was paid, as selectable chips. */
export function PaymentMethodPicker({ value, onChange, error }: PaymentMethodPickerProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary" accessibilityRole="header">
        {t('budget.form.paymentMethod')}
      </AppText>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {PAYMENT_METHODS.map((method) => (
          <AppChip
            key={method}
            label={t(`budget.paymentMethods.${method}`)}
            icon={PAYMENT_METHOD_ICONS[method]}
            selected={method === value}
            onPress={() => onChange(method)}
          />
        ))}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
