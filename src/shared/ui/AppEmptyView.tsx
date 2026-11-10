import { type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from './AppButton';
import { type AppIconName } from './icons';
import { StateView } from './StateView';

export interface AppEmptyViewProps {
  readonly title: string;
  readonly message?: string;
  readonly icon?: AppIconName;
  /** Optional call to action, e.g. "Plan a trip". Shown only when both are set. */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly fullScreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Friendly placeholder for lists and screens with no content yet. */
export function AppEmptyView({
  title,
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
  fullScreen,
  style,
  testID,
}: AppEmptyViewProps) {
  return (
    <StateView
      icon={icon}
      tone="neutral"
      title={title}
      message={message}
      fullScreen={fullScreen}
      style={style}
      testID={testID}
      actions={
        actionLabel && onAction ? <AppButton label={actionLabel} variant="secondary" onPress={onAction} /> : null
      }
    />
  );
}
