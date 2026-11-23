export const PHOTO_SOURCES = ['camera', 'library'] as const;

export type PhotoSource = (typeof PHOTO_SOURCES)[number];

/**
 * A photo attached to a trip, or to one of its itinerary activities. Only metadata
 * and a relative file reference are kept: the image itself stays in app storage.
 */
export interface Photo {
  readonly id: string;
  readonly tripId: string;
  /** `null` for a photo of the trip itself. */
  readonly activityId: string | null;
  /** Relative reference into app storage (`trip-photos/<name>`). */
  readonly reference: string;
  /** Pixel size of the stored (processed) image. */
  readonly width: number;
  readonly height: number;
  /** Bytes of the stored (processed) image. */
  readonly fileSize: number;
  /** Stored images are always re-encoded as JPEG. */
  readonly mimeType: 'image/jpeg';
  readonly source: PhotoSource;
  /** When the picture was taken (EXIF), epoch ms; `null` when unknown. */
  readonly takenAt: number | null;
  readonly createdAt: number;
}

/** An image the traveller captured or picked, not yet processed or attached. */
export interface PickedImage {
  /** Temporary URI handed out by the camera or picker. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly fileSize: number | null;
  readonly mimeType: string | null;
  readonly fileName: string | null;
  readonly takenAt: number | null;
  readonly source: PhotoSource;
}
