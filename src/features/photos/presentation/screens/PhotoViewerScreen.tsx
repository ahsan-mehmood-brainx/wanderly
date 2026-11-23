import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { setTripCover } from '@/features/trips/presentation/state/tripsSlice';
import { routes } from '@/shared/navigation/routes';
import {
  AppButton,
  AppCard,
  AppEmptyView,
  AppIcon,
  type AppIconName,
  AppText,
  InlineMessage,
  Screen,
} from '@/shared/ui';

import { PhotosStateView } from '../components/PhotosStateView';
import { formatFileSize, formatPhotoDate } from '../format';
import { type PhotoItem, usePhoto } from '../hooks/usePhotos';
import { deletePhoto } from '../state/photosSlice';

interface PhotoViewerScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
  readonly photoId: string;
  /** Set when opened from an activity's gallery. */
  readonly activityId: string | null;
}

/** One photo with its details, Delete and (for trip photos) Set as cover. */
export function PhotoViewerScreen({ tripId, photoId, activityId }: PhotoViewerScreenProps) {
  const { t } = useTranslation();
  const { screen, item, retry } = usePhoto(tripId, photoId, activityId);
  // Set once deletion starts: the photo leaves the store before the screen has gone back.
  const [deleting, setDeleting] = useState(false);

  // Lives in this screen, which survives the swap from the details to the empty state after a delete.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const backToGallery = () => {
    // The traveller may already have left; only the screen still showing goes back.
    if (!mounted.current) return;
    if (router.canGoBack()) router.back();
    else router.replace(activityId === null ? routes.tripPhotos(tripId) : routes.activityPhotos(tripId, activityId));
  };

  if (screen.kind !== 'ready') return <PhotosStateView state={screen} tripId={tripId} onRetry={retry} />;
  if (item) return <PhotoDetails item={item} onDeletingChange={setDeleting} onDeleted={backToGallery} />;
  if (deleting) return null;
  return (
    <AppEmptyView
      fullScreen
      icon="image"
      title={t('photos.viewer.notFoundTitle')}
      message={t('photos.viewer.notFoundMessage')}
      actionLabel={t('photos.viewer.backToGallery')}
      onAction={() =>
        router.navigate(activityId === null ? routes.tripPhotos(tripId) : routes.activityPhotos(tripId, activityId))
      }
      testID="photo-not-found"
    />
  );
}

type Notice = { readonly kind: 'failed'; readonly errorKind: AppErrorKind } | { readonly kind: 'coverSet' };

interface PhotoDetailsProps {
  readonly item: PhotoItem;
  readonly onDeletingChange: (deleting: boolean) => void;
  readonly onDeleted: () => void;
}

