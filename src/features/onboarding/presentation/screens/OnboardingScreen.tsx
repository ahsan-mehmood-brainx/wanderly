import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { AppButton, AppText } from '@/shared/ui';

import { SlideIllustration } from '../components/SlideIllustration';
import { ONBOARDING_SLIDES, type OnboardingSlide } from '../slides';
import { completeOnboarding } from '../state/onboardingSlice';

const DOT_SIZE = 8;
const ACTIVE_DOT_WIDTH = 24;

/**
 * Three swipeable intro pages. "Skip" and "Get started" both finish onboarding;
 * the root navigator then moves on to sign-in (the guard flips, no manual navigation).
 */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const [index, setIndex] = useState(0);

  const total = ONBOARDING_SLIDES.length;
  const isLast = index === total - 1;
  const illustrationSize = Math.min(width * 0.68, height * 0.34, 300);

  const finish = useCallback(() => void dispatch(completeOnboarding()), [dispatch]);

  const goTo = useCallback(
    (next: number) => {
      listRef.current?.scrollToIndex({ index: next, animated: !reduceMotion });
      setIndex(next);
    },
    [reduceMotion],
  );

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      setIndex(Math.min(Math.max(page, 0), total - 1));
    },
    [total, width],
  );

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg, minHeight: sizes.touchTarget }]}>
        {isLast ? null : (
          <AppButton
            label={t('onboarding.skip')}
            variant="ghost"
            size="sm"
            accessibilityHint={t('onboarding.skipHint')}
            onPress={finish}
          />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={ONBOARDING_SLIDES}
        keyExtractor={(slide) => slide.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
        style={styles.fill}
        renderItem={({ item, index: itemIndex }) => (
          <View
            style={[styles.slide, { width, paddingHorizontal: spacing.xxl, gap: spacing.xxl }]}
            accessible
            accessibilityLabel={[
              t('onboarding.progress', { current: itemIndex + 1, total }),
              t(`onboarding.slides.${item.id}.title`),
              t(`onboarding.slides.${item.id}.body`),
            ].join('. ')}
          >
            <SlideIllustration
              icon={item.icon}
              size={illustrationSize}
              chips={[
                { icon: item.primaryChipIcon, label: t(`onboarding.slides.${item.id}.chipPrimary`) },
                { icon: item.secondaryChipIcon, label: t(`onboarding.slides.${item.id}.chipSecondary`) },
              ]}
            />
            <View style={[styles.copy, { gap: spacing.md, maxWidth: sizes.maxContentWidth }]}>
              <AppText variant="largeTitle" align="center">
                {t(`onboarding.slides.${item.id}.title`)}
              </AppText>
              <AppText color="textSecondary" align="center">
                {t(`onboarding.slides.${item.id}.body`)}
              </AppText>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingHorizontal: spacing.xl, gap: spacing.xl }]}>
        <View
          style={[styles.dots, { gap: spacing.sm }]}
          accessibilityRole="adjustable"
          accessibilityLabel={t('onboarding.progress', { current: index + 1, total })}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment' && index < total - 1) goTo(index + 1);
            if (nativeEvent.actionName === 'decrement' && index > 0) goTo(index - 1);
          }}
        >
          {ONBOARDING_SLIDES.map((slide, dotIndex) => (
            <Pressable
              key={slide.id}
              onPress={() => goTo(dotIndex)}
              hitSlop={spacing.sm}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={{
                height: DOT_SIZE,
                width: dotIndex === index ? ACTIVE_DOT_WIDTH : DOT_SIZE,
                borderRadius: radii.pill,
                backgroundColor: dotIndex === index ? colors.primary : colors.borderStrong,
              }}
            />
          ))}
        </View>

        <AppButton
          label={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          rightIcon={isLast ? undefined : 'chevronRight'}
          size="lg"
          fullWidth
          onPress={isLast ? finish : () => goTo(index + 1)}
          testID="onboarding-primary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center' },
  footer: { alignItems: 'stretch' },
  dots: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center' },
});
