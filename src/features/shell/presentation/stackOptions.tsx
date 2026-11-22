import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ConnectivityIndicator } from '@/features/sync/presentation/components/ConnectivityIndicator';

import { DrawerMenuButton } from './components/DrawerMenuButton';

function TabRootHeaderLeft() {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.headerLeft, { gap: spacing.xs }]}>
      <DrawerMenuButton />
      <ConnectivityIndicator />
    </View>
  );
}

/**
 * Header options for the first screen of every main destination: large title, the
 * drawer menu button and, while offline (or just back online), the connectivity pill.
 */
export const tabRootOptions = {
  headerLargeTitle: true,
  headerLeft: () => <TabRootHeaderLeft />,
} as const;

const styles = StyleSheet.create({
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
});
