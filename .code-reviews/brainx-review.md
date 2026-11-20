---
diff_hash: 5964ce839ba1cf863932a45c550a2724fa3bf0e25ebd692414725b2487db5b17
reviewed_at: 2026-11-20T07:43:37Z
---

## Summary

Adds the Favorites feature (replacing the Saved Places stub): SQLite-backed favorites, collections and memberships (migration 3), owner-scoped repository with zod-validated rows, use cases, an RTK slice with a single-writer lock and stale-load protection, Saved Places and Collection screens, save buttons on the destination screen and map place sheet, i18n (en/es), plus a PreferencesGate fix for applying the device language. Stack: React (Expo / React Native), reviewed with the React criteria adapted to RN. `tsc --noEmit` and `expo lint` ran clean. Queries are parameterized and always scoped by `owner_id`; foreign keys are enabled per connection, so the cascades hold. Migration version 3 follows trips (1) and itinerary (2) with no collision. No Critical, High or Medium findings. The previous `.code-reviews/brainx-review.md` is deleted in this diff, so this is a fresh review.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (2)
- **src/features/favorites/presentation/components/SavedPlaceActionsSheet.tsx:77** — When `removeFavorite` is refused (another change is running) or throws, `remove()` just returns to the menu with no message, so the tap looks like it did nothing. *(error-handling)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The `notSaving` condition makes a second concurrent change a silent no-op. `CollectionPickerSheet.tsx:56` (`save`) does the same. Showing the generic error message, or disabling the action while `saving` is true, would make the behavior visible. `CollectionNameSheet` documents the same pattern, so this is consistency, not a data risk.
- **src/features/favorites/presentation/components/SavedPlaceActionsSheet.tsx:143** — The Remove confirm sheet's Cancel calls `onClose`, which closes the whole actions flow instead of returning to the menu; the `remove` step's `onCancel` and the other steps behave differently. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Minor UX inconsistency: after Keep, the user must reopen the place's actions. Calling `setStep('menu')` on cancel would match how a failed remove returns to the menu. No functional impact.

## Reviewed files
- docs/ARCHITECTURE.md
- src/app/(app)/saved/_layout.tsx
- src/app/(app)/saved/collections/[collectionId].tsx
- src/app/(app)/saved/index.tsx
- src/bootstrap/PreferencesGate.test.tsx
- src/bootstrap/PreferencesGate.tsx
- src/bootstrap/appliedLanguage.ts
- src/bootstrap/createAppContainer.test.ts
- src/bootstrap/createAppContainer.ts
- src/bootstrap/databaseMigrations.ts
- src/core/di/AppDependencies.ts
- src/core/i18n/locales/en.ts
- src/core/i18n/locales/es.ts
- src/core/store/store.ts
- src/features/auth/presentation/screens/RegisterScreen.tsx
- src/features/discover/presentation/screens/DestinationScreen.tsx
- src/features/favorites/data/LocalFavoritesRepository.edge.test.ts
- src/features/favorites/data/LocalFavoritesRepository.test.ts
- src/features/favorites/data/LocalFavoritesRepository.ts
- src/features/favorites/data/favoritesMigrations.ts
- src/features/favorites/di.ts
- src/features/favorites/domain/Collection.ts
- src/features/favorites/domain/Favorite.edge.test.ts
- src/features/favorites/domain/Favorite.test.ts
- src/features/favorites/domain/Favorite.ts
- src/features/favorites/domain/collectionValidation.test.ts
- src/features/favorites/domain/collectionValidation.ts
- src/features/favorites/domain/favoriteSearch.test.ts
- src/features/favorites/domain/favoriteSearch.ts
- src/features/favorites/domain/repositories.ts
- src/features/favorites/domain/usecases/collectionWrites.test.ts
- src/features/favorites/domain/usecases/favoriteUseCases.edge.test.ts
- src/features/favorites/domain/usecases/favoriteUseCases.test.ts
- src/features/favorites/domain/usecases/favoriteUseCases.ts
- src/features/favorites/presentation/components/CollectionCard.tsx
- src/features/favorites/presentation/components/CollectionNameSheet.tsx
- src/features/favorites/presentation/components/CollectionPickerSheet.tsx
- src/features/favorites/presentation/components/FavoriteButton.tsx
- src/features/favorites/presentation/components/SavedPlaceActionsSheet.tsx
- src/features/favorites/presentation/components/SavedPlaceRow.tsx
- src/features/favorites/presentation/format.ts
- src/features/favorites/presentation/hooks/useCollection.ts
- src/features/favorites/presentation/hooks/useFavoriteToggle.edge.test.tsx
- src/features/favorites/presentation/hooks/useFavoriteToggle.test.tsx
- src/features/favorites/presentation/hooks/useFavoriteToggle.ts
- src/features/favorites/presentation/hooks/useFavorites.ts
- src/features/favorites/presentation/screens/CollectionDetailsScreen.test.tsx
- src/features/favorites/presentation/screens/CollectionDetailsScreen.tsx
- src/features/favorites/presentation/screens/FavoritesScreen.tsx
- src/features/favorites/presentation/screens/favoritesFlows.edge.test.tsx
- src/features/favorites/presentation/screens/favoritesFlows.test.tsx
- src/features/favorites/presentation/screens/saveFromDetails.edge.test.tsx
- src/features/favorites/presentation/screens/saveFromDetails.test.tsx
- src/features/favorites/presentation/state/favoritesSlice.edge.test.ts
- src/features/favorites/presentation/state/favoritesSlice.test.ts
- src/features/favorites/presentation/state/favoritesSlice.ts
- src/features/favorites/presentation/state/selectors.ts
- src/features/itinerary/data/LocalActivityRepository.test.ts
- src/features/map/presentation/components/PlaceSheet.tsx
- src/features/saved-places/presentation/screens/SavedPlacesScreen.tsx
- src/shared/navigation/routes.ts
- src/shared/ui/icons.test.ts
- src/shared/ui/icons.ts
- src/testing/favoritesFixtures.ts
- src/testing/testDependencies.ts
- .code-reviews/brainx-review.md (deleted in diff; skipped)
- Test files and docs were skimmed, not reviewed line by line
