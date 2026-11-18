import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, AppText } from '@/shared/ui';

interface SectionProps {
  readonly title: string;
  /** Small print under the title, e.g. "Picked by the Wanderly team". */
  readonly caption?: string;
  readonly action?: { readonly label: string; readonly accessibilityLabel?: string; readonly onPress: () => void };
  readonly children: ReactNode;
  readonly testID?: string;
}

/** A titled block on the discover screen. */
export function Section({ title, caption, action, children, testID }: SectionProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <AppText variant="subtitle" accessibilityRole="header">
            {title}
          </AppText>
          {caption ? (
            <AppText variant="caption" color="textSecondary">
              {caption}
            </AppText>
          ) : null}
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            onPress={action.onPress}
            hitSlop={spacing.md}
          >
            <AppText variant="label" color="primary">
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Horizontally scrolling row that bleeds to the screen edges. */
export function HorizontalList({ children }: { readonly children: ReactNode }) {
  const { spacing } = useAppTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.lg }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
    >
      {children}
    </ScrollView>
  );
}

interface SectionStateProps {
  readonly loading: boolean;
  readonly errorKind: AppErrorKind | null;
  readonly onRetry: () => void;
}

/**
 * Inline loading or error state for one section, so one failing source doesn't
 * blank the whole screen. Renders nothing once the section has content.
 */
export function SectionState({ loading, errorKind, onRetry }: SectionStateProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();

  if (loading) {
    return (
      <View
        style={[styles.state, { padding: spacing.lg }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
        accessibilityState={{ busy: true }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!errorKind) return null;
  return (
    <View
      style={[
        styles.state,
        { padding: spacing.lg, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
      ]}
    >
      <AppText variant="callout" color="textSecondary" align="center">
        {`${t('discover.sectionError')} ${t(getErrorMessageKey(errorKind))}`}
      </AppText>
      <AppButton
        label={t('common.tryAgain')}
        variant="ghost"
        size="sm"
        leftIcon="refresh"
        onPress={onRetry}
        style={styles.centered}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titles: { flex: 1, gap: 2 },
  state: { alignItems: 'center', justifyContent: 'center' },
  centered: { alignSelf: 'center' },
});