function PhotoDetails({ item, onDeletingChange, onDeleted }: PhotoDetailsProps) {
  const { t, i18n } = useTranslation();
  const { spacing, radii, colors } = useAppTheme();
  const dispatch = useAppDispatch();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [settingCover, setSettingCover] = useState(false);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const deleting = useRef(false);
  const { photo, displayUri, activityTitle } = item;

  const language = i18n.language;
  const imageUri = displayUri !== null && failedUri !== displayUri ? displayUri : null;
  const added = formatPhotoDate(photo.createdAt, language);

  // The sheet stays open while the photo is deleted: it goes away with the screen,
  // and only closes here (to show why) when the delete fails.
  const confirmDelete = async () => {
    if (deleting.current) return;
    deleting.current = true;
    setNotice(null);
    onDeletingChange(true);
    const action = await dispatch(deletePhoto(photo.id));
    deleting.current = false;
    if (deletePhoto.fulfilled.match(action) && action.payload.status === 'deleted') {
      onDeleted();
      return;
    }
    setConfirmingDelete(false);
    onDeletingChange(false);
    if (deletePhoto.fulfilled.match(action) && action.payload.status === 'failed') {
      setNotice({ kind: 'failed', errorKind: action.payload.errorKind });
    } else if (deletePhoto.rejected.match(action) && !action.meta.condition) {
      setNotice({ kind: 'failed', errorKind: 'unknown' });
    }
  };

  const makeCover = async (sourceUri: string) => {
    if (settingCover) return;
    setSettingCover(true);
    setNotice(null);
    try {
      const action = await dispatch(setTripCover({ id: photo.tripId, sourceUri }));
      if (setTripCover.rejected.match(action)) {
        if (!action.meta.condition) setNotice({ kind: 'failed', errorKind: 'unknown' });
        return;
      }
      const outcome = action.payload;
      if (outcome.status === 'saved') setNotice({ kind: 'coverSet' });
      else setNotice({ kind: 'failed', errorKind: outcome.status === 'failed' ? outcome.errorKind : 'unknown' });
    } finally {
      setSettingCover(false);
    }
  };

  return (
    <Screen>
      <View testID="photo-viewer" style={{ gap: spacing.lg }}>
        <View style={[styles.frame, { borderRadius: radii.lg, backgroundColor: colors.surfaceMuted }]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              recyclingKey={imageUri}
              contentFit="contain"
              transition={150}
              onError={() => setFailedUri(imageUri)}
              accessible
              accessibilityLabel={t('photos.viewer.imageLabel', { date: added })}
              style={[styles.image, { aspectRatio: photo.width / photo.height }]}
            />
          ) : (
            <View style={[styles.missing, { padding: spacing.xl, gap: spacing.sm }]}>
              <AppIcon name="image" size="xl" color="textTertiary" />
              <AppText variant="headline" align="center">
                {t('photos.unavailable')}
              </AppText>
              <AppText variant="callout" color="textSecondary" align="center">
                {t('photos.viewer.unavailableMessage')}
              </AppText>
            </View>
          )}
        </View>

        {notice ? (
          notice.kind === 'coverSet' ? (
            <InlineMessage
              tone="success"
              icon="checkCircle"
              message={t('photos.viewer.coverSet')}
              dismissLabel={t('common.dismiss')}
              onDismiss={() => setNotice(null)}
            />
          ) : (
            <InlineMessage
              message={t(getErrorMessageKey(notice.errorKind))}
              dismissLabel={t('common.dismiss')}
              onDismiss={() => setNotice(null)}
            />
          )
        ) : null}

        <AppCard variant="outlined">
          <View style={{ gap: spacing.lg }}>
            {activityTitle ? <Fact icon="pin" label={t('photos.viewer.activity')} value={activityTitle} /> : null}
            {photo.takenAt !== null ? (
              <Fact icon="camera" label={t('photos.viewer.taken')} value={formatPhotoDate(photo.takenAt, language)} />
            ) : null}
            <Fact icon="calendar" label={t('photos.viewer.added')} value={added} />
            <Fact
              icon="image"
              label={t('photos.viewer.dimensions')}
              value={t('photos.viewer.dimensionsValue', { width: photo.width, height: photo.height })}
            />
            <Fact icon="info" label={t('photos.viewer.fileSize')} value={formatFileSize(photo.fileSize, language, t)} />
            <Fact
              icon={photo.source === 'camera' ? 'camera' : 'image'}
              label={t('photos.viewer.source')}
              value={t(`photos.viewer.sources.${photo.source}`)}
            />
          </View>
        </AppCard>
      </View>

      <View style={{ gap: spacing.sm }}>
        {imageUri ? (
          <AppButton
            label={t('photos.viewer.setCover')}
            variant="outline"
            leftIcon="image"
            fullWidth
            loading={settingCover}
            onPress={() => void makeCover(imageUri)}
          />
        ) : null}
        <AppButton
          label={t('photos.viewer.delete')}
          variant="ghost"
          leftIcon="trash"
          fullWidth
          onPress={() => setConfirmingDelete(true)}
        />
      </View>

      <ConfirmSheet
        visible={confirmingDelete}
        title={t('photos.viewer.deleteTitle')}
        message={t('photos.viewer.deleteMessage')}
        confirmLabel={t('photos.viewer.deleteConfirm')}
        cancelLabel={t('photos.viewer.keep')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
        testID="delete-photo-sheet"
      />
    </Screen>
  );
}

function Fact({ icon, label, value }: { readonly icon: AppIconName; readonly label: string; readonly value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.fact, { gap: spacing.md }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppIcon name={icon} size="md" color="primary" />
      <View style={[styles.fill, { gap: spacing.xxs }]}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', maxHeight: 520 },
  missing: { alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  fill: { flex: 1 },
  fact: { flexDirection: 'row', alignItems: 'flex-start' },
});
