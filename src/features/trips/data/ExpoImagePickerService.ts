import { launchImageLibraryAsync } from 'expo-image-picker';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { type ImagePickerService } from '../domain/repositories';

/** The system photo picker, which needs no library permission. Photos are cropped to the cover's shape. */
export class ExpoImagePickerService implements ImagePickerService {
  constructor(private readonly logger: Logger) {}

  async pickImage(): Promise<Result<string | null, AppError>> {
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      return ok(result.canceled ? null : (result.assets[0]?.uri ?? null));
    } catch (cause) {
      this.logger.warn('Could not open the photo library', { cause });
      return err(new AppError('unknown', 'Could not open the photo library', { cause }));
    }
  }
}
