import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppButton, AppText } from '@/shared/ui';

interface ConfirmSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testID?: string;
}

/** Asks before a destructive action. A sheet rather than `Alert`, which does nothing on web. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testID,
}: ConfirmSheetProps) {
  const { spacing } = useAppTheme();
  return (
    <AppBottomSheet visible={visible} onClose={onCancel} title={title} testID={testID}>
      <View style={{ gap: spacing.lg }}>
        <AppText color="textSecondary">{message}</AppText>
        <View style={{ gap: spacing.sm }}>
          <AppButton label={confirmLabel} variant="danger" fullWidth onPress={onConfirm} />
          <AppButton label={cancelLabel} variant="ghost" fullWidth onPress={onCancel} />
        </View>
      </View>
    </AppBottomSheet>
  );
}
