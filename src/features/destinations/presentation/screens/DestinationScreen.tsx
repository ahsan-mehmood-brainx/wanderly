import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

interface DestinationScreenProps {
  /** Already validated by the route. */
  readonly destinationId: string;
}

/** Deep-link target for `/destinations/:destinationId`. */
export function DestinationScreen({ destinationId }: DestinationScreenProps) {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="location"
      title={t('destinations.title')}
      message={t('destinations.message', { id: destinationId })}
      testID="destination-screen"
    />
  );
}
