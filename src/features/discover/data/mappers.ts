import { type Country, type Currency } from '../domain/Country';
import { type PlaceSearchHit, type PlaceSummary } from '../domain/Destination';
import { type CountryDto } from './dto/restCountriesDtos';
import { type PageSummaryDto, type TitleSearchDto } from './dto/wikipediaDtos';

const unique = (values: readonly (string | null | undefined)[]): string[] => [
  ...new Set(values.flatMap((value) => (value?.trim() ? [value.trim()] : []))),
];

/** Only https URLs reach the UI: protocol-relative URLs are upgraded, anything else is dropped. */
export function toHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  return /^https:\/\/[^\s]+$/i.test(absolute) ? absolute : null;
}

/** "https://en.wikipedia.org/wiki/Georgia_(country)" → "Georgia (country)". English Wikipedia only. */
export function wikipediaTitleFromUrl(url: string | null | undefined): string | null {
  const match = url ? /^https?:\/\/en\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)$/i.exec(url) : null;
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

export function toCountry(dto: CountryDto): Country {
  const capitals = dto.capitals ?? [];
  // Primary capital first (South Africa lists three).
  const ordered = [...capitals].sort(
    (a, b) => Number(b.attributes?.primary ?? false) - Number(a.attributes?.primary ?? false),
  );
  const currencies: Currency[] = [];
  for (const currency of dto.currencies ?? []) {
    const code = currency.code.toUpperCase();
    if (currencies.some((existing) => existing.code === code)) continue;
    currencies.push({ code, name: currency.name ?? code, symbol: currency.symbol ?? null });
  }

  return {
    code: dto.codes.alpha_2.toUpperCase(),
    code3: dto.codes.alpha_3?.toUpperCase() ?? null,
    name: dto.names.common.trim(),
    officialName: dto.names.official ?? null,
    alternateNames: unique(dto.names.alternates ?? []),
    capitals: unique(ordered.map((capital) => capital.name)),
    region: dto.region ?? null,
    subregion: dto.subregion ?? null,
    population: dto.population ?? null,
    areaKm2: dto.area?.kilometers ?? null,
    languages: unique((dto.languages ?? []).map((language) => language.name)),
    currencies,
    flag: {
      pngUrl: toHttpsUrl(dto.flag?.url_png),
      svgUrl: toHttpsUrl(dto.flag?.url_svg),
      emoji: dto.flag?.emoji ?? null,
      description: dto.flag?.description ?? null,
    },
    coordinates: dto.coordinates ? { latitude: dto.coordinates.lat, longitude: dto.coordinates.lng } : null,
    timezones: unique(dto.timezones ?? []),
    borders: unique((dto.borders ?? []).map((code) => code.toUpperCase())),
    callingCodes: unique(dto.calling_codes ?? []),
    drivingSide: dto.cars?.driving_side ?? null,
    landlocked: dto.landlocked ?? null,
    wikipediaTitle: wikipediaTitleFromUrl(dto.links?.wikipedia),
  };
}

/** `null` for a disambiguation page or any non-article: it doesn't describe one place. */
export function toPlaceSummary(dto: PageSummaryDto): PlaceSummary | null {
  if (dto.type !== 'standard') return null;
  const thumbnailUrl = toHttpsUrl(dto.thumbnail?.source);
  // Originals can be tens of megapixels; only use one of a sensible size for headers.
  const original = dto.originalimage;
  const originalUrl = original && (original.width ?? Infinity) <= 2000 ? toHttpsUrl(original.source) : null;
  return {
    title: dto.title,
    description: dto.description ?? null,
    extract: dto.extract ?? null,
    thumbnailUrl,
    imageUrl: originalUrl ?? thumbnailUrl,
    articleUrl: toHttpsUrl(dto.content_urls?.mobile?.page),
    coordinates: dto.coordinates ? { latitude: dto.coordinates.lat, longitude: dto.coordinates.lon } : null,
  };
}

export function toPlaceSearchHits(dto: TitleSearchDto): PlaceSearchHit[] {
  return dto.pages.map((page) => ({
    title: page.title,
    description: page.description ?? null,
    thumbnailUrl: toHttpsUrl(page.thumbnail?.url),
  }));
}
