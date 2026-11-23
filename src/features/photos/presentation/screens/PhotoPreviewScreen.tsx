import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppCard, AppEmptyView, AppIconButton, AppText, InlineMessage, Screen } from '@/shared/ui';

import { validatePickedImage } from '../../domain/imageValidation';
import { type PickedImage } from '../../domain/Photo';
import { type AttachRejection, type RejectedImage } from '../../domain/usecases/photoUseCases';
import { rejectionMessage } from '../format';
import { attachPhotos, clearPendingPhotos, removePendingImage } from '../state/photosSlice';
import { selectPendingPhotos, selectPhotosSaving } from '../state/selectors';

interface PhotoPreviewScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
  readonly activityId: string | null;
}

const NO_IMAGES: readonly PickedImage[] = [];
const THUMBNAIL_SIZE = 88;

/** The captured or picked images (local previews), with Attach and Discard. */
export function PhotoPreviewScreen({ tripId, activityId }: PhotoPreviewScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const pending = useAppSelector(selectPendingPhotos);
  const saving = useAppSelector(selectPhotosSaving);
  const [notice, setNotice] = useState<AppErrorKind | null>(null);
  // Rejections the attach itself reported (e.g. the trip is full), by position.
  const [reported, setReported] = useState<readonly RejectedImage[]>([]);
  // Set once the screen is going away, so it doesn't flash "Nothing to preview" as the selection is cleared.
  const [leaving, setLeaving] = useState(false);
  // Set when only some images were attached; the screen stays open to show which ones weren't.
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const attaching = useRef(false);

  // Pending photos are only shown on the screen they were picked for; a link can't bring up another trip's.
  const images = pending && pending.tripId === tripId && pending.activityId === activityId ? pending.images : NO_IMAGES;
  const reasons = useMemo(
    () =>
      images.map((image, index): AttachRejection | null => {
        const validation = validatePickedImage(image);
        if (!validation.ok) return validation.reason;
        return reported.find((rejection) => rejection.index === index)?.reason ?? null;
      }),
    [images, reported],
  );
  const attachable = reasons.filter((reason) => reason === null).length;

  const leave = () => {
    setLeaving(true);
    if (router.canGoBack()) router.back();
    else router.replace(activityId === null ? routes.tripPhotos(tripId) : routes.activityPhotos(tripId, activityId));
    dispatch(clearPendingPhotos());
  };

  const attach = async () => {
    if (attaching.current) return;
    attaching.current = true;
    setNotice(null);
    try {
      const action = await dispatch(attachPhotos({ tripId, activityId, images }));
      if (attachPhotos.rejected.match(action)) {
        if (!action.meta.condition) setNotice('unknown');
        return;
      }
      const outcome = action.payload;
      if (outcome.status === 'saved') {
        // Images that failed validation were already flagged in this preview. Ones dropped only at attach
        // time (the trip hit its photo cap) were not, so say so before leaving.
        if (!outcome.rejected.some((rejection) => rejection.reason === 'limitReached')) leave();
        else {
          setReported(outcome.rejected);
          setSavedCount(outcome.photos.length);
        }
      } else if (outcome.status === 'invalid') setReported(outcome.rejected);
      else setNotice(outcome.errorKind);
    } finally {
      attaching.current = false;
    }
  };

  const remove = (index: number) => {
    setReported([]);
    dispatch(removePendingImage(index));
  };

  if (leaving) return null;
  if (images.length === 0) {
    return (
      <AppEmptyView
        fullScreen
        icon="image"
        title={t('photos.preview.emptyTitle')}
        message={t('photos.preview.emptyMessage')}
        actionLabel={t('common.back')}
        onAction={leave}
        testID="photo-preview-empty"
      />
    );
  }

  return (
    <Screen>
      <View testID="photo-preview" style={{ gap: spacing.md }}>
        {images.map((image, index) => (
          <PreviewItem
            key={image.uri}
            image={image}
            index={index}
            reason={reasons[index] ?? null}
            onRemove={() => remove(index)}
            disabled={saving || savedCount !== null}
          />
        ))}
      </View>

      {savedCount !== null ? (
        <InlineMessage
          tone="warning"
          message={t('photos.preview.partialAdded', { saved: savedCount, total: images.length })}
        />
      ) : attachable === 0 ? (
        <InlineMessage tone="warning" message={t('photos.preview.noneValid')} />
      ) : null}
      {notice ? (
        <InlineMessage
          message={t(getErrorMessageKey(notice))}
          dismissLabel={t('common.dismiss')}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {savedCount !== null ? (
          <AppButton label={t('photos.preview.partialDone')} leftIcon="check" fullWidth onPress={leave} />
        ) : (
          <>
            <AppButton
              label={t('photos.preview.attach', { count: attachable })}
              leftIcon="check"
              fullWidth
              loading={saving}
              disabled={attachable === 0}
              onPress={() => void attach()}
            />
            <AppButton
              label={t('photos.preview.discard')}
              variant="ghost"
              leftIcon="close"
              fullWidth
              disabled={saving}
              onPress={leave}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

interface PreviewItemProps {
  readonly image: PickedImage;
  readonly index: number;
  readonly reason: AttachRejection | null;
  readonly onRemove: () => void;
  readonly disabled: boolean;
}

/** One image shown from its temporary file, before anything is copied or saved. */
function PreviewItem({ image, index, reason, onRemove, disabled }: PreviewItemProps) {
  const { t } = useTranslation();
  const { spacing, radii, colors } = useAppTheme();
  const number = index + 1;

  return (
    <AppCard variant="outlined" padding="md" testID={`preview-item-${index}`}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <Image
          source={{ uri: image.uri }}
          recyclingKey={image.uri}
          contentFit="cover"
          accessible
          accessibilityLabel={t('photos.preview.imageLabel', { number })}
          style={[styles.thumbnail, { borderRadius: radii.sm, backgroundColor: colors.surfaceMuted }]}
        />
        <View style={[styles.fill, { gap: spacing.xs }]}>
          <AppText variant="headline">{t('photos.preview.imageLabel', { number })}</AppText>
          {reason ? (
            <AppText variant="callout" color="danger">
              {rejectionMessage(reason, t)}
            </AppText>
          ) : null}
        </View>
        <AppIconButton
          icon="close"
          accessibilityLabel={t('photos.preview.remove', { number })}
          disabled={disabled}
          onPress={onRemove}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
});
