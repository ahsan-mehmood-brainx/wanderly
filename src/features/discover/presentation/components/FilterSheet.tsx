import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppButton, AppChip, AppInput, AppText, InlineMessage } from '@/shared/ui';

import { DESTINATION_CATEGORIES } from '../../domain/Destination';
import {
  NO_FILTERS,
  POPULATION_RANGES,
  type FilterOptions,
  type PopulationRangeId,
  populationRangeId,
  type SearchFilters,
} from '../../domain/SearchFilters';
import { normalizeText } from '../../domain/searchMatching';
import { CATEGORY_ICONS } from '../categoryIcons';
import { regionLabel } from '../format';

interface FilterSheetProps {
  readonly visible: boolean;
  readonly filters: SearchFilters;
  /** `undefined` while loading; country and currency pickers wait for it. */
  readonly options: FilterOptions | undefined;
  readonly optionsUnavailable: boolean;
  readonly onApply: (filters: SearchFilters) => void;
  readonly onClose: () => void;
}

const MAX_PICKER_MATCHES = 6;

/**
 * Edits a draft of the filters; nothing changes until "Show results", so the
 * results behind the sheet don't jump around while the user is choosing.
 */
export function FilterSheet({ visible, filters, options, optionsUnavailable, onApply, onClose }: FilterSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [draft, setDraft] = useState(filters);

  // Each time the sheet opens, start from the applied filters.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(filters);
  }

  const update = (patch: Partial<SearchFilters>) => setDraft((current) => ({ ...current, ...patch }));
  const selectedRange = populationRangeId(draft.population);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('filters.title')} testID="filter-sheet">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: spacing.xl, paddingBottom: spacing.lg }}
      >
        <FilterGroup title={t('filters.category')}>
          <AppChip
            label={t('filters.any')}
            selected={draft.category === null}
            onPress={() => update({ category: null })}
          />
          {DESTINATION_CATEGORIES.map((category) => (
            <AppChip
              key={category}
              label={t(`discover.categories.${category}`)}
              icon={CATEGORY_ICONS[category]}
              selected={draft.category === category}
              onPress={() => update({ category })}
            />
          ))}
        </FilterGroup>

        {optionsUnavailable ? <InlineMessage tone="warning" message={t('filters.optionsUnavailable')} /> : null}

        {options && options.regions.length > 0 ? (
          <FilterGroup title={t('filters.region')}>
            <AppChip
              label={t('filters.any')}
              selected={draft.region === null}
              onPress={() => update({ region: null })}
            />
            {options.regions.map((region) => (
              <AppChip
                key={region}
                label={regionLabel(region, t)}
                selected={draft.region === region}
                onPress={() => update({ region })}
              />
            ))}
          </FilterGroup>
        ) : null}

        <FilterGroup title={t('filters.population')}>
          <AppChip
            label={t('filters.any')}
            selected={draft.population === null}
            onPress={() => update({ population: null })}
          />
          {(Object.keys(POPULATION_RANGES) as PopulationRangeId[]).map((id) => (
            <AppChip
              key={id}
              label={t(`filters.populationRanges.${id}`)}
              selected={selectedRange === id}
              onPress={() => update({ population: POPULATION_RANGES[id] })}
            />
          ))}
        </FilterGroup>

        {options ? (
          <>
            <Picker
              title={t('filters.country')}
              placeholder={t('filters.countryPlaceholder')}
              items={options.countries.map((country) => ({
                value: country.code,
                label: country.flagEmoji ? `${country.flagEmoji} ${country.name}` : country.name,
                keywords: [country.name, country.code],
              }))}
              value={draft.countryCode}
              onChange={(countryCode) => update({ countryCode })}
            />
            <Picker
              title={t('filters.currency')}
              placeholder={t('filters.currencyPlaceholder')}
              items={options.currencies.map((currency) => ({
                value: currency.code,
                label: `${currency.code} · ${currency.name}`,
                keywords: [currency.code, currency.name, currency.symbol ?? ''],
              }))}
              value={draft.currencyCode}
              onChange={(currencyCode) => update({ currencyCode })}
            />
          </>
        ) : null}

        <AppText variant="caption" color="textSecondary">
          {t('filters.note')}
        </AppText>

        <View style={[styles.actions, { gap: spacing.md }]}>
          <AppButton label={t('filters.reset')} variant="outline" onPress={() => setDraft(NO_FILTERS)} />
          <AppButton label={t('filters.apply')} onPress={() => onApply(draft)} style={styles.apply} fullWidth />
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}

function FilterGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const { spacing } = useAppTheme();
  return (
    // No `radiogroup` role: the chips are toggle buttons that announce `selected`, not radios.
    <View style={{ gap: spacing.sm }}>
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      <View style={[styles.wrap, { gap: spacing.sm }]}>{children}</View>
    </View>
  );
}

interface PickerItem {
  readonly value: string;
  readonly label: string;
  readonly keywords: readonly string[];
}

interface PickerProps {
  readonly title: string;
  readonly placeholder: string;
  readonly items: readonly PickerItem[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}

/** Type-to-find single choice for long lists (≈250 countries, ≈150 currencies). */
function Picker({ title, placeholder, items, value, onChange }: PickerProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [text, setText] = useState('');
  const selected = items.find((item) => item.value === value) ?? null;

  const matches = useMemo(() => {
    const needle = normalizeText(text);
    if (!needle) return [];
    return items
      .filter((item) => item.keywords.some((keyword) => normalizeText(keyword).includes(needle)))
      .slice(0, MAX_PICKER_MATCHES);
  }, [items, text]);

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      {selected ? (
        <AppChip
          label={selected.label}
          selected
          trailingIcon="close"
          accessibilityLabel={t('search.removeFilter', { label: selected.label })}
          onPress={() => onChange(null)}
        />
      ) : (
        <>
          <AppInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            accessibilityLabel={title}
            leftIcon="search"
            clearable
            autoCorrect={false}
            autoCapitalize="none"
          />
          {text && matches.length === 0 ? (
            <AppText variant="caption" color="textSecondary">
              {t('filters.noMatches')}
            </AppText>
          ) : null}
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            {matches.map((item) => (
              <AppChip
                key={item.value}
                label={item.label}
                selected={false}
                onPress={() => {
                  onChange(item.value);
                  setText('');
                }}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  apply: { flex: 1 },
});
