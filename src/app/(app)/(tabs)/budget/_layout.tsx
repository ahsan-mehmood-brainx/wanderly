import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabRootOptions } from '@/features/shell/presentation/stackOptions';

/** A deep link to a trip's budget or an expense still gets the Budget tab underneath it. */
export const unstable_settings = { initialRouteName: 'index' };

export default function BudgetStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ ...tabRootOptions, title: t('navigation.budget') }} />
      <Stack.Screen name="[tripId]/index" options={{ title: t('budget.tripTitle') }} />
      <Stack.Screen name="[tripId]/expenses/index" options={{ title: t('budget.historyTitle') }} />
      <Stack.Screen name="[tripId]/expenses/new" options={{ title: t('budget.newExpense') }} />
      <Stack.Screen name="[tripId]/expenses/[expenseId]/index" options={{ title: t('budget.expenseTitle') }} />
      <Stack.Screen name="[tripId]/expenses/[expenseId]/edit" options={{ title: t('budget.editExpense') }} />
      <Stack.Screen name="[tripId]/breakdown" options={{ title: t('budget.breakdownTitle') }} />
    </Stack>
  );
}
