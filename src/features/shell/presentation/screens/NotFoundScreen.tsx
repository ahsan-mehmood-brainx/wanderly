import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { routes } from '@/shared/navigation/routes';
import { AppEmptyView } from '@/shared/ui';

/** Unknown paths (mistyped or outdated links). "Home" lands on sign-in when signed out: the guards decide. */
export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="map"
      title={t('links.notFoundTitle')}
      message={t('links.notFoundMessage')}
      actionLabel={t('links.goHome')}
      onAction={() => router.replace(routes.home)}
    />
  );
}
