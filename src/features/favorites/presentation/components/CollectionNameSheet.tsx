import { type TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { AppBottomSheet, AppButton, AppInput } from '@/shared/ui';

import { type Collection, MAX_COLLECTION_NAME, MAX_CUSTOM_COLLECTIONS } from '../../domain/Collection';
import { type CollectionValidationError } from '../../domain/usecases/favoriteUseCases';
import { type CollectionChangeOutcome, createCollection, renameCollection } from '../state/favoritesSlice';
import { selectFavoritesSaving } from '../state/selectors';

interface CollectionNameSheetProps {
  readonly visible: boolean;
  /** The custom collection to rename; `null` creates a new one. */
  readonly collection: Collection | null;
  readonly onClose: () => void;
}

function validationMessage(error: CollectionValidationError, t: TFunction): string {
  switch (error) {
    case 'required':
      return t('savedPlaces.collection.nameRequired');
    case 'tooLong':
      return t('savedPlaces.collection.nameTooLong', { max: MAX_COLLECTION_NAME });
    case 'duplicate':
      return t('savedPlaces.collection.nameDuplicate');
    case 'limitReached':
      return t('savedPlaces.collection.limitReached', { max: MAX_CUSTOM_COLLECTIONS });
  }
}

/** Creates a collection or renames one; a refused name is explained under the field and nothing is saved. */
export function CollectionNameSheet({ visible, collection, onClose }: CollectionNameSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectFavoritesSaving);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Start from the current name each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(collection?.name ?? '');
      setError(null);
    }
  }

  const submit = async () => {
    setError(null);
    // A refused dispatch (another change is running) or a throw has no outcome to show.
    let outcome: CollectionChangeOutcome | null = null;
    if (collection) {
      const action = await dispatch(renameCollection({ id: collection.id, name }));
      if (renameCollection.fulfilled.match(action)) outcome = action.payload;
    } else {
      const action = await dispatch(createCollection(name));
      if (createCollection.fulfilled.match(action)) outcome = action.payload;
    }
    if (outcome === null) return;
    if (outcome.status === 'saved') onClose();
    else if (outcome.status === 'invalid') setError(validationMessage(outcome.error, t));
    else setError(t(getErrorMessageKey(outcome.errorKind)));
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={collection ? t('savedPlaces.collection.renameTitle') : t('savedPlaces.collection.createTitle')}
      testID="collection-name-sheet"
    >
      <View style={{ gap: spacing.lg }}>
        <AppInput
          label={t('savedPlaces.collection.nameLabel')}
          placeholder={t('savedPlaces.collection.namePlaceholder')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          error={error ?? undefined}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        <AppButton
          label={t('savedPlaces.collection.save')}
          fullWidth
          loading={saving}
          disabled={saving}
          onPress={() => void submit()}
        />
      </View>
    </AppBottomSheet>
  );
}
