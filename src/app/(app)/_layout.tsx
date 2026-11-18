import { usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppDrawerContent } from '@/features/shell/presentation/components/AppDrawerContent';
import { isDrawerSwipeEnabled } from '@/features/shell/presentation/navigation';

/** Signed-in shell: a drawer around the bottom tabs, plus drawer-only destinations (Saved Places). */
export default function MainDrawerLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const pathname = usePathname();

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        // Each destination has its own native stack header (with the menu button).
        headerShown: false,
        drawerType: 'front',
        overlayColor: colors.overlay,
        drawerStyle: { backgroundColor: colors.surface },
        swipeEnabled: isDrawerSwipeEnabled(pathname),
      }}
    >
      <Drawer.Screen name="(tabs)" options={{ title: t('navigation.home') }} />
      <Drawer.Screen name="saved" options={{ title: t('navigation.savedPlaces') }} />
    </Drawer>
  );
}
