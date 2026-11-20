import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, type AccessibilityActionInfo, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { type Activity } from '../../domain/Activity';
import { CATEGORY_ICONS, formatActivityTime, formatCost } from '../format';

/** Rows never grow past this, so the fixed-height drag list keeps its geometry with large text. */
const MAX_FONT_SCALE = 1.3;

interface ActivityRowProps {
  readonly activity: Activity;
  /** Titles of the activities this one overlaps; empty when there is no conflict. */
  readonly overlapTitles: readonly string[];
  readonly height: number;
  readonly onToggleCompleted: () => void;
  /** Turns off the completion checkbox, e.g. while another change is saving and would refuse it. */
  readonly completionDisabled?: boolean;
  readonly onOpen: () => void;
  /** Rendered at the trailing edge, e.g. the drag handle. */
  readonly trailing?: ReactNode;
  /** Offered on the row's main button too, where screen readers focus. */
  readonly accessibilityActions?: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

/** One activity on the daily timeline: completion, time and duration, cost and any overlap. */
export function ActivityRow({
  activity,
  overlapTitles,
  height,
  onToggleCompleted,
  completionDisabled = false,
  onOpen,
  trailing,
  accessibilityActions,
  onAccessibilityAction,
}: ActivityRowProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const language = i18n.language;
  const done = activity.isCompleted;
  const time = formatActivityTime(activity, language, t);
  const cost = activity.estimatedCost === null ? null : formatCost(activity.estimatedCost, activity.currency, language);
  const overlap = overlapTitles.length > 0 ? t('itinerary.overlapsWith', { titles: overlapTitles.join(', ') }) : null;

  return (
    <View
      style={[
        styles.row,
        {
          height: height - spacing.sm,
          gap: spacing.sm,
          paddingHorizontal: spacing.sm,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
          borderColor: overlap ? colors.warning : colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('itinerary.row.markDone', { title: activity.title })}
        accessibilityState={{ checked: done, disabled: completionDisabled }}
        disabled={completionDisabled}
        onPress={onToggleCompleted}
        hitSlop={spacing.xs}
        style={[
          styles.check,
          { width: sizes.touchTarget, height: sizes.touchTarget },
          completionDisabled ? styles.inactive : null,
        ]}
      >
        <AppIcon name={done ? 'checkCircle' : 'circle'} size="lg" color={done ? 'success' : 'textTertiary'} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[activity.title, time, cost, overlap].filter(Boolean).join(', ')}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onOpen}
        style={[styles.body, { gap: spacing.xxs }]}
      >
        <View style={[styles.line, { gap: spacing.xs }]}>
          <AppIcon name={CATEGORY_ICONS[activity.category]} size="sm" color="primary" />
          <AppText
            variant="headline"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            color={done ? 'textSecondary' : 'text'}
            style={[styles.flex, done ? styles.done : null]}
          >
            {activity.title}
          </AppText>
        </View>
        <View style={[styles.line, { gap: spacing.sm }]}>
          <AppText
            variant="callout"
            color="textSecondary"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={styles.flex}
          >
            {time}
          </AppText>
          {cost ? (
            <AppText variant="callout" color="textSecondary" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {cost}
            </AppText>
          ) : null}
        </View>
        {overlap ? (
          <View style={[styles.line, { gap: spacing.xs }]}>
            <AppIcon name="warning" size="xs" color="warning" />
            <AppText
              variant="caption"
              color="warning"
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={styles.flex}
            >
              {overlap}
            </AppText>
          </View>
        ) : activity.address ? (
          <AppText variant="caption" color="textTertiary" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {activity.address}
          </AppText>
        ) : null}
      </Pressable>

      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  check: { alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.4 },
  body: { flex: 1, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center' },
  flex: { flexShrink: 1, flexGrow: 1 },
  done: { textDecorationLine: 'line-through' },
});
