import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, AppCard, InlineMessage } from '@/shared/ui';

import { type useAddPhotos } from '../hooks/useAddPhotos';
import { useMediaPermission } from '../hooks/useMediaPermission';
import { MediaPermissionView } from './MediaPermissionView';

interface AddPhotoMenuProps {
  readonly flow: ReturnType<typeof useAddPhotos>;
}

/**
 * "Add photo" with its choices shown in place rather than in a modal sheet: on iOS
 * the system photo picker can't be presented while a modal is still dismissing.
 */
export function AddPhotoMenu({ flow }: AddPhotoMenuProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <AppButton label={t('photos.addPhoto')} leftIcon="add" fullWidth onPress={flow.toggle} />
      {flow.step === 'options' ? (
        <AppCard variant="outlined" accessibilityLabel={t('photos.addOptionsLabel')}>
          <View style={{ gap: spacing.sm }}>
            <AppButton
              label={t('photos.takePhoto')}
              variant="outline"
              leftIcon="camera"
              fullWidth
              onPress={flow.takePhoto}
            />
            <AppButton
              label={t('photos.chooseFromLibrary')}
              variant="outline"
              leftIcon="image"
              fullWidth
              onPress={flow.chooseFromLibrary}
            />
          </View>
        </AppCard>
      ) : null}
      {flow.step === 'libraryPermission' ? (
        <LibraryPermissionPrompt onAllowed={flow.continueWithLibrary} onCancel={flow.close} />
      ) : null}
      {flow.pickFailed ? (
        <InlineMessage
          message={t('photos.pickFailed')}
          dismissLabel={t('common.dismiss')}
          onDismiss={flow.dismissPickFailed}
        />
      ) : null}
    </View>
  );
}

interface LibraryPermissionPromptProps {
  readonly onAllowed: () => void;
  readonly onCancel: () => void;
}

/** Explains library access; continues to the picker as soon as access is allowed (also after a trip to Settings). */
function LibraryPermissionPrompt({ onAllowed, onCancel }: LibraryPermissionPromptProps) {
  const permission = useMediaPermission('library');
  const continueToPicker = useEffectEvent(onAllowed);

  useEffect(() => {
    if (permission.allowed) continueToPicker();
  }, [permission.allowed]);

  if (permission.allowed) return null;
  return (
    <AppCard variant="outlined">
      <MediaPermissionView kind="library" state={permission} onCancel={onCancel} />
    </AppCard>
  );
}
