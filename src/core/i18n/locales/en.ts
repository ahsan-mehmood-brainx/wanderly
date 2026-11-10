export const en = {
  common: {
    appName: 'Wanderly',
    dismiss: 'Dismiss',
    tryAgain: 'Try again',
    loading: 'Loading',
    close: 'Close',
    back: 'Back',
    clearText: 'Clear text',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  errors: {
    unexpectedTitle: 'Something went wrong',
    unexpectedMessage: 'An unexpected error occurred. Please try again.',
    offlineTitle: "You're offline",
    kind: {
      storage: "We couldn't access data saved on this device.",
      network: "We couldn't reach the server. Check your connection and try again.",
      offline: 'Connect to the internet and try again.',
      timeout: 'This is taking longer than expected. Please try again.',
      cancelled: 'The request was cancelled.',
      unauthorized: "We couldn't verify access to this service.",
      forbidden: "You don't have access to this content.",
      notFound: "We couldn't find what you were looking for.",
      rateLimited: 'Too many requests right now. Please wait a moment and try again.',
      badRequest: "Something about this request wasn't right. Please try again.",
      server: 'The service is having trouble right now. Please try again later.',
      parse: 'We received an unexpected response. Please try again later.',
      unknown: 'An unexpected error occurred. Please try again.',
    },
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
    developer: {
      title: 'Developer',
      designSystem: 'Design system',
    },
  },
} as const;

type DeepStringRecord<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> };

/** Shape every locale must implement; missing or extra keys are compile errors. */
export type TranslationResources = DeepStringRecord<typeof en>;
