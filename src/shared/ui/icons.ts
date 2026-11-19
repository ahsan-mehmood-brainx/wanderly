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
  area: icon('square.dashed', 'square_foot'),
  at: icon('at', 'alternate_email'),
  back: icon('chevron.left', 'arrow_back'),
  beach: icon('beach.umbrella', 'beach_access'),
  bookmark: icon('bookmark', 'bookmark'),
  calendar: icon('calendar', 'calendar_today'),
  car: icon('car', 'directions_car'),
  check: icon('checkmark', 'check'),
  checkCircle: icon('checkmark.circle.fill', 'check_circle'),
  chevronDown: icon('chevron.down', 'expand_more'),
  chevronLeft: icon('chevron.left', 'chevron_left'),
  chevronRight: icon('chevron.right', 'chevron_right'),
  city: icon('building.2', 'location_city'),
  clear: icon('xmark.circle.fill', 'cancel'),
  clock: icon('clock', 'schedule'),
  close: icon('xmark', 'close'),
  culture: icon('building.columns', 'account_balance'),
  currency: icon('banknote', 'payments'),
  edit: icon('pencil', 'edit'),
  error: icon('exclamationmark.circle', 'error'),
  explore: icon('safari', 'explore'),
  externalLink: icon('arrow.up.right.square', 'open_in_new'),
  eye: icon('eye', 'visibility'),
  eyeOff: icon('eye.slash', 'visibility_off'),
  favorite: icon('heart', 'favorite'),
  filter: icon('line.3.horizontal.decrease', 'tune'),
  flag: icon('flag', 'flag'),
  flight: icon('airplane', 'flight'),
  globe: icon('globe', 'public'),
  history: icon('clock.arrow.circlepath', 'history'),
  home: icon('house', 'home'),
  image: icon('photo', 'image'),
  inbox: icon('tray', 'inbox'),
  info: icon('info.circle', 'info'),
  island: icon('sailboat', 'sailing'),
  language: icon('character.bubble', 'translate'),
  link: icon('link', 'link'),
  location: icon('mappin.and.ellipse', 'location_on'),
  lock: icon('lock', 'lock'),
  logout: icon('rectangle.portrait.and.arrow.right', 'logout'),
  luggage: icon('suitcase', 'luggage'),
  mail: icon('envelope', 'mail'),
  map: icon('map', 'map'),
  menu: icon('line.3.horizontal', 'menu'),
  more: icon('ellipsis', 'more_horiz'),
  mountain: icon('mountain.2', 'landscape'),
  nature: icon('leaf', 'park'),
  notifications: icon('bell', 'notifications'),
  offline: icon('wifi.slash', 'wifi_off'),
  people: icon('person.2', 'group'),
  person: icon('person', 'person'),
  phone: icon('phone', 'call'),
  pieChart: icon('chart.pie', 'pie_chart'),
  refresh: icon('arrow.clockwise', 'refresh'),
  restore: icon('arrow.uturn.backward', 'undo'),
  search: icon('magnifyingglass', 'search'),
  settings: icon('gearshape', 'settings'),
  share: icon('square.and.arrow.up', 'share'),
  sparkles: icon('sparkles', 'auto_awesome'),
  star: icon('star.fill', 'star'),
  timer: icon('timer', 'timer'),
  trash: icon('trash', 'delete'),
  trending: icon('chart.line.uptrend.xyaxis', 'trending_up'),
  wallet: icon('creditcard', 'account_balance_wallet'),
  warning: icon('exclamationmark.triangle', 'warning'),

  // Weather: conditions (filled glyphs read better at small sizes) and measurements.
  weatherClearDay: icon('sun.max.fill', 'sunny'),
  weatherClearNight: icon('moon.stars.fill', 'moon_stars'),
  weatherPartlyCloudyDay: icon('cloud.sun.fill', 'partly_cloudy_day'),
  weatherPartlyCloudyNight: icon('cloud.moon.fill', 'partly_cloudy_night'),
  weatherCloudy: icon('cloud.fill', 'cloud'),
  weatherFog: icon('cloud.fog.fill', 'foggy'),
  weatherDrizzle: icon('cloud.drizzle.fill', 'rainy_light'),
  weatherRain: icon('cloud.rain.fill', 'rainy'),
  weatherHeavyRain: icon('cloud.heavyrain.fill', 'rainy_heavy'),
  weatherSleet: icon('cloud.sleet.fill', 'weather_mix'),
  weatherSnow: icon('cloud.snow.fill', 'weather_snowy'),
  weatherThunderstorm: icon('cloud.bolt.rain.fill', 'thunderstorm'),
  weatherHail: icon('cloud.hail.fill', 'weather_hail'),
  weatherUnknown: icon('thermometer.medium', 'thermostat'),
  sunrise: icon('sunrise.fill', 'wb_twilight'),
  sunset: icon('sunset.fill', 'wb_twilight'),
  humidity: icon('humidity.fill', 'humidity_percentage'),
  wind: icon('wind', 'air'),
  thermometer: icon('thermometer.medium', 'thermostat'),
  umbrella: icon('umbrella.fill', 'umbrella'),
  raindrop: icon('drop.fill', 'water_drop'),
  uvIndex: icon('sun.max', 'light_mode'),
  arrowUp: icon('arrow.up', 'north'),
  myLocation: icon('location.fill', 'my_location'),

  // Explore map: place categories and map actions.
  attraction: icon('camera', 'photo_camera'),
  restaurant: icon('fork.knife', 'restaurant'),
  hotel: icon('bed.double', 'hotel'),
  museum: icon('building.columns', 'museum'),
  park: icon('tree', 'park'),
  landmark: icon('building.columns.circle', 'castle'),
  directions: icon('arrow.triangle.turn.up.right.diamond', 'directions'),
  pin: icon('mappin', 'push_pin'),

  // Itinerary: activity categories, completion and reordering.
  shopping: icon('bag', 'shopping_bag'),
  transport: icon('tram', 'tram'),
  entertainment: icon('theatermasks', 'theater_comedy'),
  circle: icon('circle', 'radio_button_unchecked'),
  dragHandle: icon('line.3.horizontal', 'drag_indicator'),
} as const satisfies Record<string, IconDefinition>;

export type AppIconName = keyof typeof icons;
