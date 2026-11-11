import { DrawerMenuButton } from './components/DrawerMenuButton';

/** Header options for the first screen of every main destination: large title plus the drawer menu button. */
export const tabRootOptions = {
  headerLargeTitle: true,
  headerLeft: () => <DrawerMenuButton />,
} as const;
