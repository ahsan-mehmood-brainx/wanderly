import { useTranslation } from 'react-i18next';
import { type StyleProp, type ViewStyle } from 'react-native';

import { AppButton, AppLoader } from '@/shared/ui';
import { StateView } from '@/shared/ui/StateView';

import { type MediaKind } from '../../domain/repositories';
import { type MediaPermissionState } from '../hooks/useMediaPermission';

interface MediaPermissionViewProps {
  readonly kind: MediaKind;
  readonly state: MediaPermissionState;
  /** Offers a way out (e.g. "Not now") when set. */
  readonly onCancel?: () => void;
  readonly fullScreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Explains why camera or photo access is needed before the system asks. Offers
 * Allow while the system can still ask, and Open Settings once access is turned off.
 * Render it only while access isn't allowed.
 */
export function MediaPermissionView({ kind, state, onCancel, fullScreen = false, style }: MediaPermissionViewProps) {
  const { t } = useTranslation();
  if (state.permission === null) return <AppLoader fullScreen={fullScreen} />;

  const variant =
    state.permission === 'blocked' ? 'blocked' : state.permission === 'denied' ? 'denied' : 'undetermined';
  return (
    <StateView
      testID="media-permission"
      icon={kind === 'camera' ? 'camera' : 'image'}
      tone="neutral"
      title={t(`photos.permission.${kind}.${variant}Title`)}
      message={t(`photos.permission.${kind}.${variant}Message`)}
      fullScreen={fullScreen}
      style={style}
      actions={
        <>
          {variant === 'blocked' ? (
            <AppButton label={t('photos.permission.openSettings')} leftIcon="settings" onPress={state.openSettings} />
          ) : (
            <AppButton label={t('photos.permission.allow')} loading={state.requesting} onPress={state.request} />
          )}
          {onCancel ? <AppButton label={t('photos.permission.cancel')} variant="ghost" onPress={onCancel} /> : null}
        </>
      }
    />
  );
}
