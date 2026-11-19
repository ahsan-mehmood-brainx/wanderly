import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppChip } from '@/shared/ui';

import { TRIP_CURRENCIES } from '../../domain/money';

interface CurrencySheetProps {
  readonly visible: boolean;
  readonly value: string;
  readonly onSelect: (currency: string) => void;
  readonly onClose: () => void;
}

export function CurrencySheet({ visible, value, onSelect, onClose }: CurrencySheetProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  // A trip saved in a currency no longer offered keeps it as an option.
  const options = (TRIP_CURRENCIES as readonly string[]).includes(value)
    ? TRIP_CURRENCIES
    : [value, ...TRIP_CURRENCIES];

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('trips.currencyPicker.title')}>
      <ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {options.map((currency) => (
            <AppChip key={currency} label={currency} selected={currency === value} onPress={() => onSelect(currency)} />
          ))}
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}
