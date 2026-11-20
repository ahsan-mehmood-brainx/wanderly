import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppChip, AppText } from '@/shared/ui';

import { ACTIVITY_CATEGORIES, type ActivityCategory } from '../../domain/Activity';
import { CATEGORY_ICONS } from '../format';

interface CategoryPickerProps {
  readonly value: ActivityCategory | null;
  readonly onChange: (category: ActivityCategory) => void;
  readonly error?: string;
}

/** The activity categories as selectable chips. */
export function CategoryPicker({ value, onChange, error }: CategoryPickerProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary" accessibilityRole="header">
        {t('itinerary.form.category')}
      </AppText>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {ACTIVITY_CATEGORIES.map((category) => (
          <AppChip
            key={category}
            label={t(`itinerary.categories.${category}`)}
            icon={CATEGORY_ICONS[category]}
            selected={category === value}
            onPress={() => onChange(category)}
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
