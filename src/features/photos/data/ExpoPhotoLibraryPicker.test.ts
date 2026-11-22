import { launchImageLibraryAsync } from 'expo-image-picker';

import { createTestLogger } from '@/testing/testDependencies';

import { ExpoPhotoLibraryPicker } from './ExpoPhotoLibraryPicker';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const launch = jest.mocked(launchImageLibraryAsync);

function setup() {
  const logger = createTestLogger();
  return { logger, picker: new ExpoPhotoLibraryPicker(logger) };
}

beforeEach(() => launch.mockReset());

describe('ExpoPhotoLibraryPicker', () => {
  it('opens the library for several images with EXIF, uncropped and at full quality', async () => {
    launch.mockResolvedValueOnce({ canceled: true, assets: null });

    await setup().picker.pickImages({ selectionLimit: 10 });

    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: 10,
        exif: true,
        quality: 1,
      }),
    );
    expect(launch.mock.calls[0]?.[0]?.allowsEditing).not.toBe(true);
  });

  it('maps each picked asset with its metadata and when it was taken', async () => {
    launch.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/ImagePicker/a.heic',
          width: 4032,
          height: 3024,
          fileSize: 2_500_000,
          mimeType: 'image/heic',
          fileName: 'IMG_0001.HEIC',
          exif: { DateTimeOriginal: '2027:07:02 10:15:00' },
        },
        { uri: 'file:///cache/ImagePicker/b.jpg', width: 800, height: 600 },
      ],
    });

    const result = await setup().picker.pickImages({ selectionLimit: 10 });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          uri: 'file:///cache/ImagePicker/a.heic',
          width: 4032,
          height: 3024,
          fileSize: 2_500_000,
          mimeType: 'image/heic',
          fileName: 'IMG_0001.HEIC',
          takenAt: new Date(2027, 6, 2, 10, 15, 0).getTime(),
          source: 'library',
        },
        {
          uri: 'file:///cache/ImagePicker/b.jpg',
          width: 800,
          height: 600,
          fileSize: null,
          mimeType: null,
          fileName: null,
          takenAt: null,
          source: 'library',
        },
      ],
    });
  });

  it('ignores an unreadable EXIF date', async () => {
    launch.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 1, height: 1, exif: { DateTimeOriginal: '0000:00:00 00:00:00' } }],
    });
    const result = await setup().picker.pickImages({ selectionLimit: 10 });
    expect(result.ok && result.value?.[0]?.takenAt).toBeNull();
  });

  it('returns null when cancelled', async () => {
    launch.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(setup().picker.pickImages({ selectionLimit: 10 })).resolves.toEqual({ ok: true, value: null });
  });

  it('reports a picker failure instead of throwing, and logs it', async () => {
    const { picker, logger } = setup();
    launch.mockRejectedValueOnce(new Error('no activity'));

    await expect(picker.pickImages({ selectionLimit: 10 })).resolves.toMatchObject({ ok: false });
    expect(logger.warn).toHaveBeenCalled();
  });
});
