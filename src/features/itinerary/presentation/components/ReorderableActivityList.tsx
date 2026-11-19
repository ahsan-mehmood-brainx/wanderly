import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, type AccessibilityActionInfo, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon } from '@/shared/ui';

import { type Activity } from '../../domain/Activity';
import { ACTIVITY_ROW_HEIGHT, dropIndexFor } from '../reorder';
import { ActivityRow } from './ActivityRow';

export interface ReorderableActivityListProps {
  /** One day's activities in display order. */
  readonly activities: readonly Activity[];
  /** For each conflicting activity, the ids of the activities it overlaps (from `findTimeConflicts`). */
  readonly conflicts: ReadonlyMap<string, readonly string[]>;
  /** A row was dragged (or moved with an accessibility action) from one position to another. */
  readonly onReorder: (from: number, to: number) => void;
  readonly onToggleCompleted: (id: string) => void;
  readonly onOpen: (id: string) => void;
  /** Turns off dragging, move actions and completion checkboxes, e.g. while a change is saving. */
  readonly disabled?: boolean;
  /** A drag started (`true`) or ended; the screen stops scrolling meanwhile so the two gestures don't fight. */
  readonly onDragActiveChange?: (active: boolean) => void;
}

/** Long enough that a scroll that starts on a handle still scrolls. */
const LONG_PRESS_MS = 250;
const NOT_DRAGGING = -1;

/**
 * The day's activities as fixed-height rows. Long-pressing a row's drag handle
 * (`drag-<id>` gesture test id) and moving it reorders the list; every row also
 * offers "Move up" / "Move down" accessibility actions that do the same.
 *
 * The list doesn't scroll its container: a drag can only reach rows that are on
 * screen. Rows further away are reached in steps, or with the move actions.
 */
export function ReorderableActivityList({
  activities,
  conflicts,
  onReorder,
  onToggleCompleted,
  onOpen,
  disabled = false,
  onDragActiveChange,
}: ReorderableActivityListProps) {
  const dragging = useSharedValue(NOT_DRAGGING);
  const translation = useSharedValue(0);
  /** A row was dropped at a new position and stays there until the new order renders. */
  const settling = useSharedValue(false);
  const titles = new Map(activities.map(({ id, title }) => [id, title]));
  const orderKey = activities.map(({ id }) => id).join('\n');

  // The new order has rendered (or the save finished without it, e.g. it failed):
  // the rows' own positions take over from the drop offset.
  useLayoutEffect(() => {
    if (!settling.get()) return;
    settling.set(false);
    dragging.set(NOT_DRAGGING);
    translation.set(0);
  }, [orderKey, disabled, settling, dragging, translation]);

  return (
    // Its own root view, so the list works wherever it is placed; nested roots are supported.
    <GestureHandlerRootView style={{ height: ACTIVITY_ROW_HEIGHT * activities.length }}>
      {activities.map((activity, index) => (
        <DraggableRow
          key={activity.id}
          activity={activity}
          index={index}
          count={activities.length}
          overlapTitles={(conflicts.get(activity.id) ?? []).flatMap((id) => titles.get(id) ?? [])}
          dragging={dragging}
          translation={translation}
          settling={settling}
          disabled={disabled}
          onReorder={onReorder}
          onToggleCompleted={onToggleCompleted}
          onOpen={onOpen}
          onDragActiveChange={onDragActiveChange}
        />
      ))}
    </GestureHandlerRootView>
  );
}

interface DraggableRowProps {
  readonly activity: Activity;
  readonly index: number;
  readonly count: number;
  readonly overlapTitles: readonly string[];
  /** Index of the row being dragged, or {@link NOT_DRAGGING}. */
  readonly dragging: SharedValue<number>;
  /** How far the dragged row has moved. */
  readonly translation: SharedValue<number>;
  /** The dragged row was dropped at a new position; the list resets it once that order renders. */
  readonly settling: SharedValue<boolean>;
  readonly disabled: boolean;
  readonly onReorder: (from: number, to: number) => void;
  readonly onToggleCompleted: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onDragActiveChange?: (active: boolean) => void;
}

