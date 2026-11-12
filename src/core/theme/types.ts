export type ColorScheme = 'light' | 'dark';

/**
 * Semantic colour roles. Components reference roles, never raw hex values, so
 * both schemes (and any future brand refresh) change in one place.
 *
 * `on*` roles are the foreground to use on top of the matching fill.
 */
export interface ThemeColors {
  // Canvas
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly surfacePressed: string;
  readonly overlay: string;

  // Content
  readonly text: string;
  readonly textSecondary: string;
  /** Placeholders and de-emphasised metadata. Meets AA on `background` and `surface`. */
  readonly textTertiary: string;
  readonly textInverse: string;

  // Lines
  readonly border: string;
  readonly borderStrong: string;

  // Brand
  readonly primary: string;
  readonly primaryPressed: string;
  readonly primaryMuted: string;
  readonly onPrimary: string;
  readonly secondary: string;
  readonly secondaryPressed: string;
  readonly onSecondary: string;

  // Status
  readonly success: string;
  readonly successSurface: string;
  readonly warning: string;
  readonly warningSurface: string;
  readonly info: string;
  readonly infoSurface: string;
  readonly danger: string;
  readonly dangerPressed: string;
  readonly dangerSurface: string;
  readonly onDanger: string;

  /** Base colour for `boxShadow` tokens. */
  readonly shadow: string;
}
