import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

import { routes } from './routes';

/** Shown by a route whose URL parameters fail validation (truncated or tampered links). */
export function InvalidLinkView() {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="link"
      title={t('links.invalidTitle')}
      message={t('links.invalidMessage')}
      actionLabel={t('links.goHome')}
      onAction={() => router.replace(routes.home)}
    />
  );
}
