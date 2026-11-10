import { Redirect } from 'expo-router';
import { type ComponentType } from 'react';

import type * as DesignSystemModule from '@/features/design-system/presentation/screens/DesignSystemScreen';

/*
 * Development-only route. The screen is required inside the `__DEV__` branch
 * (not imported statically) so Metro drops the whole catalogue from release
 * bundles; there, the route only redirects back to Settings.
 */
const DesignSystemScreen: ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/design-system/presentation/screens/DesignSystemScreen') as typeof DesignSystemModule)
      .DesignSystemScreen
  : null;

export default function DesignSystemRoute() {
  if (!DesignSystemScreen) return <Redirect href="/settings" />;
  return <DesignSystemScreen />;
}
