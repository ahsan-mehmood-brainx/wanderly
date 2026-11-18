import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts, type FontFamilyDefinition } from 'expo-font';

import { FONT_FAMILY } from './tokens';

/**
 * One family with one face per weight, so styles select faces with
 * `fontWeight` (as with system fonts) instead of per-weight family names.
 * Only the weights used by the type scale are bundled.
 */
const interFamily: FontFamilyDefinition[] = [
  {
    fontFamily: FONT_FAMILY,
    fontDefinitions: [
      { path: Inter_400Regular, weight: 400, style: 'normal' },
      { path: Inter_500Medium, weight: 500, style: 'normal' },
      { path: Inter_600SemiBold, weight: 600, style: 'normal' },
      { path: Inter_700Bold, weight: 700, style: 'normal' },
    ],
  },
];

/**
 * Loads the app typeface at runtime (works in Expo Go and development builds).
 * Returns `true` once loading has finished. If loading fails the app still
 * starts and falls back to the platform font, and `error` is set.
 */
export function useAppFonts(): { readonly done: boolean; readonly error: Error | null } {
  const [loaded, error] = useFonts(interFamily);
  return { done: loaded || error !== null, error };
}
