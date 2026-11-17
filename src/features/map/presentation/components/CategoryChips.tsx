import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppChip } from '@/shared/ui';

import { PLACE_CATEGORIES, type PlaceCategory } from '../../domain/Place';
import { PLACE_CATEGORY_ICONS } from '../categoryIcons';

interface CategoryChipsProps {
  readonly selected: readonly PlaceCategory[];
  readonly onToggle: (category: PlaceCategory) => void;
}

/** Multi-select place types. Toggling filters the places already loaded; it never sends a request. */
export function CategoryChips({ selected, onToggle }: CategoryChipsProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('map.categoriesLabel')}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
    >
      {PLACE_CATEGORIES.map((category) => (
        <AppChip
          key={category}
          label={t(`map.categories.${category}`)}
          icon={PLACE_CATEGORY_ICONS[category]}
          selected={selected.includes(category)}
          onPress={() => onToggle(category)}
        />
      ))}
    </ScrollView>
  );
}
