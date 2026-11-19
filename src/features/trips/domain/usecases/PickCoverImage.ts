import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type ImagePickerService } from '../repositories';

/**
 * Opens the photo library. Returns the picked image's temporary URI (copied into
 * app storage only when the trip is saved), or `null` when the traveller cancels.
 */
export class PickCoverImage implements UseCase<void, Result<string | null, AppError>> {
  constructor(private readonly picker: ImagePickerService) {}

  execute(): Promise<Result<string | null, AppError>> {
    return this.picker.pickImage();
  }
}
