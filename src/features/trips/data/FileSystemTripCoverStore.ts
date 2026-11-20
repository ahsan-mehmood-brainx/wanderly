import { type Logger } from '@/core/logging/Logger';
import { DocumentImageStore, UnsupportedImageStore } from '@/core/storage/DocumentImageStore';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { type TripCoverStore } from '../domain/repositories';

/** Cover photos in the app's document directory (`trip-covers/`); see {@link DocumentImageStore}. */
export class FileSystemTripCoverStore extends DocumentImageStore implements TripCoverStore {
  constructor(idGenerator: IdGenerator, logger: Logger) {
    super('trip-covers', 'cover photo', idGenerator, logger);
  }
}

/** Web has no app file system, so trips there have no cover photo and the form hides the field. */
export class UnsupportedTripCoverStore extends UnsupportedImageStore implements TripCoverStore {
  constructor() {
    super('Cover photos are not available on this platform');
  }
}
