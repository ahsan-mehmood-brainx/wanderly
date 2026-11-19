import { sequentialIds } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { FileSystemTripCoverStore, UnsupportedTripCoverStore } from './FileSystemTripCoverStore';

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
  return { logger, store: new FileSystemTripCoverStore(sequentialIds('cover'), logger) };
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.directories.length = 0;
  mockFs.failCopy = false;
  mockFs.failDelete = false;
});

describe('FileSystemTripCoverStore', () => {
  it('copies a picked image in and returns a relative reference', async () => {
    const { store } = setup();
    const result = await store.importImage('file:///cache/ImagePicker/photo.PNG?x=1');

    expect(result).toEqual({ ok: true, value: 'trip-covers/cover-1.png' });
    expect(mockFs.directories).toEqual(['file:///docs/trip-covers']);
    expect(mockFs.files.has('file:///docs/trip-covers/cover-1.png')).toBe(true);
  });

  it('falls back to .jpg for an unknown extension', async () => {
    const { store } = setup();
    await expect(store.importImage('content://media/1234')).resolves.toEqual({
      ok: true,
      value: 'trip-covers/cover-1.jpg',
    });
  });

  it('reports a failed copy as a storage error', async () => {
    const { store } = setup();
    mockFs.failCopy = true;
    const result = await store.importImage('file:///a.jpg');
    expect(!result.ok && result.error.kind).toBe('storage');
  });

  it('resolves references against the current document directory', () => {
    expect(setup().store.displayUri('trip-covers/a.jpg')).toBe('file:///docs/trip-covers/a.jpg');
  });

  it.each(['../secrets.jpg', 'trip-covers/../../x.jpg', 'file:///etc/passwd', 'trip-covers/a/b.jpg'])(
    'does not treat %s as a stored cover',
    async (reference) => {
      const { store } = setup();
      expect(store.isStoredReference(reference)).toBe(false);
      expect(store.displayUri(reference)).toBeNull();
      await expect(store.remove(reference)).resolves.toBeUndefined();
    },
  );

  it('removes a file, ignores a missing one, and only logs a failure', async () => {
    const { store, logger } = setup();
    mockFs.files.add('file:///docs/trip-covers/a.jpg');
    await store.remove('trip-covers/a.jpg');
    expect(mockFs.files.size).toBe(0);
    await store.remove('trip-covers/a.jpg');

    mockFs.files.add('file:///docs/trip-covers/b.jpg');
    mockFs.failDelete = true;
    await expect(store.remove('trip-covers/b.jpg')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('UnsupportedTripCoverStore', () => {
  it('says covers are unavailable', async () => {
    const store = new UnsupportedTripCoverStore();
    expect(store.supported).toBe(false);
    expect(store.isStoredReference()).toBe(false);
    expect(store.displayUri()).toBeNull();
    const result = await store.importImage();
    expect(!result.ok && result.error.kind).toBe('configuration');
  });
});
