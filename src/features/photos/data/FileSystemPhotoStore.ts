import { Directory, File, Paths } from 'expo-file-system';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { DocumentImageStore, UnsupportedImageStore } from '@/core/storage/DocumentImageStore';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { type PhotoFileStore, type StoredPhotoFile } from '../domain/repositories';

/** Trip and activity photos in the app's document directory (`trip-photos/`); see {@link DocumentImageStore}. */
export class FileSystemPhotoStore extends DocumentImageStore implements PhotoFileStore {
  constructor(idGenerator: IdGenerator, logger: Logger) {
    super('trip-photos', 'photo', idGenerator, logger);
  }

  exists(reference: string): boolean {
    const file = this.fileFor(reference);
    if (!file) return false;
    try {
      return file.exists;
    } catch (cause) {
      this.logger.warn('Could not check a photo file', { cause });
      return false;
    }
  }

  async listStored(): Promise<Result<readonly StoredPhotoFile[], AppError>> {
    try {
      const directory = new Directory(Paths.document, this.directory);
      if (!directory.exists) return ok([]);
      const stored: StoredPhotoFile[] = [];
      for (const entry of directory.list()) {
        // A file whose age can't be read is left out, so cleanup never removes it.
        if (!(entry instanceof File) || entry.lastModified === null) continue;
        stored.push({ reference: `${this.directory}/${entry.name}`, modifiedAt: entry.lastModified });
      }
      return ok(stored);
    } catch (cause) {
      this.logger.warn('Could not list the stored photos', { cause });
      return err(new AppError('storage', 'Could not list the stored photos', { cause }));
    }
  }
}

/** Web has no app file system, so there are no photos there. */
export class UnsupportedPhotoStore extends UnsupportedImageStore implements PhotoFileStore {
  constructor() {
    super('Photos are not available on this platform');
  }

  exists(): boolean {
    return false;
  }

  async listStored(): Promise<Result<readonly StoredPhotoFile[], AppError>> {
    return ok([]);
  }
}