function DraggableRow({
  activity,
  index,
  count,
  overlapTitles,
  dragging,
  translation,
  settling,
  disabled,
  onReorder,
  onToggleCompleted,
  onOpen,
  onDragActiveChange,
}: DraggableRowProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  const notifyDragActive = (active: boolean) => onDragActiveChange?.(active);

  const pan = Gesture.Pan()
    .withTestId(`drag-${activity.id}`)
    .enabled(!disabled)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      settling.set(false);
      dragging.set(index);
      translation.set(0);
      runOnJS(notifyDragActive)(true);
    })
    .onUpdate((event) => {
      translation.set(event.translationY);
    })
    // A pan cancelled by the system or a competing gesture (`success` false) doesn't move anything.
    .onEnd((event, success) => {
      const to = dropIndexFor(event.translationY, ACTIVITY_ROW_HEIGHT, index, count);
      if (!success || disabled || to === index) return;
      // Settle on the target slot and stay there until the new order renders, so the row
      // doesn't jump back to where it started first.
      settling.set(true);
      translation.set(withTiming((to - index) * ACTIVITY_ROW_HEIGHT, { duration: 120 }));
      runOnJS(onReorder)(index, to);
    })
    .onFinalize(() => {
      if (dragging.get() !== index) return;
      if (!settling.get()) {
        dragging.set(NOT_DRAGGING);
        translation.set(0);
      }
      runOnJS(notifyDragActive)(false);
    });

  const animatedStyle = useAnimatedStyle(() => {
    const from = dragging.get();
    if (from === index) {
      return { zIndex: 1, transform: [{ translateY: translation.get() }, { scale: 1.02 }] };
    }
    // Not animated: after a drop the rows' new positions already match where they were shifted to.
    if (from === NOT_DRAGGING) return { zIndex: 0, transform: [{ translateY: 0 }, { scale: 1 }] };
    let shift = 0;
    const to = dropIndexFor(translation.get(), ACTIVITY_ROW_HEIGHT, from, count);
    if (from < index && index <= to) shift = -ACTIVITY_ROW_HEIGHT;
    else if (to <= index && index < from) shift = ACTIVITY_ROW_HEIGHT;
    return { zIndex: 0, transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }] };
  });

  const actions: AccessibilityActionInfo[] = disabled
    ? []
    : [
        ...(index > 0 ? [{ name: 'moveUp', label: t('itinerary.row.moveUp') }] : []),
        ...(index < count - 1 ? [{ name: 'moveDown', label: t('itinerary.row.moveDown') }] : []),
      ];

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (disabled) return;
    if (nativeEvent.actionName === 'moveUp' && index > 0) onReorder(index, index - 1);
    else if (nativeEvent.actionName === 'moveDown' && index < count - 1) onReorder(index, index + 1);
  };

  return (
    <Animated.View
      testID={`activity-row-${activity.id}`}
      accessibilityActions={actions}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.row, { top: index * ACTIVITY_ROW_HEIGHT, height: ACTIVITY_ROW_HEIGHT }, animatedStyle]}
    >
      <ActivityRow
        activity={activity}
        overlapTitles={overlapTitles}
        height={ACTIVITY_ROW_HEIGHT}
        onToggleCompleted={() => onToggleCompleted(activity.id)}
        completionDisabled={disabled}
        onOpen={() => onOpen(activity.id)}
        accessibilityActions={actions}
        onAccessibilityAction={onAccessibilityAction}
        trailing={
          <GestureDetector gesture={pan}>
            <View
              // Screen readers reorder with the row's actions instead.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              accessibilityHint={t('itinerary.row.dragHint')}
              style={[styles.handle, { paddingHorizontal: spacing.sm }, disabled ? styles.inactive : null]}
            >
              <AppIcon name="dragHandle" size="lg" color="textTertiary" />
            </View>
          </GestureDetector>
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0 },
  handle: { alignSelf: 'stretch', justifyContent: 'center' },
  inactive: { opacity: 0.4 },
});
