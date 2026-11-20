import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { buildDirectionsUrls } from '@/features/map/domain/directions';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { openExternalUrl } from '@/shared/navigation/openExternalUrl';
import { routes } from '@/shared/navigation/routes';
import { AppBottomSheet, AppButton, InlineMessage } from '@/shared/ui';

import { type Favorite } from '../../domain/Favorite';
import { opensDestination } from '../format';
import { removeFavorite } from '../state/favoritesSlice';
import { CollectionPickerSheet } from './CollectionPickerSheet';

type Step = 'menu' | 'collections' | 'remove';

interface SavedPlaceActionsSheetProps {
  /** The place whose actions are shown; `null` hides the sheet. */
  readonly favorite: Favorite | null;
  readonly onClose: () => void;
}

/** Open, Collections, Directions (map places) and Remove for one saved place. Remove asks first. */
export function SavedPlaceActionsSheet({ favorite, onClose }: SavedPlaceActionsSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const { logger } = useDependencies();
  const [step, setStep] = useState<Step>('menu');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep showing the last place while the sheet slides away, and start from the menu each time it opens.
  const [shown, setShown] = useState(favorite);
  const [wasOpen, setWasOpen] = useState(false);
  const open = favorite !== null;
  if (favorite !== null && favorite !== shown) setShown(favorite);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep('menu');
      setErrorMessage(null);
    }
  }
  const current = favorite ?? shown;
  const coordinates =
    current && current.latitude !== null && current.longitude !== null
      ? { latitude: current.latitude, longitude: current.longitude }
      : null;

  const openDestination = () => {
    if (!current) return;
    onClose();
    router.push(routes.destination(current.targetId));
  };

  const openDirections = async () => {
    if (!current || !coordinates) return;
    setErrorMessage(null);
    for (const url of buildDirectionsUrls(coordinates, current.name, Platform.OS)) {
      if (await openExternalUrl(url, logger.child({ scope: 'favorites' }))) {
        onClose();
        return;
      }
    }
    setErrorMessage(t('savedPlaces.actions.directionsFailed'));
  };

  const remove = async () => {
    if (!current) return;
    setErrorMessage(null);
    const action = await dispatch(removeFavorite(current.id));
    // Refused (another change is running) or thrown: say so rather than returning to the menu silently.
    if (!removeFavorite.fulfilled.match(action)) {
      setErrorMessage(t(getErrorMessageKey('unknown')));
      setStep('menu');
      return;
    }
    if (action.payload.status === 'removed') {
      onClose();
    } else {
      setErrorMessage(t(getErrorMessageKey(action.payload.errorKind)));
      setStep('menu');
    }
  };

  return (
    <>
      <AppBottomSheet
        visible={open && step === 'menu'}
        onClose={onClose}
        title={current?.name}
        testID="saved-place-actions"
      >
        <View style={{ gap: spacing.sm }}>
          {errorMessage ? <InlineMessage tone="danger" icon="error" message={errorMessage} /> : null}
          {current && opensDestination(current) ? (
            <AppButton
              label={t('savedPlaces.actions.open')}
              leftIcon="chevronRight"
              variant="outline"
              fullWidth
              onPress={openDestination}
            />
          ) : null}
          <AppButton
            label={t('savedPlaces.actions.collections')}
            leftIcon="bookmark"
            variant="outline"
            fullWidth
            onPress={() => setStep('collections')}
          />
          {current && !opensDestination(current) && coordinates ? (
            <AppButton
              label={t('savedPlaces.actions.directions')}
              leftIcon="directions"
              variant="outline"
              fullWidth
              onPress={() => void openDirections()}
            />
          ) : null}
          <AppButton
            label={t('savedPlaces.actions.remove')}
            leftIcon="trash"
            variant="ghost"
            fullWidth
            onPress={() => setStep('remove')}
          />
        </View>
      </AppBottomSheet>

      <CollectionPickerSheet visible={open && step === 'collections'} favorite={current} onClose={onClose} />

      <ConfirmSheet
        visible={open && step === 'remove'}
        title={t('savedPlaces.remove.title')}
        message={t('savedPlaces.remove.message', { name: current?.name ?? '' })}
        confirmLabel={t('savedPlaces.remove.confirm')}
        cancelLabel={t('savedPlaces.remove.keep')}
        onConfirm={() => void remove()}
        onCancel={() => setStep('menu')}
        testID="remove-favorite-confirm"
      />
    </>
  );
}
