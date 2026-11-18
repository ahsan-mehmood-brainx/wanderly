import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';

import { AppIconButton } from '@/shared/ui';

/**
 * Header button that opens the main drawer. The action bubbles up from the tab's
 * stack through the tabs navigator to the drawer, so it works from any tab root.
 */
export function DrawerMenuButton() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  return (
    <AppIconButton
      icon="menu"
      accessibilityLabel={t('navigation.openMenu')}
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      testID="open-drawer"
    />
  );
}
