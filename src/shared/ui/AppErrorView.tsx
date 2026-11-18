import { useTranslation } from 'react-i18next';
import { type StyleProp, type ViewStyle } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey, isConnectivityError } from '@/core/errors/errorMessages';

import { AppButton } from './AppButton';
import { type AppIconName } from './icons';
import { StateView } from './StateView';

export interface AppErrorViewProps {
  /**
   * Picks a translated message (and the offline title/icon for `offline`) for this
   * error kind. Explicit `title`, `message` and `icon` still win.
   */
  readonly errorKind?: AppErrorKind;
  /** Defaults to a generic "Something went wrong". */
  readonly title?: string;
  readonly message?: string;
  /** Defaults to `offline` for connectivity errors, otherwise `error`. */
  readonly icon?: AppIconName;
  /** Shows a retry button when provided. */
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly fullScreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Blocking error state for a screen or section, with an optional retry. */
export function AppErrorView({
  errorKind,
  title,
  message,
  icon,
  onRetry,
  retryLabel,
  fullScreen,
  style,
  testID,
}: AppErrorViewProps) {
  const { t } = useTranslation();
  const offline = errorKind === 'offline';

  return (
    <StateView
      icon={icon ?? (errorKind && isConnectivityError(errorKind) ? 'offline' : 'error')}
      tone="danger"
      title={title ?? (offline ? t('errors.offlineTitle') : t('errors.unexpectedTitle'))}
      message={message ?? (errorKind ? t(getErrorMessageKey(errorKind)) : t('errors.unexpectedMessage'))}
      fullScreen={fullScreen}
      style={style}
      testID={testID}
      actions={
        onRetry ? <AppButton label={retryLabel ?? t('common.tryAgain')} leftIcon="refresh" onPress={onRetry} /> : null
      }
    />
  );
}
