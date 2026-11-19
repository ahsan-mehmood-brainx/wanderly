import { Directory, File, Paths } from 'expo-file-system';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { type TripCoverStore } from '../domain/repositories';

const COVER_DIRECTORY = 'trip-covers';
const REFERENCE = /^trip-covers\/([A-Za-z0-9_-]+\.[a-z0-9]+)$/;
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

function extensionOf(uri: string): string {
  const path = uri.split(/[?#]/, 1)[0] ?? '';
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : 'jpg';
}

/**
 * Cover photos in the app's document directory. The database keeps a path
 * relative to that directory, because its absolute location changes when iOS
 * updates or restores the app.
 */
export class FileSystemTripCoverStore implements TripCoverStore {
  readonly supported = true;

  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly logger: Logger,
  ) {}

  async importImage(sourceUri: string): Promise<Result<string, AppError>> {
    try {
      new Directory(Paths.document, COVER_DIRECTORY).create({ idempotent: true, intermediates: true });
      const name = `${this.idGenerator()}.${extensionOf(sourceUri)}`;
      await new File(sourceUri).copy(new File(Paths.document, COVER_DIRECTORY, name));
      return ok(`${COVER_DIRECTORY}/${name}`);
    } catch (cause) {
      this.logger.error('Could not save the cover photo', { cause });
      return err(new AppError('storage', 'Could not save the cover photo', { cause }));
    }
  }

  isStoredReference(value: string): boolean {
    return REFERENCE.test(value);
  }

  async remove(reference: string): Promise<void> {
    const file = this.fileFor(reference);
    if (!file) return;
    try {
      if (file.exists) file.delete();
    } catch (cause) {
      this.logger.warn('Could not delete a cover photo', { cause });
    }
  }

  displayUri(reference: string): string | null {
    return this.fileFor(reference)?.uri ?? null;
  }

  /** The pattern also keeps a tampered reference from pointing outside the covers directory. */
  private fileFor(reference: string): File | null {
    const name = REFERENCE.exec(reference)?.[1];
    return name ? new File(Paths.document, COVER_DIRECTORY, name) : null;
  }
}

/** Web has no app file system, so trips there have no cover photo and the form hides the field. */
export class UnsupportedTripCoverStore implements TripCoverStore {
  readonly supported = false;

  async importImage(): Promise<Result<string, AppError>> {
    return err(new AppError('configuration', 'Cover photos are not available on this platform'));
  }

  isStoredReference(): boolean {
    return false;
  }

  async remove(): Promise<void> {}

  displayUri(): string | null {
    return null;
  }
}
