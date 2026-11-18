import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

/** Budget overview. Expense tracking arrives with its own feature; until then, an honest empty state. */
export function BudgetScreen() {
  const { t } = useTranslation();
  return <AppEmptyView fullScreen icon="wallet" title={t('budget.emptyTitle')} message={t('budget.emptyMessage')} />;
}
