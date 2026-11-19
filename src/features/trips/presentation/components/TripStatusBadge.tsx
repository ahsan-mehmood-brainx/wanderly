import { useTranslation } from 'react-i18next';

import { AppBadge, type AppIconName, type BadgeTone } from '@/shared/ui';

import { type TripStatus } from '../../domain/Trip';

const APPEARANCE: Record<TripStatus, { readonly tone: BadgeTone; readonly icon: AppIconName }> = {
  upcoming: { tone: 'info', icon: 'calendar' },
  ongoing: { tone: 'success', icon: 'flight' },
  completed: { tone: 'neutral', icon: 'check' },
  cancelled: { tone: 'danger', icon: 'close' },
};

export function TripStatusBadge({ status }: { readonly status: TripStatus }) {
  const { t } = useTranslation();
  return <AppBadge label={t(`trips.status.${status}`)} size="sm" {...APPEARANCE[status]} />;
}
