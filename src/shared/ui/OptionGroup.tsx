import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/core/theme/tokens';

import { AppText } from './AppText';

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

interface OptionGroupProps<T extends string> {
  readonly title: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/** Accessible single-choice list (radio group) rendered as a grouped settings card. */
export function OptionGroup<T extends string>({ title, options, value, onChange }: OptionGroupProps<T>) {
  const { colors, spacing, radii } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText
        variant="sectionTitle"
        color="textSecondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.xs }}
      >
        {title}
      </AppText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              style={({ pressed }) => [
                styles.row,
                { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <View style={styles.labels}>
                <AppText>{option.label}</AppText>
                {option.description ? (
                  <AppText variant="caption" color="textSecondary">
                    {option.description}
                  </AppText>
                ) : null}
              </View>
              <View
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}
              >
                {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const RADIO_SIZE = 22;

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
  },
  labels: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: RADIO_SIZE / 2,
    height: RADIO_SIZE / 2,
    borderRadius: RADIO_SIZE / 4,
  },
});
