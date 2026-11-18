import { type TFunction } from 'i18next';

import { type DestinationSummary } from '../domain/Destination';

/** Full number in the UI language: 10 639 726 / 10,639,726. */
export function formatNumber(value: number, language: string): string {
  try {
    return new Intl.NumberFormat(language).format(value);
  } catch {
    return String(value);
  }
}

function oneDecimal(value: number, language: string): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  } catch {
    return value.toFixed(value < 10 ? 1 : 0);
  }
}

/**
 * Short population for cards: 10.6M, 850K. Implemented with translated suffixes
 * rather than `Intl` compact notation, which isn't available on every engine.
 */
export function formatCompactPopulation(value: number, t: TFunction, language: string): string {
  if (value >= 1e9) return t('discover.population.billions', { value: oneDecimal(value / 1e9, language) });
  if (value >= 1e6) return t('discover.population.millions', { value: oneDecimal(value / 1e6, language) });
  if (value >= 1e3) return t('discover.population.thousands', { value: oneDecimal(value / 1e3, language) });
  return formatNumber(value, language);
}

const KNOWN_REGIONS = ['Africa', 'Americas', 'Antarctic', 'Asia', 'Europe', 'Oceania'] as const;
type KnownRegion = (typeof KNOWN_REGIONS)[number];

/** Translated region name; regions the app doesn't know yet are shown as the API sends them. */
export function regionLabel(region: string, t: TFunction): string {
  return (KNOWN_REGIONS as readonly string[]).includes(region)
    ? t(`discover.regions.${region as KnownRegion}`)
    : region;
}

/** "Capital · Portugal", "City · Japan", "Europe" (for a country), or the Wikipedia description. */
export function destinationSubtitle(destination: DestinationSummary, t: TFunction): string {
  if (destination.kind === 'country')
    return destination.region ? regionLabel(destination.region, t) : t('discover.kind.country');
  const kind = destination.isCapital ? t('discover.capital') : t(`discover.kind.${destination.kind}`);
  if (destination.countryName) return `${kind} · ${destination.countryName}`;
  return destination.description ?? kind;
}

/** Calling codes come without a plus sign ("351"). */
export const formatCallingCode = (code: string): string => (code.startsWith('+') ? code : `+${code}`);
