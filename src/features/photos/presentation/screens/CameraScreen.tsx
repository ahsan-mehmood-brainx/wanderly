import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppIconButton, AppLoader, InlineMessage } from '@/shared/ui';
import { StateView } from '@/shared/ui/StateView';

import { CameraCanvas, type CameraCanvasHandle, type CameraFacing } from '../components/CameraCanvas';
import { MediaPermissionView } from '../components/MediaPermissionView';
import { useMediaPermission } from '../hooks/useMediaPermission';
import { setPendingPhotos } from '../state/photosSlice';

interface CameraScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
  readonly activityId: string | null;
}

/** The viewfinder stays dark in both themes, like the system camera. */
const VIEWFINDER_BACKGROUND = '#000000';
const SHUTTER_SIZE = 72;

/** Captures a photo with the device camera, then opens Preview with it. */
export function CameraScreen({ tripId, activityId }: CameraScreenProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { photoFileStore } = useDependencies();
  const permission = useMediaPermission('camera');

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(activityId === null ? routes.tripPhotos(tripId) : routes.activityPhotos(tripId, activityId));
  }, [activityId, tripId]);

  if (!photoFileStore.supported) {
    return (
      <AppEmptyView
        fullScreen
        icon="camera"
        title={t('photos.unsupportedTitle')}
        message={t('photos.unsupportedMessage')}
        actionLabel={t('common.back')}
        onAction={close}
        testID="photos-unsupported"
      />
    );
  }
  if (permission.permission === null) return <AppLoader fullScreen />;
  if (!permission.allowed) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MediaPermissionView kind="camera" state={permission} onCancel={close} fullScreen />
      </View>
    );
  }
  return <CameraCapture tripId={tripId} activityId={activityId} onClose={close} />;
}

interface CameraCaptureProps extends CameraScreenProps {
  readonly onClose: () => void;
}

function CameraCapture({ tripId, activityId, onClose }: CameraCaptureProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { logger } = useDependencies();
  const canvas = useRef<CameraCanvasHandle>(null);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // A tap while the camera is still starting is kept and taken once it is ready.
  const [queued, setQueued] = useState(false);
  const queuedRef = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onMountError = useCallback(
    (message: string) => {
      logger.warn('The camera could not start', { message });
      setUnavailable(true);
    },
    [logger],
  );

  const capture = async () => {
    const camera = canvas.current;
    if (!camera || inFlight.current) return;
    inFlight.current = true;
    setCapturing(true);
    setCaptureFailed(false);
    try {
      const picture = await camera.takePicture();
      if (!mounted.current) return;
      dispatch(setPendingPhotos({ tripId, activityId, images: [picture] }));
      // Preview takes the camera's place, so going back from it returns to the gallery.
      router.replace(routes.photoPreview(tripId, activityId));
    } catch (error) {
      logger.warn('Could not take a picture', { error });
      setCaptureFailed(true);
    } finally {
      inFlight.current = false;
      setCapturing(false);
    }
  };

  const onReady = () => {
    setReady(true);
    if (!queuedRef.current) return;
    queuedRef.current = false;
    setQueued(false);
    void capture();
  };

  const pressShutter = () => {
    if (ready) {
      void capture();
    } else {
      queuedRef.current = true;
      setQueued(true);
    }
  };

  if (unavailable) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <StateView
          fullScreen
          icon="camera"
          tone="danger"
          title={t('photos.camera.unavailableTitle')}
          message={t('photos.camera.unavailableMessage')}
          actions={<AppButton label={t('common.back')} leftIcon="back" onPress={onClose} />}
          testID="camera-unavailable"
        />
      </View>
    );
  }

  const switchCamera = () => setFacing((current) => (current === 'back' ? 'front' : 'back'));

  return (
    <View style={[styles.fill, { backgroundColor: VIEWFINDER_BACKGROUND }]}>
      <CameraCanvas ref={canvas} facing={facing} onReady={onReady} onMountError={onMountError} />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg }]}>
        <AppIconButton icon="close" variant="surface" accessibilityLabel={t('photos.camera.close')} onPress={onClose} />
      </View>
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.md },
        ]}
      >
        {captureFailed ? (
          <InlineMessage
            message={t('photos.camera.captureFailed')}
            dismissLabel={t('common.dismiss')}
            onDismiss={() => setCaptureFailed(false)}
          />
        ) : null}
        <View style={styles.controls}>
          <View style={styles.side} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('photos.camera.capture')}
            accessibilityState={{ disabled: capturing || queued, busy: capturing || queued }}
            disabled={capturing || queued}
            onPress={pressShutter}
            style={({ pressed }) => [
              styles.shutter,
              { borderColor: colors.surface, opacity: !ready || capturing || queued ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.shutterInner, { backgroundColor: colors.surface }]} />
          </Pressable>
          <View style={styles.side}>
            <AppIconButton
              icon="flipCamera"
              variant="surface"
              accessibilityLabel={t('photos.camera.flip')}
              disabled={capturing}
              onPress={switchCamera}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { position: 'absolute', top: 0, start: 0, end: 0, flexDirection: 'row' },
  bottomBar: { position: 'absolute', bottom: 0, start: 0, end: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { flex: 1, alignItems: 'center' },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
  },
});
