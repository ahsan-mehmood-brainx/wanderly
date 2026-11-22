import { type TFunction } from 'i18next';

import { type AttachRejection } from '../domain/usecases/photoUseCases';
import { MAX_PHOTOS_PER_TRIP, MAX_SOURCE_BYTES } from '../domain/imageValidation';

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

function formatNumber(value: number, language: string, maximumFractionDigits: number): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits }).format(value);
  } catch {
    return value.toFixed(maximumFractionDigits);
  }
}

/** "480 KB" / "1.2 MB". */
export function formatFileSize(bytes: number, language: string, t: TFunction): string {
  if (bytes < BYTES_PER_MB) {
    return t('photos.fileSize.kb', { value: formatNumber(Math.max(1, Math.round(bytes / BYTES_PER_KB)), language, 0) });
  }
  return t('photos.fileSize.mb', { value: formatNumber(bytes / BYTES_PER_MB, language, 1) });
}

/** A date and time in the reader's language, e.g. "15 Jun 2027, 09:30". */
export function formatPhotoDate(epochMs: number, language: string): string {
  const date = new Date(epochMs);
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Why one image of a selection can't be attached. */
export function rejectionMessage(reason: AttachRejection, t: TFunction): string {
  switch (reason) {
    case 'unsupportedType':
      return t('photos.preview.rejection.unsupportedType');
    case 'tooLarge':
      return t('photos.preview.rejection.tooLarge', { max: Math.round(MAX_SOURCE_BYTES / BYTES_PER_MB) });
    case 'invalidDimensions':
      return t('photos.preview.rejection.invalidDimensions');
    case 'limitReached':
      return t('photos.preview.rejection.limitReached', { max: MAX_PHOTOS_PER_TRIP });
  }
}
