import { sequentialIds } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { FileSystemProfilePhotoStore, UnsupportedProfilePhotoStore } from './FileSystemProfilePhotoStore';

const mockFs = {
  files: new Set<string>(),
  directories: [] as string[],
  failCopy: false,
  failDelete: false,
};

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    create() {
      mockFs.directories.push(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    async copy(destination: File) {
      if (mockFs.failCopy) throw new Error('disk full');
      mockFs.files.add(destination.uri);
    }
    delete() {
      if (mockFs.failDelete) throw new Error('locked');
      mockFs.files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

function setup() {
  const logger = createTestLogger();
  return { logger, store: new FileSystemProfilePhotoStore(sequentialIds('photo'), logger) };
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.directories.length = 0;
  mockFs.failCopy = false;
  mockFs.failDelete = false;
});

describe('FileSystemProfilePhotoStore edge cases', () => {
  it('copies a picked photo into profile-photos and returns a relative reference it recognises', async () => {
    const { store } = setup();

    const result = await store.importImage('file:///cache/ImagePicker/IMG_1.HEIC?size=2');

    expect(result).toEqual({ ok: true, value: 'profile-photos/photo-1.heic' });
    expect(mockFs.directories).toEqual(['file:///docs/profile-photos']);
    expect(mockFs.files.has('file:///docs/profile-photos/photo-1.heic')).toBe(true);
    expect(result.ok && store.isStoredReference(result.value)).toBe(true);
  });

  it('falls back to .jpg for an Android content URI without an extension', async () => {
    const { store } = setup();

    await expect(store.importImage('content://media/external/images/42')).resolves.toEqual({
      ok: true,
      value: 'profile-photos/photo-1.jpg',
    });
  });

  it('falls back to .jpg when the extension is not an image type', async () => {
    const { store } = setup();

    await expect(store.importImage('file:///cache/notes.txt')).resolves.toEqual({
      ok: true,
      value: 'profile-photos/photo-1.jpg',
    });
  });

  it('reports a failed copy as a storage error and logs it', async () => {
    const { store, logger } = setup();
    mockFs.failCopy = true;

    const result = await store.importImage('file:///cache/a.jpg');

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(logger.error).toHaveBeenCalled();
  });

  it.each([
    '../secrets.jpg',
    'profile-photos/../../x.jpg',
    'profile-photos/a/b.jpg',
    'trip-covers/a.jpg',
    'file:///etc/passwd',
    'https://cdn.example.com/avatar.png',
    'profile-photos/',
    '',
  ])('does not treat %j as a stored profile photo, so it is never resolved or deleted', async (reference) => {
    const { store } = setup();
    mockFs.files.add('file:///docs/profile-photos/a.jpg');

    expect(store.isStoredReference(reference)).toBe(false);
    expect(store.displayUri(reference)).toBeNull();
    await expect(store.remove(reference)).resolves.toBeUndefined();
    expect(mockFs.files.size).toBe(1);
  });

  it('resolves a stored reference against the current document directory', () => {
    expect(setup().store.displayUri('profile-photos/a.png')).toBe('file:///docs/profile-photos/a.png');
  });

  it('removes a stored photo, ignores one that is already gone, and only logs a failed delete', async () => {
    const { store, logger } = setup();
    mockFs.files.add('file:///docs/profile-photos/a.jpg');

    await store.remove('profile-photos/a.jpg');
    expect(mockFs.files.size).toBe(0);
    await expect(store.remove('profile-photos/a.jpg')).resolves.toBeUndefined();

    mockFs.files.add('file:///docs/profile-photos/b.jpg');
    mockFs.failDelete = true;
    await expect(store.remove('profile-photos/b.jpg')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('UnsupportedProfilePhotoStore edge cases', () => {
  it('on web, reports photos as unavailable and never resolves a reference', async () => {
    const store = new UnsupportedProfilePhotoStore();

    expect(store.supported).toBe(false);
    expect(store.isStoredReference()).toBe(false);
    expect(store.displayUri()).toBeNull();
    await expect(store.remove()).resolves.toBeUndefined();
    const result = await store.importImage();
    expect(!result.ok && result.error.kind).toBe('configuration');
  });
});
