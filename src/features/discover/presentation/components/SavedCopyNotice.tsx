import { useTranslation } from 'react-i18next';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { formatAge } from '@/features/weather/presentation/format';
import { useConnectivity } from '@/shared/hooks/useConnectivity';
import { InlineMessage } from '@/shared/ui';

interface SavedCopyNoticeProps {
  /** `DestinationDetails.savedAt`: set when some of the information is a saved copy. */
  readonly savedAt: number | undefined;
}

/**
 * Says when a destination is shown from the copy saved on the device because it
 * couldn't be refreshed, and how old that copy is. Nothing for current data.
 */
export function SavedCopyNotice({ savedAt }: SavedCopyNoticeProps) {
  const { t } = useTranslation();
  const { clock } = useDependencies();
  const { isOffline } = useConnectivity();
  if (savedAt === undefined) return null;

  const age = formatAge(Math.max(0, clock.now() - savedAt), t);
  return (
    <InlineMessage
      tone="warning"
      icon={isOffline ? 'offline' : 'history'}
      title={t('destination.saved.title')}
      message={isOffline ? t('destination.saved.offline', { age }) : t('destination.saved.error', { age })}
      testID="destination-saved-notice"
    />
  );
}
