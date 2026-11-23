import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { fitWithin } from '../domain/imageValidation';
import {
  type ImageProcessor,
  type ImageSource,
  type ProcessedImage,
  type ProcessImageOptions,
} from '../domain/repositories';

/** Resizes and re-encodes images as JPEG with expo-image-manipulator. */
export class ExpoImageProcessor implements ImageProcessor {
  constructor(private readonly logger: Logger) {}

  async process(source: ImageSource, options: ProcessImageOptions): Promise<Result<ProcessedImage, AppError>> {
    const target = fitWithin(source.width, source.height, options.maxEdge);
    // Decoding is capped at the target size, so a 48 MP photo is never held in memory at full resolution.
    const context = ImageManipulator.manipulate(source.uri, {
      maxWidth: Math.max(target.width, target.height),
      maxHeight: Math.max(target.width, target.height),
    });
    try {
      // Only the longest edge is given so the library keeps the decoded image's own aspect ratio
      // (the reported size can be pre-EXIF-rotation on some Android sources).
      if (target.width !== source.width || target.height !== source.height) {
        context.resize(target.width >= target.height ? { width: target.width } : { height: target.height });
      }
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ compress: options.quality, format: SaveFormat.JPEG });
        const fileSize = new File(saved.uri).size;
        if (!(fileSize > 0)) throw new Error('The processed image is empty');
        return ok({ uri: saved.uri, width: saved.width, height: saved.height, fileSize });
      } finally {
        image.release();
      }
    } catch (cause) {
      this.logger.warn('Could not process a photo', { cause });
      return err(new AppError('storage', 'Could not process the photo', { cause }));
    } finally {
      context.release();
    }
  }

  async discard(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (cause) {
      this.logger.warn('Could not delete a processed photo', { cause });
    }
  }
}
