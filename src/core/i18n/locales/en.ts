export const en = {
  common: {
    appName: 'Wanderly',
    dismiss: 'Dismiss',
    tryAgain: 'Try again',
  },
  errors: {
    unexpectedTitle: 'Something went wrong',
    unexpectedMessage: 'An unexpected error occurred. Please try again.',
  },
  tabs: {
    explore: 'Explore',
    settings: 'Settings',
  },
  explore: {
    title: 'Explore',
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    headline: 'Where to next?',
    subtitle: 'Discover destinations, plan trips, and keep your travel essentials in one place.',
  },
  settings: {
    title: 'Settings',
    appearance: {
      title: 'Appearance',
      system: 'System',
      systemHint: 'Match your device setting',
      light: 'Light',
      dark: 'Dark',
    },
    language: {
      title: 'Language',
      system: 'Device language',
      systemHint: 'Currently {{language}}',
    },
    saveError: "We couldn't save this change. It will apply until you close the app.",
  },
} as const;

type DeepStringRecord<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> };

/** Shape every locale must implement; missing or extra keys are compile errors. */
export type TranslationResources = DeepStringRecord<typeof en>;
