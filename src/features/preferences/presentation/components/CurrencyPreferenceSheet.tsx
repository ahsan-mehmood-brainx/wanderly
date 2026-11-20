import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { AppBottomSheet, OptionGroup, type Option } from '@/shared/ui';

import { CURRENCY_PREFERENCES, type CurrencyPreference } from '../../domain/Preferences';

interface CurrencyPreferenceSheetProps {
  readonly visible: boolean;
  readonly value: CurrencyPreference;
  /** What "Device region" resolves to right now. */
  readonly deviceCurrency: string;
  readonly onSelect: (currency: CurrencyPreference) => void;
  readonly onClose: () => void;
}

/** Picks the default currency for new trips: the device region's, or a fixed trip currency. */
export function CurrencyPreferenceSheet({
  visible,
  value,
  deviceCurrency,
  onSelect,
  onClose,
}: CurrencyPreferenceSheetProps) {
  const { t } = useTranslation();

  const options = useMemo<Option<CurrencyPreference>[]>(
    () =>
      CURRENCY_PREFERENCES.map((code) =>
        code === 'system'
          ? {
              value: code,
              label: t('settings.currency.system'),
              description: t('settings.currency.systemHint', { currency: deviceCurrency }),
            }
          : { value: code, label: code },
      ),
    [t, deviceCurrency],
  );

  return (
    <AppBottomSheet visible={visible} onClose={onClose}>
      <ScrollView>
        <OptionGroup title={t('settings.currency.title')} options={options} value={value} onChange={onSelect} />
      </ScrollView>
    </AppBottomSheet>
  );
}
