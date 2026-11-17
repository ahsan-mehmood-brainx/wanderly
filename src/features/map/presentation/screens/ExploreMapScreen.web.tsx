import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

/** react-native-maps has no web support: the web build explains where the map is available. */
export function ExploreMapScreen() {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="map"
      title={t('map.unavailable.webTitle')}
      message={t('map.unavailable.webMessage')}
      testID="explore-map-web"
    />
  );
}
