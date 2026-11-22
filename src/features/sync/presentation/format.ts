import { type TFunction } from 'i18next';

import { type ConnectivityState } from '@/core/network/ConnectivityService';

/** `512 KB`, `1.4 MB`, in the UI language. */
export function formatBytes(bytes: number, language: string): string {
  const megabytes = bytes >= 1_000_000;
  const value = megabytes ? bytes / 1_000_000 : Math.max(1, Math.round(bytes / 1_000));
  const unit = megabytes ? 'megabyte' : 'kilobyte';
  try {
    return new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value);
  } catch {
    // Engines without unit formatting.
    return `${Math.round(value * 10) / 10} ${megabytes ? 'MB' : 'KB'}`;
  }
}

/** NetInfo connection types with a translated label; others (`unknown`, `other`) show plain "Online". */
const CONNECTION_TYPES = ['wifi', 'cellular', 'ethernet', 'bluetooth', 'vpn', 'wimax'] as const;

/** "Online (Wi-Fi)", "Offline" or "Checking connection", in the UI language. */
export function describeConnection(state: ConnectivityState & { readonly isOffline: boolean }, t: TFunction): string {
  if (state.isOffline) return t('offline.screen.offline');
  if (state.isConnected === null) return t('offline.screen.checking');
  const type = CONNECTION_TYPES.find((candidate) => candidate === state.type);
  return type
    ? t('offline.screen.onlineVia', { type: t(`offline.screen.connectionTypes.${type}`) })
    : t('offline.screen.online');
}
