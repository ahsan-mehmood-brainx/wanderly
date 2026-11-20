import { launchImageLibraryAsync } from 'expo-image-picker';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { type ImagePickerService, type PickImageOptions } from '../domain/repositories';

const COVER_ASPECT = [16, 9] as const;

/** The system photo picker, which needs no library permission. Photos are cropped to the requested shape (a trip cover's by default). */
export class ExpoImagePickerService implements ImagePickerService {
  constructor(private readonly logger: Logger) {}

  async pickImage({ aspect = COVER_ASPECT }: PickImageOptions = {}): Promise<Result<string | null, AppError>> {
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [aspect[0], aspect[1]],
        quality: 0.8,
      });
      return ok(result.canceled ? null : (result.assets[0]?.uri ?? null));
    } catch (cause) {
      this.logger.warn('Could not open the photo library', { cause });
      return err(new AppError('unknown', 'Could not open the photo library', { cause }));
    }
  }
}
