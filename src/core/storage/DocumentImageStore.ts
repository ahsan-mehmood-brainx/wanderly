import { Directory, File, Paths } from 'expo-file-system';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type IdGenerator } from '@/core/utils/IdGenerator';

/** Images the app keeps in its own storage, saved with a record by reference. */
export interface ImageStore {
  /** False where the platform can't keep images (web): forms hide the image picker. */
  readonly supported: boolean;
  /** Copies a picked image into app storage and returns the reference to save. */
  importImage(sourceUri: string): Promise<Result<string, AppError>>;
  /** True when `value` is a reference this store returned (as opposed to a newly picked image URI). */
  isStoredReference(value: string): boolean;
  /** Deletes a stored image. Best effort: a failure is logged, never surfaced. */
  remove(reference: string): Promise<void>;
  /** A URI an `<Image>` can show, or `null` if the reference can't be resolved. */
  displayUri(reference: string): string | null;
}

const DIRECTORY_NAME = /^[a-z][a-z0-9-]*$/;
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

function extensionOf(uri: string): string {
  const path = uri.split(/[?#]/, 1)[0] ?? '';
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? extension : 'jpg';
}

/**
 * Images in one folder of the app's document directory, referenced as
 * `<directory>/<file>`: a relative path, because the absolute location changes
 * when iOS updates or restores the app.
 */
export class DocumentImageStore implements ImageStore {
  readonly supported = true;
  private readonly reference: RegExp;

  /**
   * @param directory Folder name (lowercase letters, digits and hyphens).
   * @param description What the images are, for logs and errors (e.g. "cover photo").
   */
  constructor(
    protected readonly directory: string,
    private readonly description: string,
    private readonly idGenerator: IdGenerator,
    protected readonly logger: Logger,
  ) {
    if (!DIRECTORY_NAME.test(directory)) throw new Error(`Invalid image directory name: ${directory}`);
    this.reference = new RegExp(`^${directory}/([A-Za-z0-9_-]+\\.[a-z0-9]+)$`);
  }

  async importImage(sourceUri: string): Promise<Result<string, AppError>> {
    try {
      new Directory(Paths.document, this.directory).create({ idempotent: true, intermediates: true });
      const name = `${this.idGenerator()}.${extensionOf(sourceUri)}`;
      await new File(sourceUri).copy(new File(Paths.document, this.directory, name));
      return ok(`${this.directory}/${name}`);
    } catch (cause) {
      this.logger.error(`Could not save the ${this.description}`, { cause });
      return err(new AppError('storage', `Could not save the ${this.description}`, { cause }));
    }
  }

  isStoredReference(value: string): boolean {
    return this.reference.test(value);
  }

  async remove(reference: string): Promise<void> {
    const file = this.fileFor(reference);
    if (!file) return;
    try {
      if (file.exists) file.delete();
    } catch (cause) {
      this.logger.warn(`Could not delete a ${this.description}`, { cause });
    }
  }

  displayUri(reference: string): string | null {
    return this.fileFor(reference)?.uri ?? null;
  }

  /** The pattern also keeps a tampered reference from pointing outside the store's folder. */
  protected fileFor(reference: string): File | null {
    const name = this.reference.exec(reference)?.[1];
    return name ? new File(Paths.document, this.directory, name) : null;
  }
}

/** Web has no app file system, so there are no stored images there. */
export class UnsupportedImageStore implements ImageStore {
  readonly supported = false;

  /** @param unavailableMessage The error message for an import, e.g. "Cover photos are not available on this platform". */
  constructor(private readonly unavailableMessage: string) {}

  async importImage(): Promise<Result<string, AppError>> {
    return err(new AppError('configuration', this.unavailableMessage));
  }

  isStoredReference(): boolean {
    return false;
  }

  async remove(): Promise<void> {}

  displayUri(): string | null {
    return null;
  }
}
