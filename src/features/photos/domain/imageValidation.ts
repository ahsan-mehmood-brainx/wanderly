import { type PickedImage } from './Photo';

/** Image types a photo can be attached from (stored photos are always re-encoded as JPEG). */
export const SUPPORTED_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** Largest source file accepted, before processing. */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
/** Longest edge of a stored photo, in pixels. */
export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.8;
export const MAX_PHOTOS_PER_TRIP = 200;
/** Images one library selection may hold. */
export const MAX_SELECTION = 10;

export type ImageRejection = 'unsupportedType' | 'tooLarge' | 'invalidDimensions';

export type ImageValidation = { readonly ok: true } | { readonly ok: false; readonly reason: ImageRejection };

const SUPPORTED_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

function extensionOf(name: string | null): string | null {
  if (!name) return null;
  const path = name.split(/[?#]/)[0] ?? '';
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}

function hasSupportedType(image: PickedImage): boolean {
  if (image.mimeType) return SUPPORTED_IMAGE_TYPES.includes(image.mimeType.toLowerCase());
  // Some pickers leave the type out; the file name (or the URI) still tells a photo from a GIF or a video.
  const extension = extensionOf(image.fileName) ?? extensionOf(image.uri);
  return extension !== null && SUPPORTED_EXTENSIONS.includes(extension);
}

const isPixelCount = (value: number) => Number.isSafeInteger(value) && value > 0;

/** Whether a picked image can be attached, and why not. */
export function validatePickedImage(image: PickedImage): ImageValidation {
  if (!hasSupportedType(image)) return { ok: false, reason: 'unsupportedType' };
  if (image.fileSize !== null && image.fileSize > MAX_SOURCE_BYTES) return { ok: false, reason: 'tooLarge' };
  if (!isPixelCount(image.width) || !isPixelCount(image.height)) return { ok: false, reason: 'invalidDimensions' };
  return { ok: true };
}

/** The size that fits `width` x `height` within `maxEdge` on its longest edge, keeping the aspect ratio; never enlarges. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** An EXIF `DateTimeOriginal` (`YYYY:MM:DD HH:MM:SS`, device-local time) as epoch ms, or `null`. */
export function parseExifDateTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = EXIF_DATE_TIME.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  // The Date constructor rolls 30 February over into March; a real date round-trips.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}
