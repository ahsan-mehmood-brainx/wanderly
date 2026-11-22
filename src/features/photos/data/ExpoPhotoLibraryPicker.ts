import { launchImageLibraryAsync } from 'expo-image-picker';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { parseExifDateTime } from '../domain/imageValidation';
import { type PickedImage } from '../domain/Photo';
import { type PhotoLibraryPicker, type PickImagesOptions } from '../domain/repositories';

/** The system photo library through expo-image-picker, several images at once, with EXIF. */
export class ExpoPhotoLibraryPicker implements PhotoLibraryPicker {
  constructor(private readonly logger: Logger) {}

  async pickImages({ selectionLimit }: PickImagesOptions): Promise<Result<readonly PickedImage[] | null, AppError>> {
    try {
      // Full quality and no crop: the photo is resized and compressed once, when it is attached.
      const result = await launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit,
        exif: true,
        quality: 1,
      });
      if (result.canceled) return ok(null);
      return ok(
        result.assets.map((asset): PickedImage => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize ?? null,
          mimeType: asset.mimeType ?? null,
          fileName: asset.fileName ?? null,
          takenAt: parseExifDateTime(asset.exif?.DateTimeOriginal),
          source: 'library',
        })),
      );
    } catch (cause) {
      this.logger.warn('Could not open the photo library', { cause });
      return err(new AppError('unknown', 'Could not open the photo library', { cause }));
    }
  }
}
