import { router, Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { openExternalUrl } from '@/shared/navigation/openExternalUrl';
import { routes } from '@/shared/navigation/routes';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppChip,
  AppErrorView,
  AppIcon,
  AppLoader,
  AppText,
  InlineMessage,
  Screen,
  type AppIconName,
} from '@/shared/ui';

import {
  type CountryDestinationDetails,
  type DescriptionState,
  type PlaceDestinationDetails,
  type TravelEssentials,
} from '../../domain/Destination';
import { countryDestinationId } from '../../domain/DestinationId';
import { CATEGORY_ICONS } from '../categoryIcons';
import { DestinationImage } from '../components/DestinationImage';
import { formatCallingCode, formatNumber, regionLabel } from '../format';
import { useDestinationDetails } from '../hooks/useDestinationDetails';

interface DestinationScreenProps {
  /** Already validated by the route (shape); parsed strictly by the use case. */
  readonly destinationId: string;
}

/** Country or place details: flag/photo, key facts, Wikipedia description, and travel essentials. */
export function DestinationScreen({ destinationId }: DestinationScreenProps) {
  const { t } = useTranslation();
  const { details, loading, errorKind, retry, refreshing } = useDestinationDetails(destinationId);

  if (loading) return <AppLoader label={t('destination.loading')} fullScreen testID="destination-loading" />;
  if (errorKind || !details) {
    return (
      <AppErrorView
        fullScreen
        errorKind={errorKind ?? 'unknown'}
        // An unknown id can't succeed on retry.
        onRetry={errorKind === 'notFound' ? undefined : retry}
        testID="destination-error"
      />
    );
  }

  const title = details.kind === 'country' ? details.country.name : details.name;
  return (
    <>
      <Stack.Screen options={{ title }} />
      {details.kind === 'country' ? (
        <CountryDetails details={details} onRetry={retry} refreshing={refreshing} />
      ) : (
        <PlaceDetails details={details} onRetry={retry} refreshing={refreshing} />
      )}
    </>
  );
}

/** Reloads the destination, e.g. after its description failed (that failure is otherwise cached with it). */
interface RetryProps {
  readonly onRetry: () => void;
  readonly refreshing: boolean;
}

