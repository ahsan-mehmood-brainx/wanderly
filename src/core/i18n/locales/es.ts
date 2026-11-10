import { type TranslationResources } from './en';

export const es: TranslationResources = {
  common: {
    appName: 'Wanderly',
    dismiss: 'Cerrar',
    tryAgain: 'Reintentar',
  },
  errors: {
    unexpectedTitle: 'Algo salió mal',
    unexpectedMessage: 'Se produjo un error inesperado. Inténtalo de nuevo.',
  },
  tabs: {
    explore: 'Explorar',
    settings: 'Ajustes',
  },
  explore: {
    title: 'Explorar',
    greeting: {
      morning: 'Buenos días',
      afternoon: 'Buenas tardes',
      evening: 'Buenas noches',
    },
    headline: '¿A dónde vamos ahora?',
    subtitle: 'Descubre destinos, planifica viajes y ten lo esencial de tus viajes en un solo lugar.',
  },
  settings: {
    title: 'Ajustes',
    appearance: {
      title: 'Apariencia',
      system: 'Sistema',
      systemHint: 'Igual que tu dispositivo',
      light: 'Claro',
      dark: 'Oscuro',
    },
    language: {
      title: 'Idioma',
      system: 'Idioma del dispositivo',
      systemHint: 'Actualmente {{language}}',
    },
    saveError: 'No pudimos guardar este cambio. Se aplicará hasta que cierres la app.',
  },
};
