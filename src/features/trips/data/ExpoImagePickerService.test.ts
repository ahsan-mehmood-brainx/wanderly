import { launchImageLibraryAsync } from 'expo-image-picker';

import { createTestLogger } from '@/testing/testDependencies';

import { ExpoImagePickerService } from './ExpoImagePickerService';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const launch = jest.mocked(launchImageLibraryAsync);
const service = () => new ExpoImagePickerService(createTestLogger());

describe('ExpoImagePickerService', () => {
  it('returns the picked image, asking for photos cropped to the cover shape', async () => {
    launch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///a.jpg', width: 1, height: 1 }] });
    await expect(service().pickImage()).resolves.toEqual({ ok: true, value: 'file:///a.jpg' });
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: 'images', aspect: [16, 9] }));
  });

  it('returns null when cancelled', async () => {
    launch.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(service().pickImage()).resolves.toEqual({ ok: true, value: null });
  });

  it('reports a picker failure instead of throwing', async () => {
    launch.mockRejectedValueOnce(new Error('no activity'));
    await expect(service().pickImage()).resolves.toMatchObject({ ok: false });
  });
});
