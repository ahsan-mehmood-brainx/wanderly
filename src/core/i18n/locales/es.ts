import { type TranslationResources } from './en';

export const es: TranslationResources = {
  common: {
    appName: 'Wanderly',
    dismiss: 'Cerrar',
    tryAgain: 'Reintentar',
    loading: 'Cargando',
    close: 'Cerrar',
    back: 'Atrás',
    clearText: 'Borrar texto',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
  },
  errors: {
    unexpectedTitle: 'Algo salió mal',
    unexpectedMessage: 'Se produjo un error inesperado. Inténtalo de nuevo.',
    offlineTitle: 'No tienes conexión',
    kind: {
      storage: 'No pudimos acceder a los datos guardados en este dispositivo.',
      network: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      offline: 'Conéctate a internet e inténtalo de nuevo.',
      timeout: 'Esto está tardando más de lo esperado. Inténtalo de nuevo.',
      cancelled: 'La solicitud se canceló.',
      unauthorized: 'No pudimos verificar el acceso a este servicio.',
      forbidden: 'No tienes acceso a este contenido.',
      notFound: 'No encontramos lo que buscabas.',
      rateLimited: 'Hay demasiadas solicitudes en este momento. Espera un momento e inténtalo de nuevo.',
      badRequest: 'Algo en esta solicitud no era correcto. Inténtalo de nuevo.',
      server: 'El servicio tiene problemas en este momento. Inténtalo más tarde.',
      parse: 'Recibimos una respuesta inesperada. Inténtalo más tarde.',
      unknown: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
    },
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
    developer: {
      title: 'Desarrollo',
      designSystem: 'Sistema de diseño',
    },
  },
};
