import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, type AppIconName, AppText } from '@/shared/ui';

interface PickerFieldProps {
  readonly label: string;
  /** The current choice; `placeholder` shows while there is none. */
  readonly value: string | null;
  readonly placeholder: string;
  readonly icon: AppIconName;
  readonly hint?: string;
  readonly error?: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A form field that opens a picker: looks like `AppInput`, behaves like a button. */
export function PickerField({ label, value, placeholder, icon, hint, error, onPress, testID }: PickerFieldProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const message = error ?? hint;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityHint={message}
        onPress={onPress}
        style={({ pressed }) => [
          styles.field,
          {
            minHeight: sizes.input,
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.md,
            borderWidth: error ? sizes.focusBorder : sizes.border,
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          },
        ]}
      >
        <AppIcon name={icon} size="md" color="textSecondary" />
        <AppText color={value ? 'text' : 'textTertiary'} numberOfLines={1} style={styles.value}>
          {value ?? placeholder}
        </AppText>
        <AppIcon name="chevronDown" size="sm" color="textSecondary" />
      </Pressable>
      {message ? (
        <AppText
          variant="caption"
          color={error ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  value: { flex: 1 },
});