function CountryDetails({
  details,
  onRetry,
  refreshing,
}: { readonly details: CountryDestinationDetails } & RetryProps) {
  const { t, i18n } = useTranslation();
  const { spacing, radii } = useAppTheme();
  const { country } = details;
  const notAvailable = t('destination.notAvailable');

  return (
    <Screen>
      <DestinationImage
        uri={country.flag.pngUrl}
        kind="country"
        flagEmoji={country.flag.emoji}
        contentFit="contain"
        accessibilityLabel={country.flag.description ?? t('destination.flagOf', { country: country.name })}
        style={[styles.flag, { borderRadius: radii.md }]}
      />
      <View style={{ gap: spacing.sm }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {country.name}
        </AppText>
        {country.officialName && country.officialName !== country.name ? (
          <AppText color="textSecondary">{t('destination.officialName', { name: country.officialName })}</AppText>
        ) : null}
        <View style={[styles.wrap, { gap: spacing.sm }]}>
          {country.region ? <AppBadge label={regionLabel(country.region, t)} tone="primary" icon="globe" /> : null}
          {country.subregion ? <AppBadge label={country.subregion} /> : null}
        </View>
      </View>

      <InfoCard title={t('destination.facts')}>
        <Fact icon="location" label={t('destination.capital')} value={country.capitals.join(', ') || notAvailable} />
        <Fact
          icon="globe"
          label={t('destination.region')}
          value={
            [country.region ? regionLabel(country.region, t) : null, country.subregion].filter(Boolean).join(' · ') ||
            notAvailable
          }
        />
        <Fact
          icon="people"
          label={t('destination.population')}
          value={country.population !== null ? formatNumber(country.population, i18n.language) : notAvailable}
        />
        <Fact
          icon="area"
          label={t('destination.area')}
          value={
            country.areaKm2 !== null
              ? t('destination.areaValue', { value: formatNumber(country.areaKm2, i18n.language) })
              : notAvailable
          }
        />
        <Fact icon="language" label={t('destination.languages')} value={country.languages.join(', ') || notAvailable} />
        <Fact
          icon="currency"
          label={t('destination.currencies')}
          value={formatCurrencies(details.essentials) || notAvailable}
        />
      </InfoCard>

      <About description={details.description} onRetry={onRetry} refreshing={refreshing} />

      {/* Languages and currencies are already under "At a glance". */}
      <Essentials
        essentials={details.essentials}
        title={t('destination.essentials')}
        includeLanguageAndCurrency={false}
      />

      {details.neighbours.length > 0 ? (
        <InfoCard title={t('destination.neighbours')}>
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            {details.neighbours.map((neighbour) => (
              <AppChip
                key={neighbour.id}
                label={neighbour.flagEmoji ? `${neighbour.flagEmoji} ${neighbour.name}` : neighbour.name}
                accessibilityLabel={neighbour.name}
                onPress={() => router.push(routes.destination(neighbour.id))}
              />
            ))}
          </View>
        </InfoCard>
      ) : null}

      <AppText variant="caption" color="textTertiary">
        {t('destination.countryDataSource')}
      </AppText>
    </Screen>
  );
}

function PlaceDetails({ details, onRetry, refreshing }: { readonly details: PlaceDestinationDetails } & RetryProps) {
  const { t } = useTranslation();
  const { spacing, radii } = useAppTheme();
  const summary = details.description.status === 'available' ? details.description.summary : null;
  const { country } = details;

  return (
    <Screen>
      <DestinationImage
        uri={summary?.imageUrl ?? null}
        kind={details.kind}
        categories={details.categories}
        accessibilityLabel={summary?.imageUrl ? t('destination.photoOf', { name: details.name }) : undefined}
        style={[styles.photo, { borderRadius: radii.lg }]}
      />
      <View style={{ gap: spacing.sm }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {details.name}
        </AppText>
        {summary?.description ? <AppText color="textSecondary">{summary.description}</AppText> : null}
        {details.categories.length > 0 ? (
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            {details.categories.map((category) => (
              <AppBadge
                key={category}
                label={t(`discover.categories.${category}`)}
                tone="primary"
                icon={CATEGORY_ICONS[category]}
              />
            ))}
          </View>
        ) : null}
      </View>

      <InfoCard title={t('destination.locatedIn')}>
        {country ? (
          <View style={{ gap: spacing.md }}>
            <View style={[styles.row, { gap: spacing.md }]}>
              <DestinationImage
                uri={country.flag.pngUrl}
                kind="country"
                flagEmoji={country.flag.emoji}
                contentFit="contain"
                style={[styles.smallFlag, { borderRadius: radii.xs }]}
              />
              <View style={styles.fill}>
                <AppText variant="headline">{country.name}</AppText>
                {country.region ? (
                  <AppText variant="caption" color="textSecondary">
                    {regionLabel(country.region, t)}
                  </AppText>
                ) : null}
              </View>
            </View>
            <AppButton
              label={t('destination.viewCountry', { country: country.name })}
              variant="outline"
              size="sm"
              rightIcon="chevronRight"
              onPress={() => router.push(routes.destination(countryDestinationId(country.code)))}
            />
          </View>
        ) : (
          <AppText color="textSecondary">{t('destination.unknownCountry')}</AppText>
        )}
      </InfoCard>

      <About description={details.description} onRetry={onRetry} refreshing={refreshing} />

      {details.essentials && country ? (
        <Essentials essentials={details.essentials} title={t('destination.essentialsFor', { country: country.name })} />
      ) : null}

      <InlineMessage tone="info" icon="info" message={t('destination.limitedData')} />
    </Screen>
  );
}

function About({ description, onRetry, refreshing }: { readonly description: DescriptionState } & RetryProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { logger } = useDependencies();
  const [linkFailed, setLinkFailed] = useState(false);

  const openArticle = async (url: string) => {
    setLinkFailed(false);
    const opened = await openExternalUrl(url, logger.child({ scope: 'destination' }));
    if (!opened) setLinkFailed(true);
  };

  if (description.status === 'available' && description.summary.extract) {
    const { extract, articleUrl } = description.summary;
    return (
      <InfoCard title={t('destination.about')}>
        <View style={{ gap: spacing.md }}>
          <AppText>{extract}</AppText>
          {articleUrl ? (
            <AppButton
              label={t('destination.readMore')}
              variant="ghost"
              size="sm"
              rightIcon="externalLink"
              accessibilityRole="link"
              onPress={() => void openArticle(articleUrl)}
            />
          ) : null}
          {linkFailed ? <InlineMessage tone="danger" icon="error" message={t('destination.openLinkFailed')} /> : null}
          <AppText variant="caption" color="textTertiary">
            {t('destination.attribution')}
          </AppText>
        </View>
      </InfoCard>
    );
  }

  return (
    <InfoCard title={t('destination.about')}>
      <AppText color="textSecondary" testID="description-missing">
        {description.status === 'failed' ? t('destination.descriptionFailed') : t('destination.noDescription')}
      </AppText>
      {description.status === 'failed' ? (
        <AppButton
          label={t('common.tryAgain')}
          variant="outline"
          size="sm"
          leftIcon="refresh"
          loading={refreshing}
          onPress={onRetry}
          testID="description-retry"
        />
      ) : null}
    </InfoCard>
  );
}

interface EssentialsProps {
  readonly essentials: TravelEssentials;
  readonly title: string;
  readonly includeLanguageAndCurrency?: boolean;
}

function Essentials({ essentials, title, includeLanguageAndCurrency = true }: EssentialsProps) {
  const { t } = useTranslation();
  const notAvailable = t('destination.notAvailable');
  return (
    <InfoCard title={title}>
      {includeLanguageAndCurrency ? (
        <>
          <Fact
            icon="currency"
            label={t('destination.currencies')}
            value={formatCurrencies(essentials) || notAvailable}
          />
          <Fact
            icon="language"
            label={t('destination.languages')}
            value={essentials.languages.join(', ') || notAvailable}
          />
        </>
      ) : null}
      <Fact icon="clock" label={t('destination.timezones')} value={essentials.timezones.join(', ') || notAvailable} />
      <Fact
        icon="phone"
        label={t('destination.callingCode')}
        value={essentials.callingCodes.map(formatCallingCode).join(', ') || notAvailable}
      />
      <Fact
        icon="car"
        label={t('destination.drivingSide')}
        value={essentials.drivingSide ? t(`destination.drivingSides.${essentials.drivingSide}`) : notAvailable}
      />
    </InfoCard>
  );
}

function formatCurrencies({ currencies }: TravelEssentials): string {
  return currencies
    .map((currency) => `${currency.name} (${currency.code}${currency.symbol ? `, ${currency.symbol}` : ''})`)
    .join(', ');
}

function InfoCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <AppCard variant="outlined" padding="lg">
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </AppCard>
  );
}

function Fact({ icon, label, value }: { readonly icon: AppIconName; readonly label: string; readonly value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View
      style={[styles.row, { gap: spacing.md, paddingVertical: spacing.xs }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <AppIcon name={icon} size="md" color="primary" />
      <View style={styles.fill}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flag: { width: '100%', aspectRatio: 2, alignSelf: 'center', maxWidth: 360 },
  photo: { width: '100%', aspectRatio: 16 / 10 },
  smallFlag: { width: 48, height: 32 },
});
