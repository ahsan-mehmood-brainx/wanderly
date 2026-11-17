import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppChip, AppIcon, AppIconButton, AppText, Screen } from '@/shared/ui';

import { DESTINATION_CATEGORIES } from '../../domain/Destination';
import { type Recommendation } from '../../domain/usecases/discoverFeed';
import { CATEGORY_ICONS } from '../categoryIcons';
import { CountryTile, DestinationRow, FeaturedDestinationCard } from '../components/DestinationCards';
import { HorizontalList, Section, SectionState } from '../components/Section';
import { regionLabel } from '../format';
import { useDayPeriod } from '../hooks/useDayPeriod';
import { useDiscoverHome } from '../hooks/useDiscoverHome';

interface DiscoverScreenProps {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
}

// Module-level so the default keeps a stable identity across renders.
const systemNow = () => new Date();

const openDestination = (id: string) => router.push(routes.destination(id));

/** Explore tab: greeting, search, categories and the discovery feed. */
export function DiscoverScreen({ now = systemNow }: DiscoverScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const period = useDayPeriod(now);
  const home = useDiscoverHome();

  const reasonLabel = ({ reason }: Recommendation): string => {
    switch (reason.type) {
      case 'similar':
        return t('discover.recommendation.similar', { name: reason.basedOn });
      case 'sameRegion':
        return t('discover.recommendation.sameRegion', { region: regionLabel(reason.region, t) });
      case 'popular':
        return t('discover.recommendation.popular');
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="headline" color="primary">
          {home.name ? t(`discover.greetingWithName.${period}`, { name: home.name }) : t(`discover.greeting.${period}`)}
        </AppText>
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('discover.headline')}
        </AppText>
        <AppText color="textSecondary">{t('discover.subtitle')}</AppText>
      </View>

      <View style={[styles.searchRow, { gap: spacing.sm }]}>
        <SearchLauncher onPress={() => router.push(routes.search())} />
        {/* react-native-maps has no web support, so the map is offered on iOS and Android only. */}
        {Platform.OS !== 'web' ? (
          <AppIconButton
            icon="map"
            variant="tonal"
            accessibilityLabel={t('discover.openMap')}
            onPress={() => router.push(routes.map)}
          />
        ) : null}
      </View>

      <Section title={t('discover.sections.categories')}>
        <View style={[styles.wrap, { gap: spacing.sm }]}>
          {DESTINATION_CATEGORIES.map((category) => (
            <AppChip
              key={category}
              label={t(`discover.categories.${category}`)}
              icon={CATEGORY_ICONS[category]}
              accessibilityHint={t('discover.categoryHint', { category: t(`discover.categories.${category}`) })}
              onPress={() => router.push(routes.search({ category }))}
            />
          ))}
        </View>
      </Section>

      <Section title={t('discover.sections.featured')} caption={t('discover.curatedNote')} testID="section-featured">
        <SectionState
          loading={home.featured.loading}
          errorKind={home.featured.errorKind}
          onRetry={home.featured.retry}
        />
        {home.featured.data ? (
          <HorizontalList>
            {home.featured.data.map((destination) => (
              <FeaturedDestinationCard
                key={destination.id}
                destination={destination}
                onPress={() => openDestination(destination.id)}
              />
            ))}
          </HorizontalList>
        ) : null}
      </Section>

      {home.recent.length > 0 ? (
        <Section
          title={t('discover.sections.recent')}
          action={{
            label: t('discover.clearRecent'),
            accessibilityLabel: t('discover.clearRecentLabel'),
            onPress: home.clearRecent,
          }}
          testID="section-recent"
        >
          <View>
            {home.recent.slice(0, 5).map((destination) => (
              <DestinationRow
                key={destination.id}
                destination={destination}
                onPress={() => openDestination(destination.id)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={t('discover.sections.popular')} testID="section-popular">
        <SectionState loading={home.popular.loading} errorKind={home.popular.errorKind} onRetry={home.popular.retry} />
        {home.popular.data ? (
          <HorizontalList>
            {home.popular.data.map((destination) => (
              <CountryTile
                key={destination.id}
                destination={destination}
                onPress={() => openDestination(destination.id)}
              />
            ))}
          </HorizontalList>
        ) : null}
      </Section>

      <Section title={t('discover.sections.trending')} caption={t('discover.curatedNote')} testID="section-trending">
        <SectionState
          loading={home.trending.loading}
          errorKind={home.trending.errorKind}
          onRetry={home.trending.retry}
        />
        {home.trending.data ? (
          <View>
            {home.trending.data.map((destination) => (
              <DestinationRow
                key={destination.id}
                destination={destination}
                onPress={() => openDestination(destination.id)}
              />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title={t('discover.sections.recommended')} testID="section-recommended">
        <SectionState
          loading={home.recommended.loading}
          errorKind={home.recommended.errorKind}
          onRetry={home.recommended.retry}
        />
        {home.recommended.data && !home.recommended.loading ? (
          <View>
            {home.recommended.data.map((recommendation) => (
              <DestinationRow
                key={recommendation.destination.id}
                destination={recommendation.destination}
                subtitle={reasonLabel(recommendation)}
                onPress={() => openDestination(recommendation.destination.id)}
              />
            ))}
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}

/** Looks like a search field, opens the search screen (where the keyboard and results live). */
function SearchLauncher({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={t('discover.searchPlaceholder')}
      accessibilityHint={t('discover.searchHint')}
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed } : undefined}
      style={({ pressed }) => [
        styles.launcher,
        {
          flex: 1,
          minHeight: sizes.input,
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.pill,
          borderWidth: sizes.border,
          borderColor: colors.border,
          backgroundColor: pressed && Platform.OS !== 'android' ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <AppIcon name="search" size="md" color="textSecondary" />
      <AppText color="textTertiary" numberOfLines={1} style={styles.launcherText}>
        {t('discover.searchPlaceholder')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  launcher: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  launcherText: { flex: 1 },
});
