import { sequentialIds } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { type PhotoFileStore } from '../domain/repositories';
import { FileSystemPhotoStore, UnsupportedPhotoStore } from './FileSystemPhotoStore';

const mockFs = {
  /** File URI → modification time (ms). */
  files: new Map<string, number>(),
  directories: new Set<string>(),
  failList: false,
};

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/');
  const nameOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);
  class File {
    uri: string;
    name: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
      this.name = nameOf(this.uri);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    get modificationTime() {
      return mockFs.files.get(this.uri) ?? null;
    }
    get lastModified() {
      return mockFs.files.get(this.uri) ?? null;
    }
    get size() {
      return mockFs.files.has(this.uri) ? 1000 : 0;
    }
    async copy(destination: File) {
      mockFs.files.set(destination.uri, 0);
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    name: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
      this.name = nameOf(this.uri);
    }
    get exists() {
      return mockFs.directories.has(this.uri);
    }
    create() {
      mockFs.directories.add(this.uri);
    }
    list() {
      if (mockFs.failList) throw new Error('permission denied');
      if (!mockFs.directories.has(this.uri)) throw new Error('no such directory');
      const prefix = `${this.uri}/`;
      const files = [...mockFs.files.keys()]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .map((uri) => new File(uri));
      const directories = [...mockFs.directories]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .map((uri) => new Directory(uri));
      return [...files, ...directories];
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

const DIR = 'file:///docs/trip-photos';

function setup() {
  const logger = createTestLogger();
  return { logger, store: new FileSystemPhotoStore(sequentialIds('photo'), logger) };
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.directories.clear();
  mockFs.failList = false;
});

describe('FileSystemPhotoStore', () => {
  it('says whether a stored photo is still on disk', () => {
    const { store } = setup();
    mockFs.files.set(`${DIR}/a.jpg`, 1);

    expect(store.exists('trip-photos/a.jpg')).toBe(true);
    expect(store.exists('trip-photos/gone.jpg')).toBe(false);
  });

  it.each(['../secrets.jpg', 'trip-photos/../../x.jpg', 'trip-covers/a.jpg', 'file:///etc/passwd', ''])(
    'treats %s as missing without touching the file system',
    (reference) => {
      const { store } = setup();
      mockFs.files.set('file:///docs/trip-covers/a.jpg', 1);
      expect(store.exists(reference)).toBe(false);
      expect(store.displayUri(reference)).toBeNull();
    },
  );

  it('lists the stored photo files with their modification times, skipping folders', async () => {
    const { store } = setup();
    mockFs.directories.add(DIR);
    mockFs.directories.add(`${DIR}/nested`);
    mockFs.files.set(`${DIR}/a.jpg`, 1_000);
    mockFs.files.set(`${DIR}/b.jpg`, 2_000);
    mockFs.files.set('file:///docs/trip-covers/cover.jpg', 3_000);

    const result = await store.listStored();

    expect(result.ok).toBe(true);
    expect(result.ok && [...result.value].sort((x, y) => x.reference.localeCompare(y.reference))).toEqual([
      { reference: 'trip-photos/a.jpg', modifiedAt: 1_000 },
      { reference: 'trip-photos/b.jpg', modifiedAt: 2_000 },
    ]);
  });

  it('lists nothing before the first photo was saved', async () => {
    const { store } = setup();
    await expect(store.listStored()).resolves.toEqual({ ok: true, value: [] });
  });

  it('reports an unreadable folder as a storage error and logs it', async () => {
    const { store, logger } = setup();
    mockFs.directories.add(DIR);
    mockFs.failList = true;

    const result = await store.listStored();

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(logger.warn.mock.calls.length + logger.error.mock.calls.length).toBeGreaterThan(0);
  });

  it('imports into trip-photos with a relative reference', async () => {
    const { store } = setup();
    const imported = await store.importImage('file:///cache/ImageManipulator/processed-1.jpg');
    expect(imported).toEqual({ ok: true, value: 'trip-photos/photo-1.jpg' });
    expect(store.exists('trip-photos/photo-1.jpg')).toBe(true);
  });
});

describe('UnsupportedPhotoStore', () => {
  it('has no photos and nothing to list', async () => {
    const store: PhotoFileStore = new UnsupportedPhotoStore();
    expect(store.supported).toBe(false);
    expect(store.exists('trip-photos/a.jpg')).toBe(false);
    await expect(store.listStored()).resolves.toEqual({ ok: true, value: [] });
    const imported = await store.importImage('file:///a.jpg');
    expect(!imported.ok && imported.error.kind).toBe('configuration');
  });
});
