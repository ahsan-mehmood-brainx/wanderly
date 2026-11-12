import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppIcon } from './AppIcon';
import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export interface AppInputProps extends Omit<TextInputProps, 'style' | 'editable'> {
  readonly ref?: Ref<TextInputInstance>;
  readonly label?: string;
  /** Helper text shown under the field. Replaced by `error` when present. */
  readonly hint?: string;
  readonly error?: string;
  readonly leftIcon?: AppIconName;
  /** Shows a clear button while the field has text. Requires `value` and `onChangeText`. */
  readonly clearable?: boolean;
  readonly disabled?: boolean;
  readonly containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Labelled text field with hint/error messaging, an optional leading icon,
 * a clear button, and a show/hide toggle for `secureTextEntry` fields.
 */
export function AppInput({
  ref,
  label,
  hint,
  error,
  leftIcon,
  clearable = false,
  disabled = false,
  containerStyle,
  secureTextEntry,
  multiline,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...inputProps
}: AppInputProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes, typography, opacity } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const hasError = Boolean(error);
  const message = error ?? hint;
  const borderColor = hasError ? colors.danger : focused ? colors.primary : colors.border;
  const showClear = clearable && !disabled && Boolean(inputProps.value) && inputProps.onChangeText !== undefined;

  return (
    <View style={[{ gap: spacing.xs }, containerStyle]}>
      {label ? (
        <AppText variant="label" color="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            minHeight: sizes.input,
            borderRadius: radii.md,
            borderColor,
            borderWidth: focused || hasError ? sizes.focusBorder : sizes.border,
            // Keep text from shifting when the border thickens on focus.
            paddingHorizontal: spacing.lg - (focused || hasError ? sizes.focusBorder - sizes.border : 0),
            backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
            gap: spacing.sm,
            opacity: disabled ? opacity.disabled : 1,
          },
          multiline ? { alignItems: 'flex-start', paddingVertical: spacing.md } : null,
        ]}
      >
        {leftIcon ? <AppIcon name={leftIcon} size="md" color="textSecondary" /> : null}
        <TextInput
          ref={ref}
          {...inputProps}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={message}
          accessibilityState={{ disabled }}
          editable={!disabled}
          multiline={multiline}
          secureTextEntry={secureTextEntry === true && !revealed}
          placeholderTextColor={colors.textTertiary}
          selectionColor={Platform.OS === 'ios' ? colors.primary : colors.primaryMuted}
          cursorColor={colors.primary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, typography.body, { color: colors.text }, multiline ? styles.multiline : null]}
        />
        {showClear ? (
          <AppIconButton
            icon="clear"
            color="textTertiary"
            accessibilityLabel={t('common.clearText')}
            onPress={() => inputProps.onChangeText?.('')}
          />
        ) : null}
        {secureTextEntry ? (
          <AppIconButton
            icon={revealed ? 'eyeOff' : 'eye'}
            color="textSecondary"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            onPress={() => setRevealed((value) => !value)}
          />
        ) : null}
      </View>
      {message ? (
        <AppText
          variant="caption"
          color={hasError ? 'danger' : 'textSecondary'}
          accessibilityLiveRegion={hasError ? 'polite' : 'none'}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: 0,
    // Android adds extra font padding that misaligns text vertically.
    includeFontPadding: false,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
