/**
 * Destination ids appear in URLs and deep links, so they use only `[A-Za-z0-9_-]`
 * and are parsed strictly. Three forms:
 *
 * - `country-pt`: a country by ISO alpha-2 code.
 * - `kyoto`: a curated destination's slug (see `editorial.ts`).
 * - `place-<base64url>`: any other Wikipedia place. The payload is
 *   `<alpha-2 or empty>~<article title>`, so the host country survives the round trip.
 */
export type DestinationRef =
  | { readonly kind: 'country'; readonly code: string }
  | { readonly kind: 'curated'; readonly slug: string }
  | { readonly kind: 'place'; readonly title: string; readonly countryCode: string | null };

const COUNTRY_PREFIX = 'country-';
const PLACE_PREFIX = 'place-';
const COUNTRY_CODE = /^[A-Za-z]{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Wikipedia titles are at most 255 bytes. */
const MAX_TITLE_BYTES = 255;
export const MAX_DESTINATION_ID_LENGTH = PLACE_PREFIX.length + Math.ceil(((MAX_TITLE_BYTES + 3) * 4) / 3);

export const countryDestinationId = (code: string): string => `${COUNTRY_PREFIX}${code.toLowerCase()}`;

export function placeDestinationId(title: string, countryCode: string | null): string {
  return `${PLACE_PREFIX}${encodeBase64Url(utf8Encode(`${countryCode?.toUpperCase() ?? ''}~${title}`))}`;
}

export function parseDestinationId(id: string): DestinationRef | null {
  if (id.startsWith(COUNTRY_PREFIX)) {
    const code = id.slice(COUNTRY_PREFIX.length);
    return COUNTRY_CODE.test(code) ? { kind: 'country', code: code.toUpperCase() } : null;
  }
  if (id.startsWith(PLACE_PREFIX)) return parsePlace(id.slice(PLACE_PREFIX.length));
  return SLUG.test(id) && id.length <= 64 ? { kind: 'curated', slug: id } : null;
}

function parsePlace(encoded: string): DestinationRef | null {
  if (!BASE64URL.test(encoded) || encoded.length > MAX_DESTINATION_ID_LENGTH) return null;
  const bytes = decodeBase64Url(encoded);
  if (!bytes || bytes.length > MAX_TITLE_BYTES + 3) return null;
  const payload = utf8Decode(bytes);
  if (payload === null) return null;

  const separator = payload.indexOf('~');
  if (separator !== 0 && separator !== 2) return null;
  const countryCode = payload.slice(0, separator);
  const title = payload.slice(separator + 1).trim();
  if (countryCode && !COUNTRY_CODE.test(countryCode)) return null;
  // Control characters never appear in article titles; their presence means a crafted id.
  if (!title || /[\u0000-\u001f\u007f]/.test(title)) return null;
  return { kind: 'place', title, countryCode: countryCode ? countryCode.toUpperCase() : null };
}

// ─── UTF-8 and base64url, implemented here so ids behave the same on Hermes, web and Node ───

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
}

/** Bytes in a sequence from its lead byte; 0 for bytes that can't start one (continuations, 0xC0–0xC1, 0xF5–0xFF). */
function utf8SequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

/** Strict decoder: returns `null` for malformed or overlong sequences instead of inserting replacement characters. */
function utf8Decode(bytes: readonly number[]): string | null {
  let text = '';
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index] ?? 0;
    const length = utf8SequenceLength(first);
    if (length === 0 || index + length > bytes.length) return null;

    let code = length === 1 ? first : first & (0xff >> (length + 1));
    for (let offset = 1; offset < length; offset++) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    const minimum = [0, 0, 0x80, 0x800, 0x10000][length] ?? 0;
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;

    text += String.fromCodePoint(code);
    index += length;
  }
  return text;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBase64Url(bytes: readonly number[]): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - index) * 4) / 3));
    for (let position = 0; position < characters; position++) {
      output += ALPHABET[(chunk >> (18 - position * 6)) & 0x3f];
    }
  }
  return output;
}

function decodeBase64Url(text: string): number[] | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = ALPHABET.indexOf(character);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}
