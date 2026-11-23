import { type Logger } from '@/core/logging/Logger';
import { DocumentImageStore, UnsupportedImageStore } from '@/core/storage/DocumentImageStore';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { type ProfilePhotoStore } from '../domain/repositories';

/** Profile photos in the app's document directory (`profile-photos/`); see {@link DocumentImageStore}. */
export class FileSystemProfilePhotoStore extends DocumentImageStore implements ProfilePhotoStore {
  constructor(idGenerator: IdGenerator, logger: Logger) {
    super('profile-photos', 'profile photo', idGenerator, logger);
  }
}

/** Web has no app file system, so the profile there has no local photo. */
export class UnsupportedProfilePhotoStore extends UnsupportedImageStore implements ProfilePhotoStore {
  constructor() {
    super('Profile photos are not available on this platform');
  }
}
