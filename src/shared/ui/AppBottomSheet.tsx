import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useReduceMotion } from '@/shared/hooks/useReduceMotion';

import { AppText } from './AppText';

export interface AppBottomSheetProps {
  readonly visible: boolean;
  /** Called on backdrop tap, drag-down, Android back, or the iOS VoiceOver escape gesture. */
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
  /** When false, the sheet can only be closed by changing `visible`. */
  readonly dismissible?: boolean;
  readonly testID?: string;
}

/** Distance (pt) or downward velocity past which a drag dismisses the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1.2;
const MAX_HEIGHT_RATIO = 0.9;
const SPRING = { damping: 28, stiffness: 260, mass: 1, useNativeDriver: true } as const;

/**
 * Modal sheet that slides up from the bottom. Built on React Native's `Modal`
 * and `Animated` (native driver) so it needs no extra native dependencies.
 */
export function AppBottomSheet({ visible, onClose, title, children, dismissible = true, testID }: AppBottomSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes, shadows, motion } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  // Keep the modal mounted while the close animation runs.
  const [prevVisible, setPrevVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    setClosing(!visible);
  }
  const mounted = visible || closing;

  const [translateY] = useState(() => new Animated.Value(windowHeight));
  const [backdrop] = useState(() => new Animated.Value(0));
  const offscreen = windowHeight;

  useEffect(() => {
    if (!visible) return;
    const animation = Animated.parallel([
      reduceMotion
        ? Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true })
        : Animated.spring(translateY, { toValue: 0, ...SPRING }),
      Animated.timing(backdrop, { toValue: 1, duration: motion.duration.normal, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, reduceMotion, translateY, backdrop, motion.duration.normal]);

  useEffect(() => {
    if (!closing) return;
    const duration = reduceMotion ? 0 : motion.duration.normal;
    const animation = Animated.parallel([
      Animated.timing(translateY, { toValue: offscreen, duration, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setClosing(false);
    });
    return () => animation.stop();
  }, [closing, reduceMotion, translateY, backdrop, offscreen, motion.duration.normal]);

  const springBack = () => Animated.spring(translateY, { toValue: 0, ...SPRING }).start();

  // The gesture handlers are created once, so a drag-dismiss is signalled through
  // state and handled here, where the latest `dismissible`/`onClose` are visible.
  const [dragDismissRequests, setDragDismissRequests] = useState(0);
  const onDragDismiss = useEffectEvent(() => {
    if (dismissible) onClose();
    else springBack();
  });
  useEffect(() => {
    if (dragDismissRequests > 0) onDragDismiss();
  }, [dragDismissRequests]);

  const panResponder = useMemo(() => {
    const settle = () => Animated.spring(translateY, { toValue: 0, ...SPRING }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY)
          setDragDismissRequests((count) => count + 1);
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [translateY]);

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      testID={testID}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdrop }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          disabled={!dismissible}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={requestClose}
          style={[
            styles.sheet,
            shadows.lg,
            {
              maxHeight: windowHeight * MAX_HEIGHT_RATIO,
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY }],
            },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            style={{ paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md }}
          >
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={[
                styles.handle,
                {
                  width: sizes.sheetHandle.width,
                  height: sizes.sheetHandle.height,
                  borderRadius: radii.pill,
                  backgroundColor: colors.borderStrong,
                },
              ]}
            />
            {title ? (
              <AppText variant="subtitle" accessibilityRole="header" style={{ paddingHorizontal: spacing.xl }}>
                {title}
              </AppText>
            ) : null}
          </View>
          <View style={[styles.content, { paddingHorizontal: spacing.xl }]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', overflow: 'visible' },
  handle: { alignSelf: 'center' },
  content: { flexShrink: 1 },
});
