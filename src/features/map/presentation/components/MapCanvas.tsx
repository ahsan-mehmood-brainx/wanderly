import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import MapView, { type LongPressEvent, Marker, type Region } from 'react-native-maps';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { formatPinLabel } from '../../domain/geo';
import { type CustomMarker, type LocationSearchResult, type Place } from '../../domain/Place';

/** About 3 km across: the 1.5 km search radius fits on a phone screen. */
const NEARBY_DELTA = 0.03;
const ANIMATION_MS = 400;

const regionAround = ({ latitude, longitude }: Coordinates): Region => ({
  latitude,
  longitude,
  latitudeDelta: NEARBY_DELTA,
  longitudeDelta: NEARBY_DELTA,
});

interface MapCanvasProps {
  readonly center: Coordinates | null;
  /** A new value moves the camera back to `center`, even when `center` itself is unchanged. */
  readonly recenterRequest: number;
  readonly showsUserLocation: boolean;
  readonly places: readonly Place[];
  readonly searchTarget: LocationSearchResult | null;
  readonly pins: readonly CustomMarker[];
  readonly onSelectPlace: (place: Place) => void;
  readonly onSelectPin: (pin: CustomMarker) => void;
  readonly onLongPress: (coordinates: Coordinates) => void;
  readonly onReady: () => void;
}

/**
 * The only component that touches react-native-maps: the platform's own base map
 * (Apple Maps / Google Maps) with OpenStreetMap places, the search result and the
 * user's pins as plain markers (`tracksViewChanges` off keeps 100 markers cheap).
 */
export function MapCanvas({
  center,
  recenterRequest,
  showsUserLocation,
  places,
  searchTarget,
  pins,
  onSelectPlace,
  onSelectPin,
  onLongPress,
  onReady,
}: MapCanvasProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState(() => (center ? regionAround(center) : undefined));
  const [mapReady, setMapReady] = useState(false);
  const handleMapReady = useCallback(() => {
    setMapReady(true);
    onReady();
  }, [onReady]);

  // Camera moves wait for the map: Android's Google map drops them while it is still starting,
  // so a position that arrives first is applied once `onMapReady` fires.
  const latitude = center?.latitude;
  const longitude = center?.longitude;
  useEffect(() => {
    if (!mapReady || latitude === undefined || longitude === undefined) return;
    mapRef.current?.animateToRegion(regionAround({ latitude, longitude }), ANIMATION_MS);
  }, [mapReady, latitude, longitude, recenterRequest]);

  return (
    <MapView
      ref={mapRef}
      testID="explore-map"
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      accessibilityHint={t('map.longPressHint')}
      onMapReady={handleMapReady}
      onLongPress={(event: LongPressEvent) => onLongPress(event.nativeEvent.coordinate)}
    >
      {places.map((place) => (
        <Marker
          key={place.id}
          testID={`place-marker-${place.id}`}
          identifier={place.id}
          coordinate={place.coordinates}
          accessibilityLabel={`${place.name}, ${t(`map.categories.${place.category}`)}`}
          pinColor={colors.primary}
          tracksViewChanges={false}
          onPress={() => onSelectPlace(place)}
        />
      ))}
      {searchTarget ? (
        <Marker
          testID="search-marker"
          coordinate={searchTarget.coordinates}
          accessibilityLabel={t('map.searchResultA11y', { name: searchTarget.name })}
          pinColor={colors.danger}
          tracksViewChanges={false}
        />
      ) : null}
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          testID={`custom-marker-${pin.id}`}
          identifier={pin.id}
          coordinate={pin.coordinates}
          accessibilityLabel={t('map.pinA11y', { label: formatPinLabel(pin.coordinates) })}
          pinColor={colors.secondary}
          tracksViewChanges={false}
          onPress={() => onSelectPin(pin)}
        />
      ))}
    </MapView>
  );
}
