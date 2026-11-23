---
diff_hash: 3fb2d238cc50d025362d146336b48229db43666646e0c61fae4e6bd0d1b869e5
reviewed_at: 2026-11-22T18:35:59Z
---

## Summary

Adds the photos feature (feature 09/photos): camera capture and library picking, JPEG re-encoding to app storage, a `photos` SQLite table (migration 5, owner-scoped queries), gallery/viewer/preview screens, trip cover from a gallery photo (`SetTripCover`), orphan file pruning, and en/es/ur strings. Stack: React (Expo / React Native). Ownership checks, reference-pattern validation, cleanup on partial failure and permission handling look sound. Three minor findings.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **src/features/photos/presentation/hooks/usePhotos.ts:91** — `items` calls `photoFileStore.exists()` (a synchronous file-system stat) for every photo inside a `useMemo` that recomputes whenever `activities`, `photos` or the store change. With up to 200 photos per trip this blocks the JS thread on each recompute. *(performance)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed: existence results are now cached per reference in a store-keyed map (usePhotos.ts:37-99), so each file is stat-ed once instead of on every recompute.

### Low (2)
- **src/features/photos/domain/usecases/photoUseCases.ts:158** — The per-trip photo cap is enforced by a read-then-insert (`countByTrip` then `insertMany`) with no atomic guard, so two overlapping attaches could exceed `MAX_PHOTOS_PER_TRIP`. *(correctness)*
  - status: fixed
  - dev_reasoning: The cap is already authoritative in LocalPhotoRepository.insertMany, whose INSERT only runs when `(SELECT COUNT(*) FROM photos WHERE owner_id = ? AND trip_id = ?) < MAX_PHOTOS_PER_TRIP`, inside a transaction. The countByTrip in AttachPhotos is only an early, friendly rejection. Added a repository test that proves a second attach is refused at the cap.
  - ai_reasoning: Still present: countByTrip then insertMany is unchanged. The UI blocks concurrent changes via `changeRequestId`, so impact is minimal; a count condition in the INSERT would make the limit authoritative.
- **src/features/photos/presentation/screens/PhotoPreviewScreen.tsx:121** — Preview items are keyed by `${index}-${image.uri}`; removing an item shifts indices and remounts every following row. *(maintainability)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed: rows are now keyed by `image.uri` (PhotoPreviewScreen.tsx:117), so removal no longer remounts siblings.

## Reviewed files
- app.json
- docs/ARCHITECTURE.md
- jest.setup.ts
- package-lock.json
- package.json
- src/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]/photos.tsx
- src/app/(app)/(tabs)/trips/[tripId]/photos/[photoId].tsx
- src/app/(app)/(tabs)/trips/[tripId]/photos/camera.tsx
- src/app/(app)/(tabs)/trips/[tripId]/photos/index.tsx
- src/app/(app)/(tabs)/trips/[tripId]/photos/preview.tsx
- src/app/(app)/(tabs)/trips/_layout.tsx
- src/bootstrap/createAppContainer.ts
- src/bootstrap/databaseMigrations.ts
- src/core/di/AppDependencies.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/i18n/locales/ur.ts
- src/core/storage/DocumentImageStore.ts
- src/core/store/store.ts
- src/features/budget/data/LocalExpenseRepository.test.ts
- src/features/itinerary/presentation/screens/ActivityDetailsScreen.tsx
- src/features/photos/data/ExpoImageProcessor.ts
- src/features/photos/data/ExpoMediaPermissionService.test.ts
- src/features/photos/data/ExpoMediaPermissionService.ts
- src/features/photos/data/ExpoPhotoLibraryPicker.test.ts
- src/features/photos/data/ExpoPhotoLibraryPicker.ts
- src/features/photos/data/FileSystemPhotoStore.test.ts
- src/features/photos/data/FileSystemPhotoStore.ts
- src/features/photos/data/LocalPhotoRepository.test.ts
- src/features/photos/data/LocalPhotoRepository.ts
- src/features/photos/data/photosMigrations.ts
- src/features/photos/di.ts
- src/features/photos/domain/Photo.ts
- src/features/photos/domain/imageValidation.edge.test.ts
- src/features/photos/domain/imageValidation.test.ts
- src/features/photos/domain/imageValidation.ts
- src/features/photos/domain/repositories.ts
- src/features/photos/domain/usecases/photoUseCases.edge.test.ts
- src/features/photos/domain/usecases/photoUseCases.test.ts
- src/features/photos/domain/usecases/photoUseCases.ts
- src/features/photos/presentation/components/ActivityPhotosSection.tsx
- src/features/photos/presentation/components/AddPhotoMenu.tsx
- src/features/photos/presentation/components/CameraCanvas.tsx
- src/features/photos/presentation/components/MediaPermissionView.tsx
- src/features/photos/presentation/components/PhotoGrid.tsx
- src/features/photos/presentation/components/PhotoTile.tsx
- src/features/photos/presentation/components/PhotosEntryCard.tsx
- src/features/photos/presentation/components/PhotosStateView.tsx
- src/features/photos/presentation/format.ts
- src/features/photos/presentation/hooks/useAddPhotos.ts
- src/features/photos/presentation/hooks/useMediaPermission.test.tsx
- src/features/photos/presentation/hooks/useMediaPermission.ts
- src/features/photos/presentation/hooks/usePhotos.ts
- src/features/photos/presentation/screens/CameraScreen.tsx
- src/features/photos/presentation/screens/PhotoGalleryScreen.tsx
- src/features/photos/presentation/screens/PhotoPreviewScreen.tsx
- src/features/photos/presentation/screens/PhotoViewerScreen.tsx
- src/features/photos/presentation/screens/photoFlows.test.tsx
- src/features/photos/presentation/state/photosSlice.test.ts
- src/features/photos/presentation/state/photosSlice.ts
- src/features/photos/presentation/state/selectors.ts
- src/features/trips/di.ts
- src/features/trips/domain/usecases/SetTripCover.test.ts
- src/features/trips/domain/usecases/tripUseCases.ts
- src/features/trips/presentation/screens/TripScreen.tsx
- src/features/trips/presentation/state/tripsSlice.ts
- src/shared/navigation/routes.ts
- src/shared/ui/icons.ts
- src/testing/photoFixtures.ts
- src/testing/testDependencies.ts
- package-lock.json (dependency changes only)
