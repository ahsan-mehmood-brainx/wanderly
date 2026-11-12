import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type TypographyVariant } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';
import {
  AppAvatar,
  AppBadge,
  AppBottomSheet,
  AppButton,
  AppCard,
  AppDivider,
  AppEmptyView,
  AppErrorView,
  AppHeader,
  AppIcon,
  AppInput,
  AppLoader,
  AppText,
  icons,
  Screen,
  type AppIconName,
} from '@/shared/ui';

/*
 * Development-only catalogue of design tokens and shared components, reachable
 * from Settings in dev builds. Copy is intentionally not translated.
 */

const DESTINATION_PHOTO = 'https://picsum.photos/id/1036/1200/800';
const SECOND_PHOTO = 'https://picsum.photos/id/1015/1200/800';
const AVATAR_PHOTO = 'https://i.pravatar.cc/150?img=47';

const SWATCHES: readonly (keyof ThemeColors)[] = [
  'primary',
  'secondary',
  'background',
  'surface',
  'surfaceMuted',
  'text',
  'textSecondary',
  'border',
  'success',
  'warning',
  'info',
  'danger',
];

const TYPE_SCALE: readonly TypographyVariant[] = [
  'display',
  'largeTitle',
  'title',
  'subtitle',
  'headline',
  'body',
  'callout',
  'label',
  'caption',
  'sectionTitle',
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Row({ children }: { readonly children: ReactNode }) {
  const { spacing } = useAppTheme();
  return <View style={[styles.row, { gap: spacing.sm }]}>{children}</View>;
}

export function DesignSystemScreen() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const [query, setQuery] = useState('');
  const [password, setPassword] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Simulated save: the effect's cleanup clears the timer if the screen unmounts first.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Screen>
      <Section title="Colours">
        <View style={[styles.row, { gap: spacing.md }]}>
          {SWATCHES.map((name) => (
            <View key={name} style={[styles.swatch, { gap: spacing.xs }]}>
              <View
                style={{
                  height: 48,
                  borderRadius: radii.md,
                  backgroundColor: colors[name],
                  borderWidth: sizes.hairline,
                  borderColor: colors.border,
                }}
              />
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {name}
              </AppText>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Typography · Inter">
        {TYPE_SCALE.map((variant) => (
          <AppText key={variant} variant={variant}>
            {variant} · Lisbon
          </AppText>
        ))}
      </Section>

      <Section title="Buttons">
        <AppButton label="Plan a trip" leftIcon="flight" fullWidth onPress={() => undefined} />
        <Row>
          <AppButton label="Secondary" variant="secondary" onPress={() => undefined} />
          <AppButton label="Outline" variant="outline" onPress={() => undefined} />
          <AppButton label="Ghost" variant="ghost" rightIcon="chevronRight" onPress={() => undefined} />
        </Row>
        <Row>
          <AppButton label="Small" size="sm" onPress={() => undefined} />
          <AppButton label="Large" size="lg" onPress={() => undefined} />
          <AppButton label="Delete" variant="danger" size="sm" onPress={() => undefined} />
        </Row>
        <Row>
          <AppButton label="Save" loading={loading} onPress={() => setLoading(true)} />
          <AppButton label="Disabled" disabled onPress={() => undefined} />
        </Row>
      </Section>

      <Section title="Inputs">
        <AppInput
          label="Destination"
          placeholder="Search cities, countries…"
          leftIcon="search"
          clearable
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        <AppInput
          label="Password"
          placeholder="At least 8 characters"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          hint="Use a mix of letters and numbers."
        />
        <AppInput label="Email" defaultValue="traveller@" error="Enter a valid email address." />
        <AppInput label="Disabled" defaultValue="Read only" disabled />
      </Section>

      <Section title="Cards">
        <AppCard
          image={DESTINATION_PHOTO}
          imageAlt="Snow-covered mountains above a valley"
          onPress={() => undefined}
          accessibilityLabel="Swiss Alps, Switzerland"
        >
          <Row>
            <AppBadge label="Popular" tone="primary" icon="star" />
            <AppBadge label="5 nights" />
          </Row>
          <AppText variant="subtitle">Swiss Alps</AppText>
          <View style={[styles.row, { gap: spacing.xs, alignItems: 'center' }]}>
            <AppIcon name="location" size="sm" color="textSecondary" />
            <AppText variant="callout" color="textSecondary">
              Switzerland
            </AppText>
          </View>
        </AppCard>
        <AppCard image={SECOND_PHOTO} imageAspectRatio={2} variant="outlined">
          <AppText variant="headline">Outlined card</AppText>
          <AppText variant="callout" color="textSecondary">
            Subtle border, no shadow.
          </AppText>
        </AppCard>
        <AppCard variant="filled">
          <AppText variant="headline">Filled card</AppText>
          <AppText variant="callout" color="textSecondary">
            Muted surface for grouped content.
          </AppText>
        </AppCard>
      </Section>

      <Section title="Badges">
        <Row>
          {(['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const).map((tone) => (
            <AppBadge key={tone} label={tone} tone={tone} />
          ))}
        </Row>
        <Row>
          {(['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const).map((tone) => (
            <AppBadge key={tone} label={tone} tone={tone} variant="solid" size="sm" />
          ))}
        </Row>
      </Section>

      <Section title="Avatars">
        <Row>
          <AppAvatar name="Amelia Earhart" imageUri={AVATAR_PHOTO} size="xl" />
          <AppAvatar name="Ibn Battuta" size="lg" />
          <AppAvatar name="Marco Polo" size="md" />
          <AppAvatar imageUri="https://invalid.example/avatar.png" name="Zheng He" size="sm" />
          <AppAvatar size="xs" />
        </Row>
      </Section>

      <Section title="Icons">
        <View style={[styles.row, { gap: spacing.lg }]}>
          {(Object.keys(icons) as AppIconName[]).map((name) => (
            <AppIcon key={name} name={name} color="primary" accessibilityLabel={name} />
          ))}
        </View>
      </Section>

      <Section title="Divider">
        <AppText>Above</AppText>
        <AppDivider />
        <AppText>Below</AppText>
      </Section>

      <Section title="Header">
        <AppCard variant="outlined" padding="none">
          <AppHeader
            title="Trip details"
            subtitle="Lisbon · 12–18 May"
            onBack={() => undefined}
            rightActions={[
              { icon: 'share', accessibilityLabel: 'Share', onPress: () => undefined },
              { icon: 'more', accessibilityLabel: 'More', onPress: () => undefined },
            ]}
            transparent
          />
        </AppCard>
      </Section>

      <Section title="Loader">
        <AppLoader label="Finding destinations…" />
      </Section>

      <Section title="Empty & error states">
        <AppCard variant="outlined">
          <AppEmptyView
            icon="luggage"
            title="No trips yet"
            message="Plan your first adventure and it will show up here."
            actionLabel="Plan a trip"
            onAction={() => undefined}
          />
        </AppCard>
        <AppCard variant="outlined">
          <AppErrorView
            icon="offline"
            title="You're offline"
            message="Check your connection and try again."
            onRetry={() => undefined}
          />
        </AppCard>
      </Section>

      <Section title="Bottom sheet">
        <AppButton label="Open bottom sheet" variant="outline" onPress={() => setSheetOpen(true)} />
      </Section>

      <AppBottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter destinations">
        <View style={{ gap: spacing.md }}>
          <AppText color="textSecondary">Drag down, tap outside, or use the button to close.</AppText>
          <Row>
            <AppBadge label="Beaches" tone="primary" />
            <AppBadge label="Mountains" />
            <AppBadge label="Cities" />
          </Row>
          <AppButton label="Apply filters" fullWidth onPress={() => setSheetOpen(false)} />
        </View>
      </AppBottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  swatch: { width: '30%', flexGrow: 1 },
});
