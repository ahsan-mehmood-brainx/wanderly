import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { formatTripDates } from '@/features/trips/presentation/format';
import { AppBottomSheet, AppChip } from '@/shared/ui';

interface TripSwitcherSheetProps {
  readonly visible: boolean;
  readonly trips: readonly StoredTrip[];
  readonly value: string | null;
  readonly onSelect: (tripId: string) => void;
  readonly onClose: () => void;
}

/** Picks which trip's budget the Budget tab shows. */
export function TripSwitcherSheet({ visible, trips, value, onSelect, onClose }: TripSwitcherSheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('budget.switcherTitle')} testID="budget-trip-sheet">
      <ScrollView>
        <View style={{ gap: spacing.sm }}>
          {trips.map((trip) => (
            <AppChip
              key={trip.id}
              label={`${trip.title} · ${formatTripDates(trip.startDate, trip.endDate, i18n.language)}`}
              icon="luggage"
              selected={trip.id === value}
              onPress={() => onSelect(trip.id)}
            />
          ))}
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}
