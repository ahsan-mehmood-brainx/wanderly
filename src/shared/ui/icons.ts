import { type SymbolViewProps } from 'expo-symbols';

type PlatformSymbolNames = Exclude<SymbolViewProps['name'], string>;
type SFSymbolName = NonNullable<PlatformSymbolNames['ios']>;
type MaterialSymbolName = NonNullable<PlatformSymbolNames['android']>;

interface IconDefinition {
  readonly ios: SFSymbolName;
  readonly android: MaterialSymbolName;
  readonly web: MaterialSymbolName;
}

/** SF Symbol on iOS, Material Symbol on Android and web. Both names are type-checked. */
const icon = (ios: SFSymbolName, android: MaterialSymbolName): IconDefinition => ({ ios, android, web: android });

/**
 * The app's icon vocabulary. Components refer to icons by meaning (`back`,
 * `favorite`), and each platform renders its own native glyph. Add new icons
 * here rather than passing raw symbol names around.
 */
export const icons = {
  add: icon('plus', 'add'),
  back: icon('chevron.left', 'arrow_back'),
  bookmark: icon('bookmark', 'bookmark'),
  calendar: icon('calendar', 'calendar_today'),
  check: icon('checkmark', 'check'),
  checkCircle: icon('checkmark.circle.fill', 'check_circle'),
  chevronDown: icon('chevron.down', 'expand_more'),
  chevronRight: icon('chevron.right', 'chevron_right'),
  clear: icon('xmark.circle.fill', 'cancel'),
  close: icon('xmark', 'close'),
  error: icon('exclamationmark.circle', 'error'),
  explore: icon('safari', 'explore'),
  eye: icon('eye', 'visibility'),
  eyeOff: icon('eye.slash', 'visibility_off'),
  favorite: icon('heart', 'favorite'),
  filter: icon('line.3.horizontal.decrease', 'tune'),
  flight: icon('airplane', 'flight'),
  home: icon('house', 'home'),
  image: icon('photo', 'image'),
  inbox: icon('tray', 'inbox'),
  info: icon('info.circle', 'info'),
  location: icon('mappin.and.ellipse', 'location_on'),
  luggage: icon('suitcase', 'luggage'),
  map: icon('map', 'map'),
  more: icon('ellipsis', 'more_horiz'),
  notifications: icon('bell', 'notifications'),
  offline: icon('wifi.slash', 'wifi_off'),
  person: icon('person', 'person'),
  refresh: icon('arrow.clockwise', 'refresh'),
  search: icon('magnifyingglass', 'search'),
  settings: icon('gearshape', 'settings'),
  share: icon('square.and.arrow.up', 'share'),
  star: icon('star.fill', 'star'),
  warning: icon('exclamationmark.triangle', 'warning'),
} as const satisfies Record<string, IconDefinition>;

export type AppIconName = keyof typeof icons;
