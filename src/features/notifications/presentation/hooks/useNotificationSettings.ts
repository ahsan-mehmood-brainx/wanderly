import { useCallback, useEffect, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationSettingsChanges,
} from '../../domain/NotificationSettings';
import { useSessionReconcile } from './useSessionReconcile';

export interface NotificationSettingsState {
  /** `null` while the stored settings are read. */
  readonly settings: NotificationSettings | null;
  /** The stored settings couldn't be read; the defaults are shown. */
  readonly loadFailed: boolean;
  readonly saveFailed: boolean;
  readonly update: (changes: NotificationSettingsChanges) => void;
  readonly dismissSaveError: () => void;
}

/**
 * Reminder times for the settings screen. A change shows at once, is saved, and
 * then reconciles so the new fire times apply. A failed save puts back what is stored.
 */
export function useNotificationSettings(): NotificationSettingsState {
  const { getNotificationSettings, saveNotificationSettings } = useDependencies();
  const reconcile = useSessionReconcile();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const mounted = useRef(true);
  // The most recent save started; saves run one at a time, so once it settles the store is final.
  const latestSave = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    void getNotificationSettings.execute().then((result) => {
      if (!mounted.current) return;
      setSettings(result.ok ? result.value : DEFAULT_NOTIFICATION_SETTINGS);
      setLoadFailed(!result.ok);
    });
    return () => {
      mounted.current = false;
    };
  }, [getNotificationSettings]);

  /** Shows what is stored once every save started so far has settled, so a later successful change isn't undone. */
  const showStored = useCallback(async () => {
    for (;;) {
      const awaited = latestSave.current;
      await awaited;
      const stored = await getNotificationSettings.execute();
      if (!mounted.current) return;
      if (awaited !== latestSave.current) continue;
      if (stored.ok) setSettings(stored.value);
      return;
    }
  }, [getNotificationSettings]);

  const update = useCallback(
    (changes: NotificationSettingsChanges) => {
      setSettings((current) => (current ? { ...current, ...changes } : current));
      setSaveFailed(false);
      const saving = saveNotificationSettings.execute(changes);
      latestSave.current = saving;
      void saving.then(async (result) => {
        if (result.ok) {
          reconcile('settings');
          return;
        }
        if (!mounted.current) return;
        setSaveFailed(true);
        await showStored();
      });
    },
    [saveNotificationSettings, reconcile, showStored],
  );

  const dismissSaveError = useCallback(() => setSaveFailed(false), []);

  return { settings, loadFailed, saveFailed, update, dismissSaveError };
}
